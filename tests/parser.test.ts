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
