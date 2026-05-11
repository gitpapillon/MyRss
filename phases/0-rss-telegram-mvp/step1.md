# Step 1: state-json

## 읽어야 할 파일

먼저 아래 파일들을 Read 도구로 읽고 설계 의도를 파악하라:

- `CLAUDE.md` — 프로젝트 규칙, 시크릿 처리, CRITICAL 사항
- `docs/ARCHITECTURE.md` — 디렉토리 구조 + 인터페이스 시그니처 (단일 진실 원점)
- `docs/ADR.md` — ADR-004 (seen.json 결정), ADR-008 (first-run guard)
- `src/lib/types.ts` — 기존 타입 정의 (수정 대상)
- `src/lib/feeds.ts` — `FetchedItem`이 어떻게 만들어지는지 (수정 금지, 참고만)

## 작업

### A. `src/lib/types.ts` 재작성

기존 파일을 **완전히 덮어쓰고** 아래 내용으로 Write:

```typescript
export interface SourceDef {
  id: string;
  name: string;
  url: string;
}

export interface FetchedItem {
  guid: string;
  source: string;
  title: string;
  summary: string | null;
  link: string;
  published_at: number; // unix seconds
  fetched_at: number;
}

export interface TranslatedArticle extends FetchedItem {
  title_ko: string;
  summary_ko: string;
}

export interface SeenStateFile {
  seen: string[];
  updated_at: string; // ISO 8601
}
```

### B. `src/lib/state.ts` 신규 작성

Write로 새 파일 생성. 시그니처는 `docs/ARCHITECTURE.md`와 정확히 일치해야 한다.

```typescript
import fs from "node:fs";
import path from "node:path";
import type { FetchedItem, SeenStateFile } from "./types";

const STATE_DIR = path.join(process.cwd(), "state");
const STATE_FILE = path.join(STATE_DIR, "seen.json");

export function loadSeen(): Set<string> {
  // 파일 없으면 빈 Set 반환 (first-run)
  // 파일 있으면 파싱 → Set으로 변환
  // JSON 파싱 실패 시 throw (오류 은폐 금지)
}

export function saveSeen(guids: Iterable<string>): void {
  // STATE_DIR이 없으면 mkdir -p
  // SeenStateFile 형식으로 직렬화: { seen: [...], updated_at: <ISO> }
  // updated_at은 new Date().toISOString()
  // seen 배열은 중복 제거 + 정렬 (안정적 diff 위해)
}

export function diffNew(items: FetchedItem[], seen: Set<string>): FetchedItem[] {
  // items 중 seen에 없는 것만 반환
  // 입력 items의 순서를 보존한다
}
```

**금지**: `STATE_DIR`/`STATE_FILE` 경로를 환경변수나 인자로 외부화하지 마라. 이유: 단순성 우선, ADR-004의 "단일 JSON 파일" 원칙.

**금지**: 가지치기(30일치) 로직을 state.ts에 넣지 마라. 이유: state.ts는 guid 셋만 다룬다 — 시간 정보를 알 수 없다. 가지치기는 daily.ts(step 5)에서 published_at 기준으로 처리하고 saveSeen에 줄어든 셋을 넘긴다.

### C. `tests/state.test.ts` 신규 작성

vitest 단위 테스트. 아래 케이스 **전부** 포함:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadSeen, saveSeen, diffNew } from "../src/lib/state";
import type { FetchedItem } from "../src/lib/types";

const STATE_FILE = path.join(process.cwd(), "state", "seen.json");

function removeStateFile() {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

describe("state", () => {
  beforeEach(removeStateFile);
  afterEach(removeStateFile);

  describe("loadSeen", () => {
    it("파일이 없으면 빈 Set 반환", () => {
      expect(loadSeen().size).toBe(0);
    });

    it("seen.json을 읽어 Set으로 반환", () => {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, JSON.stringify({ seen: ["a", "b", "c"], updated_at: "2026-01-01T00:00:00Z" }));
      const result = loadSeen();
      expect(result.size).toBe(3);
      expect(result.has("a")).toBe(true);
      expect(result.has("b")).toBe(true);
      expect(result.has("c")).toBe(true);
    });

    it("JSON 파싱 실패 시 throw", () => {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, "not json");
      expect(() => loadSeen()).toThrow();
    });
  });

  describe("saveSeen", () => {
    it("디렉토리 없으면 만들고 파일 작성", () => {
      saveSeen(["x", "y"]);
      expect(fs.existsSync(STATE_FILE)).toBe(true);
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      expect(new Set(data.seen)).toEqual(new Set(["x", "y"]));
      expect(typeof data.updated_at).toBe("string");
    });

    it("중복 제거 + 정렬", () => {
      saveSeen(["c", "a", "b", "a"]);
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      expect(data.seen).toEqual(["a", "b", "c"]);
    });

    it("Set도 받을 수 있음 (Iterable)", () => {
      saveSeen(new Set(["m", "n"]));
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      expect(new Set(data.seen)).toEqual(new Set(["m", "n"]));
    });
  });

  describe("diffNew", () => {
    const mkItem = (guid: string): FetchedItem => ({
      guid,
      source: "test",
      title: "t",
      summary: null,
      link: "https://example.com",
      published_at: 0,
      fetched_at: 0,
    });

    it("seen에 없는 것만 반환", () => {
      const items = [mkItem("a"), mkItem("b"), mkItem("c")];
      const seen = new Set(["b"]);
      expect(diffNew(items, seen).map((i) => i.guid)).toEqual(["a", "c"]);
    });

    it("입력 순서 보존", () => {
      const items = [mkItem("z"), mkItem("y"), mkItem("x")];
      expect(diffNew(items, new Set()).map((i) => i.guid)).toEqual(["z", "y", "x"]);
    });

    it("빈 입력 → 빈 배열", () => {
      expect(diffNew([], new Set(["a"]))).toEqual([]);
    });
  });
});
```

## Acceptance Criteria

```bash
test -f src/lib/state.ts
test -f tests/state.test.ts
npm run build
npx vitest run tests/state.test.ts
```

위 4개 명령 모두 0으로 종료. 단위 테스트가 **모두** 통과해야 한다.

## 검증 절차

1. `src/lib/types.ts`가 위 A 본문과 정확히 일치하는지 Read로 확인.
2. `src/lib/state.ts`의 export된 3개 함수 시그니처가 `docs/ARCHITECTURE.md`와 일치하는지 확인.
3. `tests/state.test.ts`의 모든 case가 통과하는지 `npx vitest run tests/state.test.ts`로 확인.
4. `npm run build`로 타입 체크 통과 확인.
5. `phases/0-rss-telegram-mvp/index.json`의 step 1 status 업데이트:
   - 통과 → `"completed"`, `"summary": "state.ts + types.ts 갱신 + state.test.ts (N case 통과)"`
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- `state/seen.json` 파일을 commit하거나 사전 채우기 금지. 이유: 첫 실행 시 first-run guard가 발동해야 한다 (ADR-008).
- 30일 가지치기 로직을 state.ts에 넣지 마라. 이유: 위 작업 B에 명시.
- `STATE_FILE` 경로 외부화 금지 (인자/환경변수). 이유: 단순성.
- `src/lib/feeds.ts` 수정 금지. 이유: 이 step의 scope 밖.
- 신규 의존성 추가 금지. 이유: CLAUDE.md CRITICAL.
