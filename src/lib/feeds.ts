// 무의존 RSS 2.0 / Atom fetch + 경량 파서.
// CLAUDE.md CRITICAL: 외부 라이브러리 0 — 정규식 기반 파싱으로 zero-dep 유지.
// 견고성 한계는 collect-news.ts의 피드 화이트리스트로 보완한다.

export interface FeedItem {
  title: string;
  link: string;
  /** ISO 8601, 파싱 불가/누락 시 null */
  published: string | null;
  /** 호출자가 부여하는 사람용 소스 라벨 */
  source: string;
  /** HTML 제거·엔티티 디코드·길이 제한된 평문 */
  summary: string;
}

// SEC EDGAR 등은 식별 가능한 UA를 요구한다. 개인정보 대신 repo URL로 연락처 표기.
const UA =
  "rss-feed/0.1 briefing-bot (+https://github.com/gitpapillon/MyRss)";
const TIMEOUT_MS = 12_000;
const SUMMARY_CAP = 500;

export async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
  nbsp: " ",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code =
        ent[1] === "x" || ent[1] === "X"
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[ent.toLowerCase()] ?? m;
  });
}

/** CDATA 해제 → 태그 제거 → 엔티티 디코드 → 공백 정리 */
function clean(raw: string | null): string {
  if (!raw) return "";
  const noCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const noTags = noCdata.replace(/<[^>]+>/g, " ");
  return decodeEntities(noTags).replace(/\s+/g, " ").trim();
}

function firstTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1] : null;
}

function toIso(raw: string | null): string | null {
  if (!raw) return null;
  const t = Date.parse(clean(raw));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function atomLink(entry: string): string {
  // rel="alternate" 우선, 없으면 첫 href
  const alt = /<link\b[^>]*\brel=["']?alternate["']?[^>]*\bhref=["']([^"']+)["']/i.exec(
    entry,
  );
  if (alt) return decodeEntities(alt[1]);
  const any = /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(entry);
  return any ? decodeEntities(any[1]) : "";
}

export function parseFeed(xml: string, source: string): FeedItem[] {
  const isAtom = /<entry\b/i.test(xml) && !/<item\b/i.test(xml);
  const blocks = xml.match(
    isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi,
  );
  if (!blocks) return [];

  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = clean(firstTag(block, "title"));
    if (!title) continue;

    let link: string;
    if (isAtom) {
      link = atomLink(block);
    } else {
      link = clean(firstTag(block, "link"));
      if (!link) {
        const guid = clean(firstTag(block, "guid"));
        if (/^https?:\/\//i.test(guid)) link = guid;
      }
    }

    const dateRaw = isAtom
      ? firstTag(block, "updated") ?? firstTag(block, "published")
      : firstTag(block, "pubDate") ?? firstTag(block, "dc:date");

    const summaryRaw = isAtom
      ? firstTag(block, "summary") ?? firstTag(block, "content")
      : firstTag(block, "description") ?? firstTag(block, "content:encoded");

    let summary = clean(summaryRaw);
    if (summary.length > SUMMARY_CAP) {
      summary = summary.slice(0, SUMMARY_CAP).trimEnd() + "…";
    }

    items.push({ title, link, published: toIso(dateRaw), source, summary });
  }
  return items;
}

/** published가 [now - hours, now + 1h] 범위인 항목만. 날짜 없으면 제외. */
export function withinHours(
  item: FeedItem,
  hours: number,
  now: number = Date.now(),
): boolean {
  if (!item.published) return false;
  const t = Date.parse(item.published);
  if (Number.isNaN(t)) return false;
  return now - t <= hours * 3_600_000 && t - now <= 3_600_000;
}

function dedupKey(it: FeedItem): string {
  if (it.link) return it.link.replace(/[#?].*$/, "").toLowerCase();
  return it.title.toLowerCase().replace(/[^a-z0-9가-힣]+/g, "");
}

/** link(쿼리·프래그먼트 제거) → 정규화 title 순으로 중복 제거, 첫 항목 유지 */
export function dedupe(items: FeedItem[]): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const it of items) {
    const key = dedupKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
