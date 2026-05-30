// 무의존 시세 수집: Yahoo v8 chart(무인증) — query1 → query2 호스트 폴백.
// CLAUDE.md CRITICAL: 외부 라이브러리 0 — fetch + JSON 파싱으로 zero-dep.
// IO(fetch)와 순수 파서를 분리해 파서만 단위테스트(tests/quotes.test.ts).
// brief 는 US 장 마감 후 실행 → "전일 종가 + 일간 %"면 충분(실시간 불요).
// 주의: 일간 %는 일봉 종가 배열의 마지막 2개로 계산한다. meta.chartPreviousClose
//       는 range 시작 기준(다일치)이라 일간 변동 계산에 쓰면 안 됨.
// Stooq 는 2026 기준 무료 CSV 가 apikey(캡차) 필요 — 무인 자동화 불가라 미사용.

export interface Quote {
  ticker: string;
  price: number;
  /** 전일 종가 대비 % (소수 2자리) */
  changePct: number;
  prevClose: number;
  /** ISO 4217 (예: "USD", "KRW"). meta 누락 시 티커 접미사로 추론. */
  currency: string;
  source: "yahoo";
  /** 조회 시각 ISO */
  asOf: string;
}

const TIMEOUT_MS = 12_000;
const UA = "rss-feed/0.1 briefing-bot (+https://github.com/gitpapillon/MyRss)";
const YAHOO_HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// --- 순수 파서 (네트워크 없음, 단위테스트 대상) ---

/** Yahoo v8 chart JSON → 일봉 종가 배열의 마지막 2개로 {price, prevClose, currency}.
 *  null 종가(거래중 빈 봉 등)는 제외. 2개 미만이면 null.
 *  currency 는 meta.currency (없으면 null — fetchQuote 에서 티커로 폴백). */
export function parseYahooChart(
  jsonText: string,
): { price: number; prevClose: number; currency: string | null } | null {
  let j: any;
  try {
    j = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const result = j?.chart?.result?.[0];
  if (!result) return null;
  const currency =
    typeof result?.meta?.currency === "string" ? result.meta.currency : null;
  const closes: unknown[] = result?.indicators?.quote?.[0]?.close ?? [];
  const vals = closes
    .map((c) => Number(c))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (vals.length >= 2) {
    return {
      price: vals[vals.length - 1],
      prevClose: vals[vals.length - 2],
      currency,
    };
  }
  // 신규 상장 등 일봉 1개뿐이면 meta 폴백: 봉이 1개라 chartPreviousClose 가
  // 곧 직전일 종가 → 일간 % 계산 안전(다일봉일 땐 range 시작값이라 금지).
  if (vals.length === 1) {
    const rmp = Number(result?.meta?.regularMarketPrice);
    const cpc = Number(result?.meta?.chartPreviousClose);
    if (Number.isFinite(rmp) && rmp > 0 && Number.isFinite(cpc) && cpc > 0) {
      return { price: rmp, prevClose: cpc, currency };
    }
  }
  return null;
}

// --- IO ---

async function httpGet(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "application/json, */*" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** query1 → query2 호스트 폴백. 둘 다 실패하면 null. */
export async function fetchQuote(ticker: string): Promise<Quote | null> {
  const path = `/v8/finance/chart/${encodeURIComponent(ticker)}?range=5d&interval=1d`;
  for (const host of YAHOO_HOSTS) {
    try {
      const json = await httpGet(`https://${host}${path}`);
      const p = parseYahooChart(json);
      if (p) {
        // meta.currency 누락 시(일부 한국 ETN 등) 접미사로 추론.
        const currency =
          p.currency || (/\.(KS|KQ)$/i.test(ticker) ? "KRW" : "USD");
        return {
          ticker,
          price: round2(p.price),
          prevClose: round2(p.prevClose),
          changePct: round2(((p.price - p.prevClose) / p.prevClose) * 100),
          currency,
          source: "yahoo",
          asOf: new Date().toISOString(),
        };
      }
    } catch {
      /* 다음 호스트로 폴백 */
    }
  }
  return null;
}

/** watchlist 티커들을 병렬 조회. 키=티커, 실패는 null. */
export async function fetchQuotes(
  tickers: string[],
): Promise<Record<string, Quote | null>> {
  const entries = await Promise.all(
    tickers.map(async (t) => [t, await fetchQuote(t)] as const),
  );
  return Object.fromEntries(entries);
}
