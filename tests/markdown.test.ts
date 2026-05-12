import { describe, it, expect } from "vitest";
import { gfmToMd2 } from "../src/lib/markdown";

describe("gfmToMd2", () => {
  it("일반 텍스트 — 특수문자 escape", () => {
    expect(gfmToMd2("Hello v1.2 (test)!")).toBe("Hello v1\\.2 \\(test\\)\\!");
  });

  it("**bold** → *bold* (single asterisk)", () => {
    expect(gfmToMd2("**hello**")).toBe("*hello*");
  });

  it("bold 내부 특수문자 escape", () => {
    expect(gfmToMd2("**v1.2**")).toBe("*v1\\.2*");
  });

  it("_italic_ → _italic_", () => {
    expect(gfmToMd2("_hello_")).toBe("_hello_");
  });

  it("italic 내부 (괄호) escape", () => {
    expect(gfmToMd2("_(Motley Fool, 5/8)_")).toBe("_\\(Motley Fool, 5/8\\)_");
  });

  it("# 헤딩 → *볼드*", () => {
    expect(gfmToMd2("# Header Title")).toBe("*Header Title*");
  });

  it("## 헤딩도 *볼드*", () => {
    expect(gfmToMd2("## Section")).toBe("*Section*");
  });

  it("--- 가로줄 → 유니코드 라인", () => {
    expect(gfmToMd2("---")).toBe("━━━━━━━━━━");
  });

  it("리스트 - → • 변환 + 내용 escape", () => {
    expect(gfmToMd2("- item 1.0")).toBe("• item 1\\.0");
  });

  it("blockquote > 보존", () => {
    expect(gfmToMd2("> warning text")).toBe(">warning text");
  });

  it("링크 [text](url) — text 일반 escape, url은 ) \\ 만 escape", () => {
    expect(gfmToMd2("[Click here](https://example.com/path)")).toBe(
      "[Click here](https://example.com/path)"
    );
  });

  it("복합 라인: 볼드 + 일반 + 이탤릭", () => {
    const input = "**Bold part**: plain text _italic_";
    expect(gfmToMd2(input)).toBe("*Bold part*: plain text _italic_");
  });

  it("여러 줄 입력 보존", () => {
    const input = "# Title\n\n**bold**\n- list item";
    expect(gfmToMd2(input)).toBe("*Title*\n\n*bold*\n• list item");
  });

  it("emoji 그대로 통과", () => {
    expect(gfmToMd2("🟢 호재")).toBe("🟢 호재");
  });
});
