#!/usr/bin/env tsx
// watchlist.json을 읽어 10개 해외 RSS 피드를 수집 → files/news_YYYY-MM-DD.json
// (원시 뉴스풀). Claude Code/Cowork가 이 파일을 읽어 v4 브리핑 MD를 작성한다.
// 외부 IO(fetch)는 src/lib/feeds.ts에 격리. 이 스크립트는 orchestration만.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchText,
  parseFeed,
  withinHours,
  dedupe,
  type FeedItem,
} from "../src/lib/feeds";

const FILES_DIR = "files";
const DEFAULT_HOURS = 24;

interface Ticker {
  ticker: string;
  name: string;
  emoji: string;
  industry: string;
}
interface Sector {
  name: string;
  emoji: string;
  industry: string;
}
interface Watchlist {
  tickers: Ticker[];
  sectors: Sector[];
}

interface Task {
  label: string; // 실패 보고용 (예: "Nasdaq:RKLB")
  source: string; // 사람용 소스 라벨
  url: string;
  bucket: string; // "market" | `t:${ticker}` | `s:${name}`
}

const enc = encodeURIComponent;

function tickerFeeds(t: Ticker): Array<{ source: string; url: string }> {
  // dedupe 우선순위: 공식·정제 소스를 앞에, 애그리게이터(Google News)를 뒤에.
  return [
    {
      source: "SEC EDGAR",
      url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${enc(t.ticker)}&type=8-K&count=10&output=atom`,
    },
    {
      source: "Yahoo Finance",
      url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${enc(t.ticker)}&region=US&lang=en-US`,
    },
    {
      source: "Seeking Alpha",
      url: `https://seekingalpha.com/symbol/${enc(t.ticker)}/feed`,
    },
    {
      source: "StockTitan",
      url: `https://www.stocktitan.net/rss/news/${enc(t.ticker)}.xml`,
    },
    {
      source: "Bing News",
      url: `https://www.bing.com/news/search?q=${enc(`${t.ticker} ${t.name} stock`)}&format=rss`,
    },
    {
      source: "Google News",
      url: `https://news.google.com/rss/search?q=${enc(`${t.ticker} ${t.name} stock`)}&hl=en-US&gl=US&ceid=US:en`,
    },
  ];
}

const MARKET_FEEDS: Array<{ source: string; url: string }> = [
  { source: "CNBC", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html" },
  { source: "WSJ", url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml" },
  {
    source: "MarketWatch",
    url: "http://feeds.marketwatch.com/marketwatch/topstories/",
  },
  { source: "Investing.com", url: "https://www.investing.com/rss/news_25.rss" },
];

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildTasks(wl: Watchlist): Task[] {
  const tasks: Task[] = [];
  for (const f of MARKET_FEEDS) {
    tasks.push({ label: f.source, source: f.source, url: f.url, bucket: "market" });
  }
  for (const t of wl.tickers) {
    for (const f of tickerFeeds(t)) {
      tasks.push({
        label: `${f.source}:${t.ticker}`,
        source: f.source,
        url: f.url,
        bucket: `t:${t.ticker}`,
      });
    }
  }
  for (const s of wl.sectors) {
    tasks.push({
      label: `Google News:${s.name}`,
      source: "Google News",
      url: `https://news.google.com/rss/search?q=${enc(`${s.name} 관련주`)}&hl=ko&gl=KR&ceid=KR:ko`,
      bucket: `s:${s.name}`,
    });
  }
  return tasks;
}

function finalize(items: FeedItem[], hours: number, now: number): FeedItem[] {
  return dedupe(items.filter((i) => withinHours(i, hours, now))).sort(
    (a, b) => Date.parse(b.published!) - Date.parse(a.published!),
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const hi = argv.indexOf("--hours");
  const hours = hi >= 0 ? Number(argv[hi + 1]) : DEFAULT_HOURS;
  if (!Number.isFinite(hours) || hours <= 0) {
    console.error(`[collect] invalid --hours value`);
    process.exit(1);
  }

  const date = todayKst();
  const wlPath = join(process.cwd(), FILES_DIR, "config", "watchlist.json");
  if (!existsSync(wlPath)) {
    console.error(`[collect] watchlist not found: ${wlPath}`);
    process.exit(1);
  }
  const wl = JSON.parse(readFileSync(wlPath, "utf-8")) as Watchlist;
  const tickers = wl.tickers ?? [];
  const sectors = wl.sectors ?? [];
  if (tickers.length === 0 && sectors.length === 0) {
    console.error(`[collect] watchlist에 추적 항목이 없습니다.`);
    process.exit(1);
  }

  const tasks = buildTasks({ tickers, sectors });
  console.log(
    `[collect] start (date=${date} window=${hours}h feeds=${tasks.length} dry-run=${dryRun})`,
  );

  const now = Date.now();
  const byBucket = new Map<string, FeedItem[]>();
  const failed: string[] = [];
  let ok = 0;

  const results = await Promise.allSettled(
    tasks.map(async (task) => {
      const xml = await fetchText(task.url);
      return { task, items: parseFeed(xml, task.source) };
    }),
  );

  results.forEach((r, idx) => {
    const task = tasks[idx];
    if (r.status === "fulfilled") {
      ok++;
      const arr = byBucket.get(task.bucket) ?? [];
      arr.push(...r.value.items);
      byBucket.set(task.bucket, arr);
    } else {
      const e = r.reason;
      failed.push(
        `${task.label} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
  });

  const market = finalize(byBucket.get("market") ?? [], hours, now);
  const tickerOut = tickers.map((t) => ({
    ticker: t.ticker,
    name: t.name,
    items: finalize(byBucket.get(`t:${t.ticker}`) ?? [], hours, now),
  }));
  const sectorOut = sectors.map((s) => ({
    name: s.name,
    items: finalize(byBucket.get(`s:${s.name}`) ?? [], hours, now),
  }));

  const pool = {
    date,
    generated_at: new Date().toISOString(),
    window_hours: hours,
    feeds: { ok, failed },
    market,
    tickers: tickerOut,
    sectors: sectorOut,
  };

  console.log(
    `[collect] feeds ok=${ok}/${tasks.length} failed=${failed.length}`,
  );
  if (failed.length) console.log(`[collect] failed: ${failed.join(", ")}`);
  console.log(
    `[collect] items: market=${market.length} ` +
      tickerOut.map((t) => `${t.ticker}=${t.items.length}`).join(" ") +
      " " +
      sectorOut.map((s) => `${s.name}=${s.items.length}`).join(" "),
  );

  if (dryRun) {
    console.log("[collect] dry-run: 파일 미작성");
    return;
  }
  const outPath = join(process.cwd(), FILES_DIR, `news_${date}.json`);
  writeFileSync(outPath, JSON.stringify(pool, null, 2) + "\n", "utf-8");
  console.log(`[collect] wrote ${outPath}`);
}

main().catch((e) => {
  console.error(
    "[collect] FATAL:",
    e instanceof Error ? (e.stack ?? e.message) : String(e),
  );
  process.exit(1);
});
