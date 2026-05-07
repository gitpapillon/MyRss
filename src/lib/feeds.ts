import Parser from "rss-parser";
import type { SourceDef } from "./types";

export const SOURCES: SourceDef[] = [
  { id: "reuters",      name: "Reuters",       url: "https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-US&gl=US&ceid=US:en" },
  { id: "marketwatch",  name: "MarketWatch",   url: "https://feeds.marketwatch.com/marketwatch/topstories" },
  { id: "cnbc",         name: "CNBC",          url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
  { id: "yahoo",        name: "Yahoo Finance", url: "https://finance.yahoo.com/news/rssindex" },
  { id: "investopedia", name: "Investopedia",  url: "https://news.google.com/rss/search?q=site:investopedia.com+when:7d&hl=en-US&gl=US&ceid=US:en" },
];

const parser = new Parser({
  timeout: 15000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; rss-feed-reader/0.1; +https://localhost)",
  },
});

function stripHtml(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export interface FetchedItem {
  guid: string;
  source: string;
  title: string;
  summary: string | null;
  link: string;
  published_at: number;
  fetched_at: number;
}

export async function fetchSource(src: SourceDef): Promise<FetchedItem[]> {
  const feed = await parser.parseURL(src.url);
  const now = Math.floor(Date.now() / 1000);
  const items: FetchedItem[] = [];
  for (const it of feed.items ?? []) {
    const link = it.link ?? "";
    const guid = it.guid || link;
    const title = (it.title ?? "").trim();
    if (!guid || !title || !link) continue;
    const summary =
      stripHtml(it.contentSnippet) || stripHtml(it.content) || stripHtml(it.summary);
    const pub = it.isoDate ? Math.floor(new Date(it.isoDate).getTime() / 1000) : now;
    items.push({
      guid,
      source: src.id,
      title,
      summary: summary || null,
      link,
      published_at: Number.isFinite(pub) ? pub : now,
      fetched_at: now,
    });
  }
  return items;
}

export interface RefreshReport {
  source: string;
  count: number;
  ok: boolean;
  error?: string;
}

export async function fetchAllSources(): Promise<{ items: FetchedItem[]; report: RefreshReport[] }> {
  const settled = await Promise.allSettled(SOURCES.map((s) => fetchSource(s)));
  const items: FetchedItem[] = [];
  const report: RefreshReport[] = [];
  settled.forEach((res, i) => {
    const src = SOURCES[i];
    if (res.status === "fulfilled") {
      items.push(...res.value);
      report.push({ source: src.id, count: res.value.length, ok: true });
    } else {
      const msg = res.reason instanceof Error ? res.reason.message : String(res.reason);
      console.warn(`[feeds] ${src.id} 실패: ${msg}`);
      report.push({ source: src.id, count: 0, ok: false, error: msg });
    }
  });
  return { items, report };
}
