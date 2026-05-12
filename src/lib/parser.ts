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

const TICKER_HEADER = /^##\s+\S+\s+([A-Z][A-Z0-9.\-]*)\s+\(([^)]+)\)\s*$/;
const SENTIMENT_BULLISH = /^\*\*🟢\s*호재\*\*\s*$/;
const SENTIMENT_BEARISH = /^\*\*🔴\s*악재\*\*\s*$/;
const SENTIMENT_NEUTRAL = /^\*\*⚪\s*중립.*\*\*\s*$/;
const SUMMARY_LINE = /^\*\*💡\s*핵심 포인트\*\*:\s*(.+)$/;
const CLOSE_PRICE = /^\*\*전일 종가\*\*:\s*(.+)$/;
const BULLET = /^-\s+(.+)$/;

export function parseBriefing(content: string, date: string): BriefingEntry {
  const lines = content.split("\n");
  const tickers: TickerSection[] = [];
  let current: TickerSection | null = null;
  let bucket: "bullish" | "bearish" | "neutral" | null = null;

  const stripBold = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

  for (const raw of lines) {
    const line = raw.trim();

    const header = TICKER_HEADER.exec(line);
    if (header) {
      if (current) tickers.push(current);
      current = {
        ticker: header[1],
        name: header[2],
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

    const cp = CLOSE_PRICE.exec(line);
    if (cp) {
      current.close_price = cp[1].trim();
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet && bucket) {
      current[bucket].push(stripBold(bullet[1].trim()));
    }
  }
  if (current) tickers.push(current);
  return { date, tickers };
}
