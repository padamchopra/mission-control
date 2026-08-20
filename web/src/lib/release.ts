/// GitHub is where Remy ships. The desktop app compares its own version to the
/// latest published release and offers the DMG when that release is newer.

export const REMY_VERSION = import.meta.env.VITE_REMY_VERSION ?? "0.1.0";
export const REMY_REPO = "padamchopra/remy";

export interface RemyRelease {
  version: string;
  notes?: string;
  pageUrl: string;
  downloadUrl?: string;
}

/// Whether this copy was built here rather than shipped by CI.
///
/// The release workflow stamps `{major}.{minor}.{run}` from the CI run number,
/// which is always 1 or more, so a patch of 0 is a version no release ever had.
/// A dev server is local by definition. Either way there is nothing to update
/// to: the newest GitHub release is not this build.
export function isLocalBuild(version: string): boolean {
  if (import.meta.env.DEV) return true;
  return (parts(version)[2] ?? 0) === 0;
}

export function isNewer(latest: string, current: string): boolean {
  const left = parts(latest);
  const right = parts(current);
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta !== 0) return delta > 0;
  }
  return false;
}

/// GitHub's generated notes name the author and link the PR on every line,
/// which is most of the width and none of the news. The heading it adds is the
/// card's title anyway, and the compare link belongs on the release page.
export function summarizeNotes(notes: string | undefined): string | undefined {
  if (!notes) return undefined;
  const trimmed = notes
    .split("\n")
    .filter((line) => !/^\s*\*\*Full Changelog\*\*/.test(line))
    .filter((line) => !/^\s*##\s*What's Changed\s*$/i.test(line))
    .map((line) => line.replace(/\s+by\s+@[\w-]+\s+in\s+https?:\/\/\S+/i, ""))
    .join("\n")
    .trim();
  return trimmed || undefined;
}

/// Every release newer than `current`, newest first — what you would be getting,
/// not just what the newest one changed.
export async function fetchReleasesSince(current: string): Promise<RemyRelease[]> {
  const response = await fetch(`https://api.github.com/repos/${REMY_REPO}/releases?per_page=30`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `Remy/${REMY_VERSION}` },
  });
  if (!response.ok) throw new Error("Couldn't reach the update feed.");
  const body = (await response.json()) as {
    tag_name?: string;
    html_url?: string;
    body?: string;
    draft?: boolean;
    prerelease?: boolean;
    assets?: { name?: string; browser_download_url?: string }[];
  }[];

  return body
    .filter((entry) => !entry.draft && !entry.prerelease)
    .map((entry) => toRelease(entry))
    .filter((release): release is RemyRelease => Boolean(release) && isNewer(release!.version, current))
    .sort((a, b) => (isNewer(a.version, b.version) ? -1 : 1));
}

function toRelease(body: {
  tag_name?: string;
  html_url?: string;
  body?: string;
  assets?: { name?: string; browser_download_url?: string }[];
}): RemyRelease | undefined {
  const version = (body.tag_name ?? "").replace(/^v/i, "").trim();
  if (!version) return undefined;
  const dmg = body.assets?.find((asset) => asset.name?.toLowerCase().endsWith(".dmg"));
  return {
    version,
    notes: body.body?.trim() || undefined,
    pageUrl: body.html_url || `https://github.com/${REMY_REPO}/releases/latest`,
    downloadUrl: dmg?.browser_download_url,
  };
}

export async function fetchLatestRelease(): Promise<RemyRelease | undefined> {
  const response = await fetch(`https://api.github.com/repos/${REMY_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": `Remy/${REMY_VERSION}` },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error("Couldn't reach the update feed.");
  const body = (await response.json()) as {
    tag_name?: string;
    html_url?: string;
    body?: string;
    assets?: { name?: string; browser_download_url?: string }[];
  };
  const version = (body.tag_name ?? "").replace(/^v/i, "").trim();
  if (!version) return undefined;
  const dmg = body.assets?.find((asset) => asset.name?.toLowerCase().endsWith(".dmg"));
  return {
    version,
    notes: body.body?.trim() || undefined,
    pageUrl: body.html_url || `https://github.com/${REMY_REPO}/releases/latest`,
    downloadUrl: dmg?.browser_download_url,
  };
}

function parts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.+-]/)
    .map((piece) => Number.parseInt(piece, 10) || 0);
}
