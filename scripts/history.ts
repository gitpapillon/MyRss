#!/usr/bin/env tsx
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBriefing, type BriefingEntry, type TickerSection } from "../src/lib/parser";

const FILES_DIR = "files";
const BRIEFING_RE = /^briefing_(\d{4}-\d{2}-\d{2})\.md$/;

function loadAll(): BriefingEntry[] {
  const dir = join(process.cwd(), FILES_DIR);
  const files = readdirSync(dir)
    .filter((f) => BRIEFING_RE.test(f))
    .sort();
  return files.map((f) => {
    const m = f.match(BRIEFING_RE)!;
    return parseBriefing(readFileSync(join(dir, f), "utf-8"), m[1]);
  });
}

function listTickers(all: BriefingEntry[]): void {
  const map = new Map<string, { name: string; days: number }>();
  for (const b of all) {
    for (const t of b.tickers) {
      const prev = map.get(t.ticker);
      map.set(t.ticker, { name: t.name, days: (prev?.days ?? 0) + 1 });
    }
  }
  if (map.size === 0) {
    console.log("등록된 종목이 없습니다. files/ 디렉토리에 briefing_YYYY-MM-DD.md 가 있는지 확인하세요.");
    return;
  }
  console.log(`등록 종목 ${map.size}개 / 총 ${all.length}일 데이터:\n`);
  console.log("ticker  days  name");
  console.log("------  ----  ----");
  for (const [tk, info] of [...map.entries()].sort()) {
    console.log(`${tk.padEnd(6)}  ${String(info.days).padStart(4)}  ${info.name}`);
  }
}

function renderTimeline(ticker: string, entries: { date: string; t: TickerSection }[]): void {
  console.log(`\n=== ${ticker} (${entries[0].t.name}) — 타임라인 ${entries.length}일 ===\n`);
  for (const e of entries) {
    console.log(`[${e.date}]`);
    if (e.t.close_price) console.log(`  전일 종가: ${e.t.close_price}`);
    if (e.t.bullish.length) {
      console.log(`  🟢 호재 (${e.t.bullish.length}):`);
      for (const b of e.t.bullish) console.log(`    • ${b}`);
    }
    if (e.t.bearish.length) {
      console.log(`  🔴 악재 (${e.t.bearish.length}):`);
      for (const b of e.t.bearish) console.log(`    • ${b}`);
    }
    if (e.t.neutral.length) {
      console.log(`  ⚪ 중립 (${e.t.neutral.length}):`);
      for (const b of e.t.neutral) console.log(`    • ${b}`);
    }
    if (e.t.summary) console.log(`  💡 ${e.t.summary}`);
    console.log();
  }
}

function renderSentiment(entries: { date: string; t: TickerSection }[]): void {
  console.log(`=== 센티먼트 추세 (호재/악재/중립 건수) ===\n`);
  console.log(`date          🟢    🔴    ⚪`);
  console.log(`----------  ----  ----  ----`);
  let tb = 0;
  let tr = 0;
  let tn = 0;
  for (const e of entries) {
    const b = e.t.bullish.length;
    const r = e.t.bearish.length;
    const n = e.t.neutral.length;
    tb += b;
    tr += r;
    tn += n;
    console.log(`${e.date}  ${String(b).padStart(4)}  ${String(r).padStart(4)}  ${String(n).padStart(4)}`);
  }
  const d = entries.length;
  console.log(`----------  ----  ----  ----`);
  console.log(`평균 (${d}일)  ${(tb / d).toFixed(1).padStart(4)}  ${(tr / d).toFixed(1).padStart(4)}  ${(tn / d).toFixed(1).padStart(4)}`);
  const ratio = tb + tr > 0 ? (tb / (tb + tr)) * 100 : 0;
  console.log(`\n호재 비중 (호재/(호재+악재)) = ${ratio.toFixed(1)}%`);
}

function main(): void {
  const arg = process.argv[2];
  const all = loadAll();

  if (!arg || arg === "--list") {
    listTickers(all);
    return;
  }

  const ticker = arg.toUpperCase();
  const entries = all
    .map((b) => ({ date: b.date, t: b.tickers.find((t) => t.ticker === ticker) }))
    .filter((e): e is { date: string; t: TickerSection } => e.t !== undefined);

  if (entries.length === 0) {
    console.error(`${ticker} 데이터가 없습니다. 사용 가능한 종목:`);
    listTickers(all);
    process.exit(1);
  }

  renderTimeline(ticker, entries);
  renderSentiment(entries);
}

main();
