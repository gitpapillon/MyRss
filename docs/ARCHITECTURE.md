# 아키텍처

## 디렉토리 구조
```
src/lib/
├── types.ts          # Article, SourceDef, FetchedItem 등 타입 정의
├── feeds.ts          # RSS fetch (rss-parser) — 기존 코드 유지
├── translator.ts     # Anthropic Haiku 번역 + prompt caching
├── telegram.ts       # Telegram Bot API sendMessage
├── digest.ts         # 다이제스트 메시지 빌더
└── state.ts          # seen.json 로드/저장/diff

scripts/
├── daily.ts          # 일일 orchestration 진입점
├── execute.py        # harness step executor (Python)
└── test_execute.py

tests/                # vitest 단위 테스트 (state.test.ts, translator.test.ts, telegram.test.ts, digest.test.ts)
state/seen.json       # dedup 상태 (commit됨)
.github/workflows/daily.yml   # cron
docs/                 # PRD, ARCHITECTURE, ADR
.claude/              # harness 가드레일 / commands / settings
phases/               # task별 step 실행 메타데이터
```

## 데이터 흐름
```
GitHub Actions cron (30 22 * * *)
  → tsx scripts/daily.ts [--dry-run]
    → state.loadSeen()                          # 이전 guid 셋 로드
    → feeds.fetchAllSources()                   # 5개 RSS fetch
    → state.diffNew(items, seen)                # 신규 guid만 추출
    → first-run guard: seen 비었으면 송신 skip + "초기화 완료" 1줄만 송신
    → translator.translateArticles(new items)   # 한국어 번역
    → digest.buildDigest(translated)            # MarkdownV2 메시지
    → telegram.sendMessage(text)                # 송신 (dry-run이면 stdout에 출력)
    → state.saveSeen(allSeenGuids)              # seen.json 갱신
  → workflow가 state/seen.json commit + push
```

## 환경변수 / 시크릿 (단일 진실 원점)
| 이름 | 사용 위치 | 비고 |
|---|---|---|
| `ANTHROPIC_API_KEY` | `src/lib/translator.ts` | Anthropic SDK가 자동 인식 |
| `TELEGRAM_BOT_TOKEN` | `src/lib/telegram.ts` | URL 빌드에 사용 |
| `TELEGRAM_CHAT_ID` | `scripts/daily.ts` | sendMessage에 전달 |

## 인터페이스 시그니처 (단일 진실 원점)

`src/lib/types.ts`에서 공통 타입 정의:
```typescript
export interface SourceDef { id: string; name: string; url: string; }
export interface FetchedItem {
  guid: string;
  source: string;
  title: string;
  summary: string | null;
  link: string;
  published_at: number;   // unix seconds
  fetched_at: number;
}
export interface TranslatedArticle extends FetchedItem {
  title_ko: string;
  summary_ko: string;
}
```

`src/lib/state.ts`:
```typescript
export function loadSeen(): Set<string>;
export function saveSeen(guids: Iterable<string>): void;
export function diffNew(items: FetchedItem[], seen: Set<string>): FetchedItem[];
// 내부: state/seen.json 형식 = { "seen": ["<guid>", ...], "updated_at": "<ISO>" }
// 최근 30일치 guid만 보관 (saveSeen에서 가지치기 — 단, FetchedItem은 매개변수 없음 → 보관 정책은 daily.ts가 결정 후 saveSeen에 넘긴다)
```

`src/lib/translator.ts`:
```typescript
import type { FetchedItem, TranslatedArticle } from "./types";
export async function translateArticles(items: FetchedItem[]): Promise<TranslatedArticle[]>;
// 내부: @anthropic-ai/sdk, model = "claude-haiku-4-5-20251001"
// prompt caching: system 메시지에 cache_control: { type: "ephemeral" }
// 출력은 JSON 배열 강제. 입력 guid를 그대로 응답에 유지.
```

`src/lib/telegram.ts`:
```typescript
export async function sendMessage(text: string, opts?: { parseMode?: "MarkdownV2" | "HTML" }): Promise<void>;
export function escapeMarkdownV2(s: string): string;
// 내부: fetch로 https://api.telegram.org/bot<TOKEN>/sendMessage 호출
// TELEGRAM_CHAT_ID는 caller가 인자로 전달 X — daily.ts가 호출 시 process.env.TELEGRAM_CHAT_ID 사용 → telegram.ts 내부에서 env 직접 읽음
```

`src/lib/digest.ts`:
```typescript
import type { TranslatedArticle } from "./types";
export function buildDigest(articles: TranslatedArticle[]): string;
// 소스별 그룹화. MarkdownV2 escape 적용. 길이 제한 4096자 — 초과 시 잘라내고 "(이하 생략)" 표기
```

`scripts/daily.ts`:
```typescript
// CLI: --dry-run 플래그 지원. dry-run이면 sendMessage 호출 X, 메시지 본문을 stdout 출력.
// 종료 코드 0 = 정상, 1 = 에러
// First-run guard: seen이 비었으면 buildDigest 건너뛰고 "초기화 완료, 다음 실행부터 다이제스트가 도착합니다." 송신
```

## 패턴
- Server-side only. 브라우저/UI 없음.
- 외부 IO(API, 파일, 네트워크)는 lib 모듈에만. scripts/는 호출만.
- 모든 lib 함수에 vitest 단위 테스트 필수.

## 상태 관리
- `state/seen.json` 형식: `{ "seen": ["<guid>", ...], "updated_at": "<ISO>" }`.
- 최대 보관: 최근 30일치 guid. 가지치기는 daily.ts에서 (FetchedItem의 published_at 기준).
