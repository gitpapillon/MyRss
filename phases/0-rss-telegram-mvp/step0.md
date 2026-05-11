# Step 0: harness-docs

## 읽어야 할 파일

이 step은 다른 파일을 의존하지 않는다. 시작 가드레일에 포함된 규칙만 따른다.

## 작업

다음 4개 파일을 정확히 아래 내용으로 **Write 도구**로 생성하라. 이미 존재하면 overwrite. 본문은 한 글자도 바꾸지 말고 그대로 옮긴다 (코드 블록 안 ` ``` ` 펜스 포함).

### 파일 1: `CLAUDE.md` (프로젝트 루트)

````markdown
# RSS-Telegram Daily Digest

영문 금융 RSS를 매일 07:30 KST에 한국어 다이제스트로 텔레그램에 전달하는 일일 봇.

## 기술 스택
- TypeScript strict mode (`tsc --noEmit`)
- 런타임: tsx (`tsx scripts/daily.ts`)
- 라이브러리: `@anthropic-ai/sdk`, `rss-parser` (그 외 신규 의존성 추가 금지)
- 테스트: vitest
- CI: GitHub Actions cron `30 22 * * *` UTC = 07:30 KST

## 아키텍처 규칙
- CRITICAL: 시크릿(`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)을 코드·테스트·로그·커밋 메시지에 절대 하드코딩 금지. 반드시 `process.env.<KEY>` 경유.
- CRITICAL: dedup 상태는 `state/seen.json` 단일 파일에만 저장한다. sqlite 등 별도 DB 도입 금지.
- CRITICAL: Next.js, tailwind, postcss, better-sqlite3, @google/genai, react 의존성 신규 추가 금지.
- 모든 외부 IO는 `src/lib/` 하위 모듈로 격리한다. `scripts/`는 orchestration만 담당.
- 시그니처는 `docs/ARCHITECTURE.md`의 "인터페이스 시그니처" 섹션을 단일 진실 원점으로 따른다.

