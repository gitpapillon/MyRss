import { describe, it, expect } from "vitest";
import { parseBriefing } from "../src/lib/parser";

const FIXTURE = `# 📈 오늘의 종목 뉴스 브리핑 — 2026-05-13 (수)

---

## 🚀 RKLB (Rocket Lab)

**전일 종가**: $117.72 (−3.54%)

**🟢 호재**

- Q1 매출 성장
- 신규 계약 체결

**🔴 악재**

- Neutron 발사 지연

**⚪ 중립/기타**

- 애널리스트 커버리지 유지

**💡 핵심 포인트**: 실적 서프라이즈 여진 긍정적.

---

## 🤖 NBIS (Nebius Group)

**전일 종가**: $173.78

**🟢 호재**

- Meta·MS 계약

**💡 핵심 포인트**: **오늘이 NBIS의 Q1 실적 발표일.** 모멘텀 강함.

---

## 🌐 시장 전반

- S&P 500 -0.29%
`;

describe("parseBriefing", () => {
  const result = parseBriefing(FIXTURE, "2026-05-13");

  it("date 보존", () => {
    expect(result.date).toBe("2026-05-13");
  });

  it("market overview는 ticker로 잡지 않음 (## 🌐 시장 전반 제외)", () => {
    expect(result.tickers.map((t) => t.ticker)).toEqual(["RKLB", "NBIS"]);
  });

  it("ticker name 추출", () => {
    expect(result.tickers[0].name).toBe("Rocket Lab");
    expect(result.tickers[1].name).toBe("Nebius Group");
  });

  it("호재/악재/중립 파싱", () => {
    const rklb = result.tickers[0];
    expect(rklb.bullish).toEqual(["Q1 매출 성장", "신규 계약 체결"]);
    expect(rklb.bearish).toEqual(["Neutron 발사 지연"]);
    expect(rklb.neutral).toEqual(["애널리스트 커버리지 유지"]);
  });

  it("핵심 포인트 추출 (인라인 볼드 제거)", () => {
    expect(result.tickers[0].summary).toBe("실적 서프라이즈 여진 긍정적.");
    expect(result.tickers[1].summary).toBe("오늘이 NBIS의 Q1 실적 발표일. 모멘텀 강함.");
  });

  it("close_price 추출", () => {
    expect(result.tickers[0].close_price).toBe("$117.72 (−3.54%)");
    expect(result.tickers[1].close_price).toBe("$173.78");
  });

  it("빈 섹션은 빈 배열", () => {
    const nbis = result.tickers[1];
    expect(nbis.bearish).toEqual([]);
    expect(nbis.neutral).toEqual([]);
  });

  it("ticker 없는 컨텐츠는 무시 (## 시장 전반 아래의 -)", () => {
    expect(result.tickers.length).toBe(2);
  });
});

const FIXTURE_V4 = `# 📈 데일리 브리핑 — 2026-05-13 (수요일)

## 🌐 매크로

- **5/12 마감**: S&P 7,400.96 (-0.16%)

---

## 🚀 RKLB — Rocket Lab

**$118.65 (-3.54%)** · 진단: **조정·관망**

**핵심 숫자 (Q1 2026)**

- 매출 **$200.3M** (+63.5% YoY)
- 수주잔고 **$2.2B**

🟢 **호재**

1. 역대 최대 장기 계약 _(Motley Fool, 5/8)_
2. Q2 가이던스 컨센 대폭 상회 _(CNBC, 5/8)_

🔴 **악재**

1. **Neutron 초도 발사 지연** _(SpaceNews)_

💡 **한줄**: 어닝스 서프라이즈 후 ATH 경신, 단기 조정 중.

📅 **다음 이벤트**: Q2 어닝스 8월

---

## 🤖 NBIS — Nebius Group

**$211.40 (급등 중)** · 진단: **모멘텀 추격 주의**

🟢 **호재**

1. **Q1 매출 +684% 어닝스 서프라이즈** _(BusinessWire, 5/13)_

💡 **한줄**: 어닝스 압승으로 급등.
`;

