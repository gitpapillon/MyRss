import type { TranslatedArticle } from "./types";
import { escapeMarkdownV2 } from "./telegram";

const MAX_LENGTH = 4096;
const ELLIPSIS = "\n\\(이하 생략\\)";

// URL은 escapeMarkdownV2를 그대로 쓰면 . / 등이 escape되어 깨진다.
// MarkdownV2 link target에서 escape 필요한 문자는 ) 와 \ 뿐.
function escapeLinkUrl(url: string): string {
  return url.replace(/[)\\]/g, (m) => "\\" + m);
}

export function buildDigest(articles: TranslatedArticle[]): string {
  if (articles.length === 0) {
    return escapeMarkdownV2("오늘은 새 기사가 없습니다.");
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lines: string[] = [];
  lines.push(`*${escapeMarkdownV2(`📰 ${today} RSS 다이제스트`)}*`);

  // 소스별 그룹화 — 첫 등장 순서 유지 (Map이 insertion order 보장)
  const bySource = new Map<string, TranslatedArticle[]>();
  for (const a of articles) {
    const list = bySource.get(a.source);
    if (list) list.push(a);
    else bySource.set(a.source, [a]);
  }

  for (const [source, items] of bySource) {
    lines.push("");
    lines.push(`*${escapeMarkdownV2(source)} \\(${items.length}건\\)*`);
    items.forEach((a, i) => {
      lines.push(`${i + 1}\\. *${escapeMarkdownV2(a.title_ko)}*`);
      if (a.summary_ko) {
        lines.push(`   ${escapeMarkdownV2(a.summary_ko)}`);
      }
      lines.push(`   [원문](${escapeLinkUrl(a.link)})`);
    });
  }

  let result = lines.join("\n");
  if (result.length > MAX_LENGTH) {
    const limit = MAX_LENGTH - ELLIPSIS.length;
    result = result.slice(0, limit) + ELLIPSIS;
  }
  return result;
}
