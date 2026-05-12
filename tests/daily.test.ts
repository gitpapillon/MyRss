import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FetchedItem } from "../src/lib/types";

const mkSourceItem = (guid: string, source: string, published_at = 0): FetchedItem => ({
  guid,
  source,
  title: guid,
  summary: null,
  link: `https://x/${guid}`,
  published_at,
  fetched_at: 0,
});

const mocks = {
  fetchAllSources: vi.fn(),
  loadSeen: vi.fn(),
  saveSeen: vi.fn(),
  diffNew: vi.fn(),
  translateArticles: vi.fn(),
  buildDigest: vi.fn(),
  sendMessage: vi.fn(),
};

vi.mock("../src/lib/feeds", () => ({
  fetchAllSources: (...args: unknown[]) => mocks.fetchAllSources(...args),
}));
vi.mock("../src/lib/state", () => ({
  loadSeen: (...args: unknown[]) => mocks.loadSeen(...args),
  saveSeen: (...args: unknown[]) => mocks.saveSeen(...args),
  diffNew: (...args: unknown[]) => mocks.diffNew(...args),
}));
vi.mock("../src/lib/translator", () => ({
  translateArticles: (...args: unknown[]) => mocks.translateArticles(...args),
}));
vi.mock("../src/lib/digest", () => ({
  buildDigest: (...args: unknown[]) => mocks.buildDigest(...args),
}));
vi.mock("../src/lib/telegram", () => ({
  sendMessage: (...args: unknown[]) => mocks.sendMessage(...args),
}));

const mkItem = (guid: string): FetchedItem => ({
  guid,
  source: "s",
  title: "t",
  summary: null,
  link: "https://x",
  published_at: 0,
  fetched_at: 0,
});

async function runDaily(args: string[] = []): Promise<void> {
  const original = process.argv;
  process.argv = ["node", "daily.ts", ...args];
  try {
    // vi.resetModules로 캐시 무효화 후 동적 import → main()이 즉시 실행됨
    vi.resetModules();
    await import("../scripts/daily");
    // main()이 비동기라 다음 tick까지 대기
    await new Promise((r) => setImmediate(r));
  } finally {
    process.argv = original;
  }
}

describe("daily orchestrator", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("first-run: seen 비었을 때 송신 skip하고 모든 guid를 seen에 mark", async () => {
    mocks.loadSeen.mockReturnValue(new Set<string>());
    mocks.fetchAllSources.mockResolvedValue({ items: [mkItem("g1"), mkItem("g2")], report: [] });

    await runDaily([]);

    expect(mocks.translateArticles).not.toHaveBeenCalled();
    expect(mocks.buildDigest).not.toHaveBeenCalled();
    // first-run 알림 1통 송신
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage.mock.calls[0][0]).toContain("초기화 완료");
    // 모든 guid가 seen에 저장
    expect(mocks.saveSeen).toHaveBeenCalledWith(["g1", "g2"]);
  });

  it("first-run + dry-run: 송신 X, seen 저장 O", async () => {
    mocks.loadSeen.mockReturnValue(new Set<string>());
    mocks.fetchAllSources.mockResolvedValue({ items: [mkItem("g1")], report: [] });

    await runDaily(["--dry-run"]);

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.saveSeen).toHaveBeenCalledWith(["g1"]);
  });

  it("신규 0건: 송신 skip, seen 합집합 저장", async () => {
    mocks.loadSeen.mockReturnValue(new Set(["g1"]));
    mocks.fetchAllSources.mockResolvedValue({ items: [mkItem("g1")], report: [] });
    mocks.diffNew.mockReturnValue([]);

    await runDaily([]);

    expect(mocks.translateArticles).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.saveSeen).toHaveBeenCalled();
  });

  it("신규 N건: 번역 → 다이제스트 빌드 → 송신 → seen 갱신", async () => {
    mocks.loadSeen.mockReturnValue(new Set(["old"]));
    mocks.fetchAllSources.mockResolvedValue({
      items: [mkItem("old"), mkItem("new1"), mkItem("new2")],
      report: [],
    });
    mocks.diffNew.mockReturnValue([mkItem("new1"), mkItem("new2")]);
    mocks.translateArticles.mockResolvedValue([
      { ...mkItem("new1"), title_ko: "t1", summary_ko: "" },
      { ...mkItem("new2"), title_ko: "t2", summary_ko: "" },
    ]);
    mocks.buildDigest.mockReturnValue("DIGEST_BODY");

    await runDaily([]);

    expect(mocks.translateArticles).toHaveBeenCalledTimes(1);
    expect(mocks.buildDigest).toHaveBeenCalledTimes(1);
    expect(mocks.sendMessage).toHaveBeenCalledWith("DIGEST_BODY", { parseMode: "MarkdownV2" });
    expect(mocks.saveSeen).toHaveBeenCalled();
  });

  it("컷오프 적용: 소스별 5건 초과 신규는 번역 대상에서 제외", async () => {
    mocks.loadSeen.mockReturnValue(new Set(["old"]));
    // 소스 A 7건, 소스 B 3건 — 컷오프 후 A는 상위 5건만 통과해야 함
    const aItems = Array.from({ length: 7 }, (_, i) =>
      mkSourceItem(`a${i}`, "A", 100 - i)
    );
    const bItems = Array.from({ length: 3 }, (_, i) =>
      mkSourceItem(`b${i}`, "B", 200 - i)
    );
    const items = [mkSourceItem("old", "X"), ...aItems, ...bItems];
    mocks.fetchAllSources.mockResolvedValue({ items, report: [] });
    mocks.diffNew.mockReturnValue([...aItems, ...bItems]);
    mocks.translateArticles.mockResolvedValue([]);
    mocks.buildDigest.mockReturnValue("DIGEST");

    await runDaily([]);

    expect(mocks.translateArticles).toHaveBeenCalledTimes(1);
    const passed = mocks.translateArticles.mock.calls[0][0] as FetchedItem[];
    expect(passed).toHaveLength(8); // A 5건 + B 3건
    const aCount = passed.filter((it) => it.source === "A").length;
    const bCount = passed.filter((it) => it.source === "B").length;
    expect(aCount).toBe(5);
    expect(bCount).toBe(3);
  });

  it("dry-run + 신규 N건: 송신 X, stdout 출력 O, seen 갱신 X 아님 — 저장은 그대로 함", async () => {
    mocks.loadSeen.mockReturnValue(new Set(["old"]));
    mocks.fetchAllSources.mockResolvedValue({ items: [mkItem("old"), mkItem("new1")], report: [] });
    mocks.diffNew.mockReturnValue([mkItem("new1")]);
    mocks.translateArticles.mockResolvedValue([
      { ...mkItem("new1"), title_ko: "t1", summary_ko: "" },
    ]);
    mocks.buildDigest.mockReturnValue("DIGEST_BODY");

    await runDaily(["--dry-run"]);

    expect(mocks.sendMessage).not.toHaveBeenCalled();
    expect(mocks.saveSeen).toHaveBeenCalled(); // dry-run에서도 state 저장 (의도된 동작)
  });
});
