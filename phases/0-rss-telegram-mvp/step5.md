# Step 5: daily-orchestrator

## 읽어야 할 파일

- `CLAUDE.md` — 명령어 섹션 (`npm run daily`, `--dry-run`), CRITICAL 규칙
- `docs/ARCHITECTURE.md` — 데이터 흐름, `daily.ts` 시그니처
- `docs/PRD.md` — first-run guard 정책
- `docs/ADR.md` — ADR-008 (first-run guard)
- `src/lib/feeds.ts` — `fetchAllSources` 반환 형식
- `src/lib/state.ts` (step 1) — `loadSeen`, `saveSeen`, `diffNew`
- `src/lib/translator.ts` (step 2) — `translateArticles`
- `src/lib/telegram.ts` (step 3) — `sendMessage`
- `src/lib/digest.ts` (step 4) — `buildDigest`

## 작업

### A. `scripts/daily.ts` 신규 작성

Write로 새 파일 생성. 본문 그대로 사용:

```typescript
#!/usr/bin/env tsx
import { fetchAllSources } from "../src/lib/feeds";
import { loadSeen, saveSeen, diffNew } from "../src/lib/state";
import { translateArticles } from "../src/lib/translator";
import { buildDigest } from "../src/lib/digest";
import { sendMessage } from "../src/lib/telegram";

const FIRST_RUN_MESSAGE = "🟢 RSS 봇 초기화 완료. 다음 실행부터 다이제스트가 도착합니다.";

function isDryRun(): boolean {
  return process.argv.slice(2).includes("--dry-run");
}

async function main(): Promise<void> {
  const dryRun = isDryRun();
  console.log(`[daily] start (dry-run=${dryRun})`);

  const seen = loadSeen();
  const isFirstRun = seen.size === 0;
  console.log(`[daily] seen=${seen.size} (first-run=${isFirstRun})`);

  const { items, report } = await fetchAllSources();
  console.log(`[daily] fetched ${items.length} items from ${report.length} sources`);
  for (const r of report) {
    if (!r.ok) console.warn(`[daily] source failed: ${r.source} (${r.error ?? "unknown"})`);
  }

  if (isFirstRun) {
    if (dryRun) {
      console.log(`[daily] (dry-run) FIRST-RUN: would send: ${FIRST_RUN_MESSAGE}`);
    } else {
      await sendMessage(FIRST_RUN_MESSAGE);
    }
    saveSeen(items.map((i) => i.guid));
    console.log(`[daily] first-run init: marked ${items.length} items as seen`);
    return;
  }

  const newItems = diffNew(items, seen);
  console.log(`[daily] new items: ${newItems.length}`);

  if (newItems.length === 0) {
    console.log("[daily] no new items. skipping send.");
    saveSeen([...seen, ...items.map((i) => i.guid)]);
    return;
  }

  console.log(`[daily] translating ${newItems.length} items...`);
  const translated = await translateArticles(newItems);

  const digest = buildDigest(translated);
  console.log(`[daily] digest length: ${digest.length} chars`);

  if (dryRun) {
    console.log("\n=== DIGEST (dry-run) ===\n");
    console.log(digest);
    console.log("\n=== END ===\n");
  } else {
    await sendMessage(digest, { parseMode: "MarkdownV2" });
    console.log("[daily] digest sent.");
  }

  saveSeen([...seen, ...items.map((i) => i.guid)]);
  console.log("[daily] state saved.");
}

main().catch((e) => {
  console.error("[daily] FATAL:", e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
```

### B. `tests/daily.test.ts` 신규 작성 — orchestration 동작 검증

vitest. 모든 lib을 mock하고 daily.ts의 분기 로직을 검증한다.

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FetchedItem } from "../src/lib/types";

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
```

> **참고**: 이 테스트는 `scripts/daily.ts`를 import할 때 main()이 즉시 실행되는 구조를 활용한다. `vi.resetModules()`로 매 케이스마다 새로 import한다.

## Acceptance Criteria

```bash
test -f scripts/daily.ts
test -f tests/daily.test.ts
npm run build
npx vitest run tests/daily.test.ts
```

위 모두 0으로 종료. 단위 테스트 **5개 전부** 통과.

## 검증 절차

1. `scripts/daily.ts`가 위 A 본문과 일치.
2. 5개 orchestration 테스트 통과 — 특히 first-run guard와 dry-run 분기.
3. `npm run build` 통과.
4. step 5 status:
   - 통과 → `"completed"`, `"summary": "daily.ts (first-run guard + dry-run + 5단계 orchestration) + daily.test.ts 5 case 통과"`

## 금지사항

- **`scripts/daily.ts`에서 직접 fetch/sendMessage 호출 금지.** 반드시 `src/lib/*` 모듈 함수만 호출. 이유: 외부 IO 격리 (ARCHITECTURE 패턴).
- 환경변수를 daily.ts 안에서 직접 읽지 마라. `telegram.ts`, `translator.ts`가 내부에서 처리. 이유: 시크릿 관리 1곳 집중.
- 신규 의존성 (commander, yargs 등 CLI 파서) 추가 금지. `--dry-run` 한 플래그만 받으므로 `process.argv.includes` 충분.
- 30일 가지치기 로직 추가 금지. 이유: scope 최소화. seen.json 크기는 추후 별도 step에서 다룬다.
- `.github/workflows/daily.yml`은 이 step에서 작성하지 마라. 이미 사전 셋업에 포함됨. 만약 수정 필요해 보이면 → status를 `blocked`로 두고 reason에 명시한다.