describe("parseBriefing v4 (신규 템플릿 호환)", () => {
  const result = parseBriefing(FIXTURE_V4, "2026-05-13");

  it("v4 헤더 형식 (티커 — 회사명) 파싱", () => {
    expect(result.tickers.map((t) => t.ticker)).toEqual(["RKLB", "NBIS"]);
    expect(result.tickers[0].name).toBe("Rocket Lab");
    expect(result.tickers[1].name).toBe("Nebius Group");
  });

  it("v4 호재/악재 라벨 (이모지 밖 볼드) 파싱", () => {
    const rklb = result.tickers[0];
    expect(rklb.bullish).toEqual([
      "역대 최대 장기 계약 _(Motley Fool, 5/8)_",
      "Q2 가이던스 컨센 대폭 상회 _(CNBC, 5/8)_",
    ]);
    expect(rklb.bearish).toEqual(["Neutron 초도 발사 지연 _(SpaceNews)_"]);
  });

  it("v4 번호 매김 리스트(1./2./3.) 호재로 수집", () => {
    expect(result.tickers[0].bullish.length).toBe(2);
    expect(result.tickers[1].bullish.length).toBe(1);
  });

  it("v4 '💡 한줄' 라벨 파싱", () => {
    expect(result.tickers[0].summary).toBe("어닝스 서프라이즈 후 ATH 경신, 단기 조정 중.");
    expect(result.tickers[1].summary).toBe("어닝스 압승으로 급등.");
  });

  it("v4 헤더 직후 가격 라인을 close_price로 추출", () => {
    expect(result.tickers[0].close_price).toBe("$118.65 (-3.54%)");
    expect(result.tickers[1].close_price).toBe("$211.40 (급등 중)");
  });

  it("v4 핵심 숫자 섹션의 - 불릿은 bucket=null 이라 호재로 들어가지 않음", () => {
    const rklb = result.tickers[0];
    expect(rklb.bullish).not.toContain("매출 $200.3M (+63.5% YoY)");
    expect(rklb.bullish).not.toContain("수주잔고 $2.2B");
  });

  it("v4 매크로 섹션의 불릿은 ticker 없으므로 무시", () => {
    expect(result.tickers.length).toBe(2);
  });
});

const FIXTURE_KR = `# 📈 데일리 브리핑 — 2026-07-22 (수요일)

## 🌐 매크로

- 코스피 반등

## 🚀 RKLB — Rocket Lab USA

**$67.62 (+0.4%)** · 진단: **이벤트 드리븐 강세**

💡 **한줄**: 미국 종목은 기존대로.

## 🛡️ 064350.KS — 현대로템

**₩159,000 (-5.19%)** · 진단: **리스크 부각**

🔴 **악재**

1. 수주 모멘텀 둔화 _(연합뉴스, 7/21)_

💡 **한줄**: 방산 모멘텀 조정 국면.

## 💎 000660.KS — SK하이닉스

**₩1,764,000 (-4.23%)** · 진단: **조정·관망**

🟢 **호재**

1. HBM 공급 계약 확대 _(전자신문, 7/21)_

## 🔭 산업 트래킹

- 전력기기 특이사항 없음
`;

describe("parseBriefing — 한국 종목 (숫자 티커·₩ 가격)", () => {
  const result = parseBriefing(FIXTURE_KR, "2026-07-22");

  it("숫자로 시작하는 티커도 인식", () => {
    expect(result.tickers.map((t) => t.ticker)).toEqual([
      "RKLB",
      "064350.KS",
      "000660.KS",
    ]);
  });

  it("한국 종목 회사명 추출", () => {
    expect(result.tickers[1].name).toBe("현대로템");
    expect(result.tickers[2].name).toBe("SK하이닉스");
  });

  it("₩ 가격 라인을 close_price로 추출", () => {
    expect(result.tickers[1].close_price).toBe("₩159,000 (-5.19%)");
    expect(result.tickers[2].close_price).toBe("₩1,764,000 (-4.23%)");
  });

  it("한국 종목 호재·악재·한줄 파싱", () => {
    expect(result.tickers[1].bearish).toEqual(["수주 모멘텀 둔화 _(연합뉴스, 7/21)_"]);
    expect(result.tickers[1].summary).toBe("방산 모멘텀 조정 국면.");
    expect(result.tickers[2].bullish).toEqual(["HBM 공급 계약 확대 _(전자신문, 7/21)_"]);
  });

  it("한글 섹션 헤더(🌐 매크로·🔭 산업 트래킹)는 티커로 잡지 않음", () => {
    expect(result.tickers.length).toBe(3);
  });

  it("티커가 아닌 ## 섹션이 직전 종목을 닫음 (산업 트래킹 불릿 미흡수)", () => {
    expect(result.tickers[2].bullish).not.toContain("전력기기 특이사항 없음");
  });

  it("'가격 미수집' 라인은 close_price로 잡지 않음", () => {
    const md = [
      "## 🛡️ 064350.KS — 현대로템",
      "",
      "**가격 미수집** · 진단: **관망**",
    ].join("\n");
    expect(parseBriefing(md, "2026-07-22").tickers[0].close_price).toBeUndefined();
  });
});
