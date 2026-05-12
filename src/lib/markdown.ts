import { escapeMarkdownV2 } from "./telegram";

type Token =
  | { type: "plain"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "link"; text: string; url: string };

const INLINE_RE = /\*\*([^*]+?)\*\*|\[([^\]]+?)\]\(([^)]+?)\)|_([^_\n]+?)_/g;

function tokenizeInline(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: "plain", text: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: "bold", text: m[1] });
    else if (m[2] !== undefined && m[3] !== undefined) tokens.push({ type: "link", text: m[2], url: m[3] });
    else if (m[4] !== undefined) tokens.push({ type: "italic", text: m[4] });
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) tokens.push({ type: "plain", text: text.slice(last) });
  return tokens;
}

function escapeUrl(url: string): string {
  return url.replace(/[)\\]/g, (m) => "\\" + m);
}

function renderInline(text: string): string {
  return tokenizeInline(text)
    .map((tok) => {
      switch (tok.type) {
        case "plain":
          return escapeMarkdownV2(tok.text);
        case "bold":
          return `*${escapeMarkdownV2(tok.text)}*`;
        case "italic":
          return `_${escapeMarkdownV2(tok.text)}_`;
        case "link":
          return `[${escapeMarkdownV2(tok.text)}](${escapeUrl(tok.url)})`;
      }
    })
    .join("");
}

const HR_LINE = "━━━━━━━━━━";

function convertLine(line: string): string {
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  if (heading) return `*${renderInline(heading[2])}*`;

  if (/^[-*_]{3,}\s*$/.test(line.trim())) return HR_LINE;

  const blockquote = /^>\s?(.*)$/.exec(line);
  if (blockquote) return `>${renderInline(blockquote[1])}`;

  const list = /^(\s*)[-*+]\s+(.*)$/.exec(line);
  if (list) return `${list[1]}• ${renderInline(list[2])}`;

  return renderInline(line);
}

export function gfmToMd2(input: string): string {
  return input.split("\n").map(convertLine).join("\n");
}
