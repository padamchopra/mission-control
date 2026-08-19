import { readdir, readFile, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { homedir } from "node:os";
import { basename, join, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const MAX_RESULTS = 80;
const MAX_DEPTH = 8;
const MAX_SCAN = 6000;
const DISCOVERY_CACHE_TTL_MS = 30_000;
const IGNORED_DIRECTORIES = new Set([
  ".git", ".build", ".next", ".swiftpm", "build", "deriveddata", "dist",
  "node_modules", "pods", "vendor",
]);
const SECRET_FILE = /(^|\/)(\.env(?:\.|$)|.*\.(?:key|pem|p12|mobileprovision))$/i;
const projectRootCache = new Map<string, { root: string; at: number }>();
const skillCache = new Map<string, { skills: SkillSuggestion[]; at: number }>();
const fileListCache = new Map<string, { files: string[]; at: number }>();

export type FileSuggestion = { path: string };
export type SkillSuggestion = { name: string; description: string | null; source: "Project" | "Personal" };

/**
 * Lists taggable project files relative to the active pane's directory, ranked
 * by how well each matches the query. The candidate list comes from `git
 * ls-files` when possible (no depth limit, honours .gitignore) and falls back to
 * a bounded directory walk otherwise. Obvious credential files are always hidden:
 * the picker should help the agent, not turn into a secret-file browser.
 */
export async function findProjectFiles(
  root: string,
  query: string,
  opts?: { match?: (path: string) => boolean },
): Promise<FileSuggestion[]> {
  root = await projectRoot(root);
  const needle = query.trim().toLowerCase();
  const candidates = await listCandidateFiles(root);

  const scored: Array<{ path: string; score: number }> = [];
  for (const path of candidates) {
    if (opts?.match && !opts.match(path)) continue;
    if (SECRET_FILE.test(path)) continue;
    const score = matchScore(path.toLowerCase(), needle);
    if (score < 0) continue;
    scored.push({ path, score });
  }

  // Highest relevance first; then prefer shorter (shallower) paths, then A→Z so
  // the ordering is stable across requests.
  scored.sort((a, b) =>
    b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path),
  );
  return scored.slice(0, MAX_RESULTS).map(({ path }) => ({ path }));
}

async function listCandidateFiles(root: string): Promise<string[]> {
  const cached = fileListCache.get(root);
  if (cached && Date.now() - cached.at < DISCOVERY_CACHE_TTL_MS) return cached.files;
  const files = (await gitFiles(root)) ?? (await walkFiles(root));
  fileListCache.set(root, { files, at: Date.now() });
  return files;
}

// Tracked plus untracked-but-not-ignored files, repo-root-relative. NUL-delimited
// so paths with spaces/newlines survive. Returns null when this isn't a git repo.
async function gitFiles(root: string): Promise<string[] | null> {
  try {
    const { stdout } = await exec(
      "git",
      ["-C", root, "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const files = stdout.split("\0").filter(Boolean);
    return files.length ? files : null;
  } catch {
    return null;
  }
}

async function walkFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || out.length >= MAX_SCAN) return;
    let entries: Dirent<string>[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= MAX_SCAN) return;
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name.toLowerCase())) await walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        out.push(relative(root, fullPath));
      }
    }
  }
  await walk(root, 0);
  return out;
}

// Ranks a lowercased path against a lowercased needle. Filename matches beat path
// matches, prefixes beat interior hits, and a subsequence ("mdtext" → MarkdownText)
// is the last resort. A negative score means "no match, drop it".
function matchScore(path: string, needle: string): number {
  if (!needle) return 0;
  const name = path.slice(path.lastIndexOf("/") + 1);
  if (name === needle) return 100;
  const nameIdx = name.indexOf(needle);
  if (nameIdx === 0) return 90;
  if (nameIdx > 0) return 70;
  const pathIdx = path.indexOf(needle);
  if (pathIdx >= 0) return pathIdx === 0 || path[pathIdx - 1] === "/" ? 50 : 40;
  if (isSubsequence(needle, name)) return 20;
  if (isSubsequence(needle, path)) return 10;
  return -1;
}

function isSubsequence(needle: string, haystack: string): boolean {
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** Searches project-local skills before a user's installed skills. */
export async function findSkills(root: string, query: string): Promise<SkillSuggestion[]> {
  root = await projectRoot(root);
  const cached = skillCache.get(root);
  const skills = cached && Date.now() - cached.at < DISCOVERY_CACHE_TTL_MS
    ? cached.skills
    : await discoverSkills(root);
  const needle = query.trim().toLowerCase();
  return skills
    .filter((skill) => !needle || `${skill.name} ${skill.description ?? ""}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MAX_RESULTS);
}

async function discoverSkills(root: string): Promise<SkillSuggestion[]> {
  const sources: Array<{ path: string; source: SkillSuggestion["source"] }> = [
    { path: join(root, ".claude", "skills"), source: "Project" },
    { path: join(root, ".agents", "skills"), source: "Project" },
    { path: join(root, ".codex", "skills"), source: "Project" },
    { path: join(homedir(), ".claude", "skills"), source: "Personal" },
    { path: join(homedir(), ".codex", "skills"), source: "Personal" },
    { path: join(homedir(), ".agents", "skills"), source: "Personal" },
  ];
  const found = new Map<string, SkillSuggestion>();

  for (const source of sources) {
    for (const path of await skillFiles(source.path)) {
      const skill = await readSkill(path, source.source);
      if (!skill || found.has(skill.name)) continue;
      found.set(skill.name, skill);
    }
  }

  const skills = [...found.values()];
  skillCache.set(root, { skills, at: Date.now() });
  return skills;
}

async function skillFiles(directory: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isFile() && entry.name === "SKILL.md") paths.push(fullPath);
    if (!entry.name.startsWith(".") && await isDirectory(entry, fullPath)) {
      paths.push(...await skillFiles(fullPath, depth + 1));
    }
  }
  return paths;
}

async function isDirectory(entry: Dirent<string>, path: string): Promise<boolean> {
  if (entry.isDirectory()) return true;
  if (!entry.isSymbolicLink()) return false;
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function projectRoot(cwd: string): Promise<string> {
  const cached = projectRootCache.get(cwd);
  if (cached && Date.now() - cached.at < DISCOVERY_CACHE_TTL_MS) return cached.root;
  try {
    const { stdout } = await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"]);
    const root = stdout.trim() || cwd;
    projectRootCache.set(cwd, { root, at: Date.now() });
    return root;
  } catch {
    projectRootCache.set(cwd, { root: cwd, at: Date.now() });
    return cwd;
  }
}

async function readSkill(path: string, source: SkillSuggestion["source"]): Promise<SkillSuggestion | null> {
  try {
    const text = await readFile(path, "utf8");
    const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] ?? "";
    const name = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() || basename(join(path, ".."));
    const description = frontmatter.match(/^description:\s*(.+)$/m)?.[1]?.trim() ?? null;
    return { name, description, source };
  } catch {
    return null;
  }
}