## 개발 프로세스
- CRITICAL: 새로운 lib 모듈 추가 시 vitest 단위 테스트를 함께 작성하고 통과시킨다.
- 커밋 메시지: conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`).

## 환경변수 / 시크릿 (단일 진실 원점)
| 이름 | 용도 | 형식 |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API 호출 | `sk-ant-…` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API | `<bot_id>:<bot_secret>` |
| `TELEGRAM_CHAT_ID` | 수신자 chat_id | 정수 문자열 |

## 명령어
```bash
npm install                      # 의존성 설치 (최초 1회 + package.json 변경 시)
npm run build                    # tsc --noEmit (타입 검증)
npm run test                     # vitest run --passWithNoTests
npm run daily                    # tsx scripts/daily.ts (실전 송신)
npm run daily -- --dry-run       # 메시지 빌드까지만, 전송 X
```
````

### 파일 2: `docs/PRD.md`

````markdown
# PRD: RSS-Telegram Daily Digest

## 목표
매일 07:30 KST에 영문 금융/경제 RSS 5개 소스에서 신규 기사를 수집해 한국어 다이제스트 1통으로 Telegram에 전달한다.

## 사용자
본인 1명 (단일 chat_id).

## 핵심 기능
1. 5개 RSS 소스 fetch (Reuters / MarketWatch / CNBC / Yahoo Finance / Investopedia — 기존 `src/lib/feeds.ts`의 `SOURCES`)
2. 신규 기사 dedup (이전에 본 guid 제외)
3. 영문 → 한국어 번역 (Claude Haiku 4.5, prompt caching 적용)
4. 소스별 그룹화 다이제스트 메시지 1통 송신 (Telegram MarkdownV2)
5. dedup 상태(`state/seen.json`)를 GitHub Actions 워크플로가 commit-back

## MVP 제외 사항
- 웹 UI (Next.js / React / tailwind 등 일체)
- 검색·북마크·읽음 표시
- 다중 사용자 / 다중 chat_id
- 실시간 푸시 (cron 1일 1회만)
- 다른 언어 / 다른 소스 추가 UI

## 운영 시각
매일 07:30 KST = `30 22 * * *` UTC.

## First-run guard
`state/seen.json`이 빈 상태(첫 cron 실행)면, fetch한 모든 guid를 seen에 mark하고 다이제스트 송신을 skip한다. 대신 "초기화 완료, 다음 실행부터 다이제스트가 도착합니다." 한 줄 알림만 송신한다.

이유: 초기에 수십~수백 건이 1통에 몰려 Telegram 4096자 제한 초과 또는 가독성 ↓.
````

### 파일 3: `docs/ARCHITECTURE.md`

````markdown
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
````

### 파일 4: `docs/ADR.md`

````markdown
# Architecture Decision Records

## 철학
MVP 속도 최우선. 외부 의존성 최소화. 작동하는 최소 구현. 1인 사용자 1일 1회 전송이 전부.

---

### ADR-001: 호스팅 = GitHub Actions cron
**결정**: 매일 `30 22 * * *` UTC에 GitHub Actions workflow가 실행.
**이유**: 무료, 상시 가동 머신 불필요, secrets 관리 내장.
**트레이드오프**: cron이 best-effort라 분 단위 지연 가능. private repo는 월 2000분 한도 (월 30분 사용 예상이라 무관).

### ADR-002: 번역 모델 = Claude Haiku 4.5
**결정**: `claude-haiku-4-5-20251001` 모델, prompt caching 적용.
**이유**: 속도·비용 우선.
**트레이드오프**: Sonnet 대비 한국어 톤이 약간 떨어짐.

### ADR-003: 전달 = Telegram Bot API direct
**결정**: 별도 SDK 없이 fetch로 Bot API `sendMessage` 호출.
**이유**: 의존성 1개 줄임. API 표면이 단순.
**트레이드오프**: rate limit·error handling을 직접 구현.

### ADR-004: dedup 상태 = state/seen.json (sqlite 폐기)
**결정**: 단일 JSON 파일. 워크플로가 commit-back.
**이유**: serverless 친화. git diff로 변화 추적 가능.
**트레이드오프**: 동시성 X (cron 1일 1회라 무관).

### ADR-005: 런타임 = tsx (Next.js 제거)
**결정**: TypeScript를 `tsx`로 직접 실행. 빌드 단계 = `tsc --noEmit`.
**이유**: 단일 스크립트 실행에 Next.js / webpack 불필요.
**트레이드오프**: tsx에 가벼운 의존.

### ADR-006: 웹 UI 없음
**결정**: Next.js / React / tailwind / postcss 의존성 전부 제거. `src/app`, `src/components`, `public` 삭제.
**이유**: 전달 채널이 Telegram 1개. 웹 UI는 가치 없음.
**트레이드오프**: 로컬 아카이브 열람 UI 부재.

### ADR-007: 헤드리스 모델 강제 = Haiku
**결정**: `scripts/execute.py`가 `--model claude-haiku-4-5-20251001` 인자로 claude CLI 호출.
**이유**: 사용자 결정 (어떠한 경우에도 Haiku).
**트레이드오프**: 복잡한 step에서 자가교정 실패율 ↑ — step.md를 maximally prescriptive하게 작성해 보완.

### ADR-008: First-run guard
**결정**: `seen.json`이 빈 상태면 fetch 결과를 모두 seen에 mark하고 다이제스트 송신을 skip. "초기화 완료" 알림 1줄만 송신.
**이유**: 첫 실행 시 4096자 초과 또는 가독성 ↓.
**트레이드오프**: 사용자가 첫 실행 시 진짜 다이제스트는 다음날 받아야 함.
````

## Acceptance Criteria

```bash
test -f CLAUDE.md
test -f docs/PRD.md
test -f docs/ARCHITECTURE.md
test -f docs/ADR.md
npm run build
npm run test
```

위 6개 명령 모두 0으로 종료해야 한다.

## 검증 절차

1. 위 4개 파일이 정확한 내용으로 존재하는지 확인. 특히 **인터페이스 시그니처 섹션 본문이 한 글자도 변경되지 않았는지** Read로 재확인.
2. `npm run build` (tsc --noEmit) 통과 — 이 step은 .ts 파일 수정 안 하므로 통과해야 정상. 실패 시 사전 셋업 상태에 이슈가 있다는 신호.
3. `npm run test` (vitest run --passWithNoTests) 통과.
4. `phases/0-rss-telegram-mvp/index.json`의 step 0 status를 업데이트:
   - AC 통과 → `"status": "completed"`, `"summary": "CLAUDE.md, docs/PRD/ARCHITECTURE/ADR 작성"`
   - 3회 시도 후 실패 → `"status": "error"`, `"error_message": "<구체적 사유>"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "<사유>"` 후 즉시 중단

## 금지사항

- **.ts / .json / .yml / .config 파일 수정·생성 금지.** 이유: 이 step은 문서만 작성한다. 코드/설정 변경은 후속 step의 책임이다.
- 위에 명시되지 않은 파일 생성 금지. 이유: scope 최소화.
- 본문에 들어간 인터페이스 시그니처를 "개선" 시도 금지. 이유: 후속 step이 이 시그니처를 따라 코딩한다 — 자의적 변경은 일관성을 깨뜨린다.
