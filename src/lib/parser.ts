export interface TickerSection {
  ticker: string;
  name: string;
  close_price?: string;
  bullish: string[];
  bearish: string[];
  neutral: string[];
  summary?: string;
}

export interface BriefingEntry {
  date: string;
  tickers: TickerSection[];
}

// v3 legacy: `## 🚀 RKLB (Rocket Lab)`
const TICKER_HEADER_V3 = /^##\s+\S+\s+([A-Z][A-Z0-9.\-]*)\s+\(([^)]+)\)\s*$/;
// v4: `## 🚀 RKLB — Rocket Lab` (em-dash, en-dash, or hyphen)
const TICKER_HEADER_V4 = /^##\s+\S+\s+([A-Z][A-Z0-9.\-]*)\s+[—–-]\s+(.+?)\s*$/;

// Old: `**🟢 호재**` / v4: `🟢 **호재**`
const SENTIMENT_BULLISH = /^(?:\*\*🟢\s*호재\*\*|🟢\s*\*\*호재\*\*)\s*$/;
const SENTIMENT_BEARISH = /^(?:\*\*🔴\s*악재\*\*|🔴\s*\*\*악재\*\*)\s*$/;
const SENTIMENT_NEUTRAL = /^(?:\*\*⚪\s*중립.*?\*\*|⚪\s*\*\*중립.*?\*\*)\s*$/;

// Old: `**💡 핵심 포인트**: ...` / v4: `💡 **한줄**: ...`
const SUMMARY_LINE = /^(?:\*\*💡\s*(?:핵심 포인트|한줄)\*\*|💡\s*\*\*(?:핵심 포인트|한줄)\*\*):\s*(.+)$/;

// Old: `**전일 종가**: $XXX` / v4: `**$XXX (±Y%)** · 진단: ...`
const CLOSE_PRICE_V3 = /^\*\*전일 종가\*\*:\s*(.+)$/;
const CLOSE_PRICE_V4 = /^\*\*(\$[^*]+)\*\*\s*·/;

// Old: `- text` / v4: `1. text`, `2. text`, ...
const BULLET = /^(?:[-*]|\d+\.)\s+(.+)$/;

export function parseBriefing(content: string, date: string): BriefingEntry {
  const lines = content.split("\n");
  const tickers: TickerSection[] = [];
  let current: TickerSection | null = null;
  let bucket: "bullish" | "bearish" | "neutral" | null = null;

  const stripBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

  for (const raw of lines) {
    const line = raw.trim();

    const header = TICKER_HEADER_V3.exec(line) ?? TICKER_HEADER_V4.exec(line);
    if (header) {
      if (current) tickers.push(current);
      current = {
        ticker: header[1],
        name: header[2].trim(),
        bullish: [],
        bearish: [],
        neutral: [],
      };
      bucket = null;
      continue;
    }

    if (!current) continue;

    if (SENTIMENT_BULLISH.test(line)) {
      bucket = "bullish";
      continue;
    }
    if (SENTIMENT_BEARISH.test(line)) {
      bucket = "bearish";
      continue;
    }
    if (SENTIMENT_NEUTRAL.test(line)) {
      bucket = "neutral";
      continue;
    }

    const sum = SUMMARY_LINE.exec(line);
    if (sum) {
      current.summary = stripBold(sum[1].trim());
      bucket = null;
      continue;
    }

    const cpV3 = CLOSE_PRICE_V3.exec(line);
    if (cpV3) {
      current.close_price = cpV3[1].trim();
      continue;
    }
    if (!current.close_price) {
      const cpV4 = CLOSE_PRICE_V4.exec(line);
      if (cpV4) {
        current.close_price = cpV4[1].trim();
        continue;
      }
    }

    const bullet = BULLET.exec(line);
    if (bullet && bucket) {
      current[bucket].push(stripBold(bullet[1].trim()));
    }
  }
  if (current) tickers.push(current);
  return { date, tickers };
}
