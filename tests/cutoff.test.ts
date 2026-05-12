import { describe, it, expect } from "vitest";
import { topKPerSource, TOP_K_PER_SOURCE } from "../src/lib/cutoff";
import type { FetchedItem } from "../src/lib/types";

const mk = (guid: string, source: string, published_at: number): FetchedItem => ({
  guid,
  source,
  title: guid,
  summary: null,
  link: `https://x/${guid}`,
  published_at,
  fetched_at: 0,
});

describe("topKPerSource", () => {
  it("빈 입력 → 빈 출력", () => {
    expect(topKPerSource([], 5)).toEqual([]);
  });

  it("소스별 상위 K개만 통과", () => {
    const items = [
      mk("a1", "A", 10),
      mk("a2", "A", 9),
      mk("a3", "A", 8),
      mk("b1", "B", 5),
      mk("b2", "B", 4),
    ];
    const out = topKPerSource(items, 2);
    const guids = out.map((i) => i.guid).sort();
    expect(guids).toEqual(["a1", "a2", "b1", "b2"]);
  });

  it("published_at 내림차순으로 정렬 후 자름 (RSS 순서와 무관)", () => {
    const items = [
      mk("old", "A", 1),
      mk("new", "A", 100),
      mk("mid", "A", 50),
    ];
    const out = topKPerSource(items, 2);
    expect(out.map((i) => i.guid)).toEqual(["new", "mid"]);
  });

  it("K가 입력보다 크면 모두 통과", () => {
    const items = [mk("a1", "A", 1), mk("b1", "B", 2)];
    expect(topKPerSource(items, 10)).toHaveLength(2);
  });

  it("K=0이면 빈 결과", () => {
    expect(topKPerSource([mk("a1", "A", 1)], 0)).toEqual([]);
  });

  it("기본 상수 TOP_K_PER_SOURCE는 5", () => {
    expect(TOP_K_PER_SOURCE).toBe(5);
  });
});
