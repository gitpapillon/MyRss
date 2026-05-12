import { describe, it, expect } from "vitest";
import { splitMessage } from "../src/lib/splitter";

describe("splitMessage", () => {
  it("짧으면 한 덩어리", () => {
    expect(splitMessage("hello", 100)).toEqual(["hello"]);
  });

  it("max 넘으면 줄 단위로 분할", () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join("\n");
    const out = splitMessage(lines, 30);
    expect(out.length).toBeGreaterThan(1);
    for (const chunk of out) expect(chunk.length).toBeLessThanOrEqual(30);
  });

  it("합쳤을 때 원본 라인이 보존됨", () => {
    const lines = ["a", "bb", "ccc", "dddd", "eeeee"].join("\n");
    const out = splitMessage(lines, 5);
    expect(out.join("\n")).toBe(lines);
  });

  it("max보다 긴 단일 라인은 강제 분할", () => {
    const long = "x".repeat(100);
    const out = splitMessage(long, 30);
    expect(out.length).toBe(Math.ceil(100 / 30));
    for (const chunk of out) expect(chunk.length).toBeLessThanOrEqual(30);
  });

  it("빈 문자열 — 빈 배열이 아닌 [\"\"]", () => {
    expect(splitMessage("", 100)).toEqual([""]);
  });
});
