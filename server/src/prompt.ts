import type { ConvQuestion, ConvQuestionOption } from "./transcript.js";

// Reading a TUI's own output back is a last resort, and it's the right one here:
// while a question dialog is open its record hasn't been written to the
// transcript, so the pane is the only place the question exists. Parsing it into
// the same shape a transcript-parsed question produces means the app can render
// one native card either way — and because the pane marks the highlighted row,
// it's also the only way to know which option Enter would take.
//
// Everything here is best-effort by nature. The caller keeps the raw pane and
// falls back to it whenever this returns nothing, so a rendering change upstream
// costs the nice card, never the information.

// Rows that belong to the composer or the dialog's own key hints, not the question.
const CHROME = [
  /^chat about this/i,
  /^notes:/i,
  /press \w+ to (add|edit|see)/i,
  /^(esc|enter|tab|ctrl)\b.*\bto\b/i,
  /^[?>❯]\s*$/,
  /^\s*for shortcuts\s*$/i,
];
// The left edge of the preview panel, which shares its lines with the options.
const BOX_LEFT = /[┌│└├╭╰]/;
const BOX_TRIM = /^[┌│└├╭╰]|[┐│┘┤╮╯]$/g;
const RULE = /^[─━=_]{20,}$/;
const OPTION = /^(\s*)([❯>*]?)\s*(\d+)[.)]\s+(.*)$/;

const MAX_LABEL = 220;
const MAX_PREVIEW = 2500;
const MAX_QUESTION = 600;

export function parsePanePrompt(pane: string): ConvQuestion | undefined {
  const rows = pane.split("\n").map((l) => l.replace(/\s+$/, ""));
  const { left, preview } = splitColumns(rows);
  const { options, firstIndex, highlighted } = readOptions(left);
  // Two options is the floor for something that's genuinely a choice; one
  // numbered line is far more likely to be prose that happens to start with "1.".
  if (options.length < 2 || firstIndex < 0) return undefined;

  const { question, header } = readQuestion(left, firstIndex);
  if (!question || question.length < 8) return undefined;

  const built: ConvQuestionOption[] = options.map((o, index) => {
    const option: ConvQuestionOption = { label: clip(o.label, MAX_LABEL) };
    if (index === highlighted) {
      option.selected = true;
      // The panel shows the highlighted option's preview, so it belongs to that
      // one. Cut off at the viewport's edge, like everything else read this way.
      if (preview) option.preview = clip(preview, MAX_PREVIEW);
    }
    return option;
  });

  const result: ConvQuestion = { question: clip(question, MAX_QUESTION), options: built };
  if (header) result.header = header;
  return result;
}

/// Which option Enter would take right now, or undefined if the pane doesn't say.
export function highlightedIndex(pane: string): number | undefined {
  const { left } = splitColumns(pane.split("\n").map((l) => l.replace(/\s+$/, "")));
  const { options, highlighted } = readOptions(left);
  return options.length >= 2 && highlighted >= 0 ? highlighted : undefined;
}

/// The dialog is two columns when an option carries a preview: options on the
/// left, the preview panel on the right, sharing every line. Split at the
/// panel's left border so neither half is read as part of the other.
function splitColumns(rows: string[]): { left: string[]; preview?: string } {
  let boxLeft = Infinity;
  let firstBoxRow = -1;
  let lastBoxRow = -1;
  rows.forEach((row, i) => {
    const at = row.search(BOX_LEFT);
    if (at <= 0) return;
    boxLeft = Math.min(boxLeft, at);
    if (firstBoxRow < 0) firstBoxRow = i;
    lastBoxRow = i;
  });
  if (!Number.isFinite(boxLeft)) return { left: rows };

  const previewRows: string[] = [];
  const left = rows.map((row, i) => {
    // Only rows the panel actually spans are two columns. Cutting every row at
    // the panel's left edge would slice the question — which sits above the
    // panel and runs the full width — straight down the middle.
    if (i < firstBoxRow || i > lastBoxRow) return row;
    if (row.length > boxLeft) {
      const inner = row.slice(boxLeft).replace(BOX_TRIM, "").replace(/[─━]/g, "").trimEnd();
      // Keep interior blank lines: they're paragraph breaks in the preview.
      if (inner.trim() || previewRows.length) previewRows.push(inner.replace(/^\s/, ""));
    }
    return row.slice(0, boxLeft).replace(/\s+$/, "");
  });
  while (previewRows.length && !previewRows[previewRows.length - 1].trim()) previewRows.pop();
  return { left, preview: previewRows.join("\n").trim() || undefined };
}

function readOptions(rows: string[]): { options: { label: string }[]; firstIndex: number; highlighted: number } {
  const options: { label: string }[] = [];
  const indents: number[] = [];
  let firstIndex = -1;
  let highlighted = -1;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const match = row.match(OPTION);
    if (match) {
      if (firstIndex < 0) firstIndex = i;
      if (match[2]) highlighted = options.length;
      options.push({ label: match[4].trim() });
      // Where the label text starts, so a wrapped continuation can be told from
      // the next thing down the pane.
      indents.push(row.indexOf(match[4]));
      continue;
    }
    if (!options.length || !row.trim() || isChrome(row)) continue;
    const lead = row.search(/\S/);
    if (lead >= indents[indents.length - 1]) {
      // A label too long for the column, continued on the next line.
      options[options.length - 1].label += ` ${row.trim()}`;
    }
  }
  return { options, firstIndex, highlighted };
}

/// The question is the block of text immediately above the options; a short line
/// above that is the dialog's header. Bounded so prior conversation still visible
/// in the pane can't be swallowed into it.
function readQuestion(rows: string[], firstOptionIndex: number): { question?: string; header?: string } {
  let i = firstOptionIndex - 1;
  while (i >= 0 && !rows[i].trim()) i--;
  const block: string[] = [];
  while (i >= 0 && rows[i].trim() && !RULE.test(rows[i].trim()) && block.length < 4) {
    if (isChrome(rows[i])) break;
    block.unshift(stripDecoration(rows[i]));
    i--;
  }
  if (!block.length) return {};
  const question = block.join(" ").replace(/\s+/g, " ").trim();

  let header: string | undefined;
  while (i >= 0 && !rows[i].trim()) i--;
  if (i >= 0 && rows[i].trim() && !RULE.test(rows[i].trim())) {
    const candidate = stripDecoration(rows[i]);
    // Headers are short labels — not sentences, and not the command a permission
    // prompt echoes above its question, which is what a looser test picked up.
    const words = candidate.split(/\s+/).length;
    if (
      candidate.length > 0 &&
      candidate.length < 40 &&
      words <= 5 &&
      !/[.?!]$/.test(candidate) &&
      !/[/|]|--/.test(candidate)
    ) {
      header = candidate;
    }
  }
  return { question, header };
}

function stripDecoration(row: string): string {
  return row.replace(/^[\s│┃▌|>❯*□◻●◆·-]+/, "").replace(/[\s│┃▐|]+$/, "").trim();
}

function isChrome(row: string): boolean {
  const trimmed = row.trim();
  return CHROME.some((pattern) => pattern.test(trimmed));
}

function clip(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? trimmed.slice(0, max) + "…" : trimmed;
}
