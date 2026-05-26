#!/usr/bin/env tsx
// 무인 브리핑 생성: files/news_<today>.json 을 헤드리스 claude로 분석 →
// files/briefing_<today>.md (v4 템플릿) 자동 작성. collect 와 daily 사이(07:05) 실행.
// 외부 IO(claude 호출)는 child_process로 격리, 검증은 src/lib/parser 재사용.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseBriefing } from "../src/lib/parser";

const FILES_DIR = "files";
// 분석 품질이 핵심 → Sonnet 기본 (Haiku는 호재/악재 판단 약함). BRIEF_MODEL로 override.
const MODEL = process.env.BRIEF_MODEL || "claude-sonnet-4-6";
const CLAUDE_TIMEOUT_MS = 240_000;

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function weekdayKo(date: string): string {
  const d = new Date(date + "T00:00:00+09:00");
  return ["일", "월", "화", "수", "목", "금", "토"][d.getDay()] + "요일";
}

interface Item {
  title: string;
  source: string;
  published: string | null;
  summary: string;
}

function md(iso: string | null): string {
  if (!iso) return "?";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function compactItems(items: Item[], n: number): string {
  return items
    .slice(0, n)
    .map(
      (i) =>
        `- [${md(i.published)} ${i.source}] ${i.title}` +
        (i.summary ? ` :: ${i.summary.slice(0, 160)}` : ""),
    )
    .join("\n");
}

function buildPrompt(date: string, pool: any, watchlist: any): string {
  const sections: string[] = [];
  sections.push(`### 시장·매크로 (market)\n${compactItems(pool.market, 14)}`);
  for (const t of pool.tickers) {
    const wl = (watchlist.tickers || []).find(
      (w: any) => w.ticker === t.ticker,
    );
    const q = t.quote
      ? `[시세] $${t.quote.price} (${t.quote.changePct >= 0 ? "+" : ""}${t.quote.changePct}% vs 전일종가 $${t.quote.prevClose}) — 출처 ${t.quote.source}`
      : `[시세] 미수집`;
    sections.push(
      `### ${wl?.emoji || ""} ${t.ticker} ${t.name} (${t.items.length}건)\n${q}\n` +
        compactItems(t.items, 16),
    );
  }
  for (const s of pool.sectors) {
    const wl = (watchlist.sectors || []).find((w: any) => w.name === s.name);
    sections.push(
      `### 섹터 ${wl?.emoji || ""} ${s.name} (${s.items.length}건)\n` +
        (s.items.length ? compactItems(s.items, 8) : "(최근 24시간 내 뉴스 없음)"),
    );
  }

  return `당신은 미국 주식 일일 뉴스 분석가입니다. 아래 RSS 뉴스풀을 분석해 한국어 v4 브리핑 마크다운을 작성하세요.

[출력 규칙 — 엄수]
- 출력은 **오직 마크다운 본문만**. 코드펜스(\`\`\`), 머리말, 설명, 후기 절대 금지.
- 첫 줄은 정확히: \`# 📈 데일리 브리핑 — ${date} (${weekdayKo(date)})\`
- 표(| ... |) 사용 금지. 호재/악재 라벨은 이모지를 볼드 밖에: \`🟢 **호재**\` / \`🔴 **악재**\`, 항목은 1./2./3. 번호 매김(강한 시그널이 1번).
- 종목 헤더: \`## {emoji} {TICKER} — {회사명}\`. 가격 라인: 종목 \`[시세]\`가 주어지면 **그 수치를 그대로** \`**$<price> (±<changePct>%)** · 진단: **<한 단어 진단>**\` 로 출력(시세 숫자 변형·반올림·날조 금지). \`[시세] 미수집\`일 때만 \`**가격 미수집** · 진단: **<진단>**\`.
- 핵심 수치는 \`**굵게**\`, 출처는 항목 끝에 \`_(소스, M/D)_\` 이탤릭. 종목당 호재+악재 합 4~6개.
- 진단 라벨 예: 강세("이벤트 드리븐 강세","모멘텀"), 약세("조정·관망","리스크 부각"), 중립("관망","이벤트 대기"), 주의("모멘텀 추격 주의","변동성 확대").

[공시 처리 — SEC EDGAR 항목 전용]
- 뉴스풀에서 \`[... SEC EDGAR]\` 소스로 표기된 8-K 공시가 1건 이상이면, 해당 종목의 🔴 악재 라인 다음·💡 한줄 직전에 \`📄 **공시 (8-K)**\` 서브섹션을 추가한다. 0건이면 서브섹션 자체를 생략.
- 공시 항목별 출력 형식은 **중요도에 따라 가변**한다:
  - **중대 공시** (M&A·인수합병, 분기/연간 실적, 가이던스 변경, 자금조달·증자·전환사채, 주요 계약 체결/해지, 소송·합의, 대규모 인력 변동, 자산 매각, 배당·자사주): 3줄 — \`  • **<공시 제목 1줄>** _(SEC EDGAR, M/D)_\` / \`    └ 주가 영향: <단기 ± 방향과 근거 1줄>\` / \`    └ 성장 영향: <중장기 사업·실적 함의 1줄>\`
  - **단순 공시** (정기 서류, 임원 사임·선임 단순 통지, 코드 of conduct 갱신, 형식적 보고): 1줄 — \`  • <제목> _(SEC EDGAR, M/D)_\` 만.
- 공시 제목만으로 중요도 판별이 모호하면 보수적으로 중대로 분류한다(누락이 더 손해).
- 공시 분석은 8-K 원문을 보지 않고 제목·summary 기반의 정성 추정임을 전제하며, 수치를 날조하지 않는다.

[구조 순서]
1. \`# 📈 데일리 브리핑 — ${date} (${weekdayKo(date)})\`
2. \`## 🌐 매크로\` — market 항목으로 전일 마감 방향·원인·이번주 핵심 (정확 지수 수치는 모르면 방향성으로만, 날조 금지)
3. watchlist tickers 순서대로 \`## {emoji} {TICKER} — {name}\` 블록 (가격라인·핵심숫자·🟢호재·🔴악재·💡한줄·📅다음이벤트)
4. \`## 🔭 산업 트래킹\` — 섹터별 2~3개. 0건이면 "특이사항 없음"
5. \`## 📅 이번주 캘린더\` — 뉴스에 드러난 이벤트(어닝스 D-N 등)
6. \`> ⚠️ 본 브리핑은 정보 제공 목적이며 투자 권유가 아닙니다.\`

[추측 금지] 뉴스풀에 없는 수치·사실을 만들지 말 것. 불확실하면 방향성·정성 서술.

=== 뉴스풀 (${date}) ===
${sections.join("\n\n")}
`;
}

function generate(prompt: string): string {
  const out = execFileSync(
    "claude",
    ["-p", "--model", MODEL, "--dangerously-skip-permissions", "--output-format", "text"],
    { input: prompt, encoding: "utf-8", maxBuffer: 8 * 1024 * 1024, timeout: CLAUDE_TIMEOUT_MS },
  );
  // 모델이 코드펜스로 감쌌으면 제거.
  return out
    .replace(/^\s*```(?:markdown|md)?\s*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();
}

function main(): void {
  const argv = process.argv.slice(2);
  const dry = argv.includes("--dry");
  const force = argv.includes("--force");
  const date = todayKst();

  const newsPath = join(process.cwd(), FILES_DIR, `news_${date}.json`);
  const briefPath = join(process.cwd(), FILES_DIR, `briefing_${date}.md`);

  if (!existsSync(newsPath)) {
    console.error(`[brief] news pool 없음: ${newsPath} — collect 먼저 실행`);
    process.exit(1);
  }
  if (existsSync(briefPath) && !dry && !force) {
    console.log(`[brief] ${briefPath} 이미 존재 — skip (수동 작성본 보호). --force 로 덮어쓰기`);
    return;
  }

  const pool = JSON.parse(readFileSync(newsPath, "utf-8"));
  const wlPath = join(process.cwd(), FILES_DIR, "config", "watchlist.json");
  const watchlist = existsSync(wlPath)
    ? JSON.parse(readFileSync(wlPath, "utf-8"))
    : { tickers: [], sectors: [] };

  console.log(`[brief] generating ${date} via ${MODEL} (dry=${dry})...`);
  const prompt = buildPrompt(date, pool, watchlist);

  let content: string;
  try {
    content = generate(prompt);
  } catch (e) {
    console.error(`[brief] claude 호출 실패: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    process.exit(1);
  }

  // 검증: v4 헤더 + parseBriefing 으로 ticker ≥ 1
  const okHeader = content.startsWith("# 📈 데일리 브리핑");
  const parsed = parseBriefing(content, date);
  if (!okHeader || parsed.tickers.length === 0) {
    console.error(
      `[brief] 생성물 검증 실패 (header=${okHeader}, tickers=${parsed.tickers.length}). 파일 미작성.`,
    );
    process.exit(1);
  }

  console.log(
    `[brief] OK — ${content.length}자, tickers=${parsed.tickers.map((t) => t.ticker).join(",")}`,
  );
  if (dry) {
    console.log("[brief] dry: 파일 미작성. 미리보기 상위 12줄:\n");
    console.log(content.split("\n").slice(0, 12).join("\n"));
    return;
  }
  writeFileSync(briefPath, content + "\n", "utf-8");
  console.log(`[brief] wrote ${briefPath}`);
}

main();
