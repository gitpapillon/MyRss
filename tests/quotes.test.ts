import { describe, it, expect } from "vitest";
import { parseYahooChart } from "../src/lib/quotes";

function chart(closes: (number | null)[]) {
  return JSON.stringify({
    chart: { result: [{ indicators: { quote: [{ close: closes }] } }] },
  });
}

describe("parseYahooChart", () => {
  it("일봉 종가 배열의 마지막 2개로 price/prevClose", () => {
    expect(parseYahooChart(chart([117.35, 117.56, 124.15, 132.55, 124.77]))).toEqual({
      price: 124.77,
      prevClose: 132.55,
    });
  });

  it("말단 null 종가(거래중 빈 봉)는 제외하고 직전 2개 사용", () => {
    expect(parseYahooChart(chart([100, 110, 120, null]))).toEqual({
      price: 120,
      prevClose: 110,
    });
  });

  it("유효 종가 2개 미만이면 null", () => {
    expect(parseYahooChart(chart([null, 100]))).toBeNull();
  });

  it("0·음수 종가는 제외", () => {
    expect(parseYahooChart(chart([0, -1, 50]))).toBeNull();
  });

  it("result 없으면 null", () => {
    expect(parseYahooChart(JSON.stringify({ chart: { result: [] } }))).toBeNull();
  });

  it("잘못된 JSON 이면 null", () => {
    expect(parseYahooChart("not json")).toBeNull();
  });
});
