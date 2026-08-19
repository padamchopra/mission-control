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
