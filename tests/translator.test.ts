import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { translateArticles } from "../src/lib/translator";
import type { FetchedItem } from "../src/lib/types";

const item = (guid: string, title: string, summary: string | null = null): FetchedItem => ({
  guid,
  source: "test",
  title,
  summary,
  link: `https://example.com/${guid}`,
  published_at: 1700000000,
  fetched_at: 1700000000,
});

const textBlock = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

describe("translator", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("빈 입력 → 빈 출력, API 미호출", async () => {
    const out = await translateArticles([]);
    expect(out).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("정상 응답을 TranslatedArticle로 변환", async () => {
    mockCreate.mockResolvedValueOnce(
      textBlock('[{"guid":"g1","title_ko":"제목","summary_ko":"요약"}]')
    );
    const out = await translateArticles([item("g1", "Title", "Summary")]);
    expect(out).toHaveLength(1);
    expect(out[0].guid).toBe("g1");
    expect(out[0].title_ko).toBe("제목");
    expect(out[0].summary_ko).toBe("요약");
    // 원본 필드도 유지되어야 함
    expect(out[0].title).toBe("Title");
    expect(out[0].link).toBe("https://example.com/g1");
  });

  it("API 응답에서 빠진 guid는 원본 영문으로 fallback", async () => {
    mockCreate.mockResolvedValueOnce(
      textBlock('[{"guid":"g1","title_ko":"제목1","summary_ko":""}]')
    );
    const out = await translateArticles([item("g1", "T1"), item("g2", "T2", "S2")]);
    expect(out[0].title_ko).toBe("제목1");
    expect(out[1].title_ko).toBe("T2"); // fallback
    expect(out[1].summary_ko).toBe("S2");
  });

  it("코드펜스로 감싼 JSON도 파싱", async () => {
    mockCreate.mockResolvedValueOnce(
      textBlock('```json\n[{"guid":"g1","title_ko":"제목","summary_ko":""}]\n```')
    );
    const out = await translateArticles([item("g1", "T")]);
    expect(out[0].title_ko).toBe("제목");
  });

  it("CHUNK_SIZE 초과 입력은 여러 번 호출", async () => {
    mockCreate
      .mockResolvedValueOnce(
        textBlock(
          JSON.stringify(
            Array.from({ length: 20 }, (_, i) => ({
              guid: `g${i}`,
              title_ko: `제목${i}`,
              summary_ko: "",
            }))
          )
        )
      )
      .mockResolvedValueOnce(
        textBlock('[{"guid":"g20","title_ko":"제목20","summary_ko":""}]')
      );
    const inputs = Array.from({ length: 21 }, (_, i) => item(`g${i}`, `Title${i}`));
    const out = await translateArticles(inputs);
    expect(out).toHaveLength(21);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(out[20].title_ko).toBe("제목20");
  });

  it("API가 비어있는 응답을 주면 throw", async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });
    await expect(translateArticles([item("g1", "T")])).rejects.toThrow(/Empty response/);
  });

  it("JSON 파싱 실패 시 throw", async () => {
    mockCreate.mockResolvedValueOnce(textBlock("not json at all"));
    await expect(translateArticles([item("g1", "T")])).rejects.toThrow(/No JSON array/);
  });

  it("올바른 모델과 system 프롬프트로 호출", async () => {
    mockCreate.mockResolvedValueOnce(textBlock('[{"guid":"g1","title_ko":"x","summary_ko":""}]'));
    await translateArticles([item("g1", "T")]);
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
    expect(typeof call.system).toBe("string");
    expect(call.system).toContain("한국어로 번역");
  });
});
