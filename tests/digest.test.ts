import { describe, it, expect } from "vitest";
import { buildDigest } from "../src/lib/digest";
import type { TranslatedArticle } from "../src/lib/types";

const article = (overrides: Partial<TranslatedArticle> = {}): TranslatedArticle => ({
  guid: "g1",
  source: "reuters",
  title: "Title",
  summary: "Summary",
  link: "https://example.com/a",
  published_at: 1700000000,
  fetched_at: 1700000000,
  title_ko: "제목",
  summary_ko: "요약",
  ...overrides,
});

describe("buildDigest", () => {
  it("빈 배열 → 기본 메시지", () => {
    const out = buildDigest([]);
    expect(out).toContain("오늘은 새 기사가 없습니다");
  });

  it("1건 — 헤더 + 소스명 + 제목 + 요약 + 링크 포함", () => {
    const out = buildDigest([article()]);
    expect(out).toContain("RSS 다이제스트");
    expect(out).toContain("reuters");
    expect(out).toContain("제목");
    expect(out).toContain("요약");
    expect(out).toContain("https://example.com/a");
    expect(out).toContain("[원문]");
  });

  it("여러 소스 — 그룹화", () => {
    const out = buildDigest([
      article({ guid: "g1", source: "reuters", title_ko: "A1" }),
      article({ guid: "g2", source: "cnbc", title_ko: "A2" }),
      article({ guid: "g3", source: "reuters", title_ko: "A3" }),
    ]);
    // reuters 섹션이 cnbc보다 먼저 등장
    const reutersIdx = out.indexOf("reuters");
    const cnbcIdx = out.indexOf("cnbc");
    expect(reutersIdx).toBeGreaterThan(-1);
    expect(cnbcIdx).toBeGreaterThan(reutersIdx);
    // reuters 섹션에 A1, A3 둘 다
    const reutersSection = out.slice(reutersIdx, cnbcIdx);
    expect(reutersSection).toContain("A1");
    expect(reutersSection).toContain("A3");
  });

  it("소스별 카운트 표기", () => {
    const out = buildDigest([
      article({ guid: "g1", source: "x" }),
      article({ guid: "g2", source: "x" }),
    ]);
    // "x (2건)" — 괄호는 escape되어 \( \)
    expect(out).toMatch(/x.*2건/);
  });

  it("summary_ko가 빈 문자열이면 요약 라인 생략", () => {
    const out = buildDigest([article({ summary_ko: "" })]);
    // 요약 라인이 없어야 한다 — "요약"이라는 단어 자체가 없음 (테스트 데이터에 \"요약\" 텍스트 없도록)
    const lines = out.split("\n");
    const titleLineIdx = lines.findIndex((l) => l.includes("제목"));
    const nextLine = lines[titleLineIdx + 1] ?? "";
    // 다음 줄은 [원문] 링크여야 함 (요약 줄 X)
    expect(nextLine).toContain("[원문]");
  });

  it("MarkdownV2 escape — 점·하이픈 escape 확인", () => {
    const out = buildDigest([article()]);
    // "1." 표시는 "1\\." 로 escape
    expect(out).toContain("1\\.");
    // 날짜 하이픈은 escape
    expect(out).toMatch(/\d{4}\\-\d{2}\\-\d{2}/);
  });

  it("URL은 . / : 등을 escape하지 않음 (MarkdownV2 link 규칙)", () => {
    const out = buildDigest([article({ link: "https://example.com/path?q=1" })]);
    expect(out).toContain("https://example.com/path?q=1");
    expect(out).not.toContain("https:\\//");
  });

  it("URL에 ) 포함 시 escape", () => {
    const out = buildDigest([article({ link: "https://example.com/a)b" })]);
    expect(out).toContain("https://example.com/a\\)b");
  });

  it("4096자 초과 시 잘리고 ellipsis 부착", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      article({
        guid: `g${i}`,
        source: "src",
        title_ko: `매우긴제목 ${i} `.repeat(10),
        summary_ko: `매우긴요약 ${i} `.repeat(10),
      })
    );
    const out = buildDigest(many);
    expect(out.length).toBeLessThanOrEqual(4096);
    expect(out).toContain("이하 생략");
  });

  it("제목·요약의 특수문자 escape (괄호, 점 등)", () => {
    const out = buildDigest([
      article({ title_ko: "A.B (test)", summary_ko: "x_y*z" }),
    ]);
    expect(out).toContain("A\\.B \\(test\\)");
    expect(out).toContain("x\\_y\\*z");
  });
});
