# 아키텍처

## 디렉토리 구조
```
src/lib/
├── markdown.ts       # GFM → Telegram MarkdownV2 변환
├── splitter.ts       # 4000자 단위 분할
├── telegram.ts       # Telegram Bot API sendMessage + MarkdownV2 escape
└── state.ts          # sent.json 로드/마킹 (날짜별 idempotency)

scripts/
├── daily.ts          # 일일 orchestration 진입점
├── execute.py        # harness step executor (Python)
└── test_execute.py

files/                # 입력 MD (Claude Code 데스크톱이 매일 작성)
└── briefing_YYYY-MM-DD.md

tests/                # vitest 단위 테스트
state/sent.json       # 송신 완료 날짜 집합
docs/                 # PRD, ARCHITECTURE, SCHEDULING, ADR
.claude/              # harness 가드레일 / commands / settings
phases/               # task별 step 실행 메타데이터
```

## 데이터 흐름
```
Windows 작업 스케줄러 (07:15 KST)
  → wsl npm run daily
    → today = Asia/Seoul YYYY-MM-DD
    → files/briefing_<today>.md 존재 확인 (없으면 exit 1)
    → state.hasSent(today) → 이미 송신했으면 skip (--force 로 무시 가능)
    → readFileSync → gfmToMd2(md) → splitMessage(text)
    → 각 chunk를 telegram.sendMessage(text, { parseMode: "MarkdownV2" })
    → state.markSent(today)
```

## 환경변수 / 시크릿 (단일 진실 원점)
| 이름 | 사용 위치 | 비고 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `src/lib/telegram.ts` | URL 빌드에 사용 |
| `TELEGRAM_CHAT_ID` | `src/lib/telegram.ts` | 송신 대상 |

## 인터페이스 시그니처 (단일 진실 원점)

`src/lib/markdown.ts`:
```typescript
export function gfmToMd2(input: string): string;
// GFM: # 헤딩, **볼드**, _이탤릭_, [text](url), - 리스트, > 인용, --- 가로줄
// → MarkdownV2: *볼드*, _이탤릭_, [text](url), • 리스트, > 인용, ━━━ 라인
// 일반 텍스트 및 markdown 컨텐츠 내부의 _ * [ ] ( ) ~ ` > # + - = | { } . ! 모두 escape
// URL은 ) 와 \ 만 escape (Telegram 규약)
```

`src/lib/splitter.ts`:
```typescript
export const MAX_CHUNK = 4000;
export function splitMessage(text: string, max?: number): string[];
// 줄 단위 greedy packing. 한 줄이 max보다 길면 강제 슬라이스.
```

`src/lib/telegram.ts`:
```typescript
export function escapeMarkdownV2(s: string): string;
export async function sendMessage(
  text: string,
  opts?: { parseMode?: "MarkdownV2" | "HTML" },
): Promise<void>;
// 내부: fetch로 https://api.telegram.org/bot<TOKEN>/sendMessage 호출
// disable_web_page_preview: true 고정
```

`src/lib/state.ts`:
```typescript
export function hasSent(date: string): boolean;
export function markSent(date: string): void;
// state/sent.json 형식: { "sent_dates": ["YYYY-MM-DD", ...], "updated_at": "<ISO>" }
```

`scripts/daily.ts`:
```typescript
// CLI 플래그:
//   --dry-run  변환 결과만 stdout, 전송·state 변경 X
//   --force    state.hasSent를 무시하고 강제 송신
// 종료 코드 0 = 정상/skip, 1 = 파일 없음 또는 에러
```

## 패턴
- Server-side only. 브라우저/UI 없음.
- 외부 IO(API, 파일, 네트워크)는 lib 모듈에만. scripts/는 호출만.
- 모든 lib 함수에 vitest 단위 테스트 필수.
- 외부 의존성 0 (런타임 deps 비어 있음). devDeps: tsx, typescript, vitest, @types/node.

## 상태 관리
- `state/sent.json` 형식: `{ "sent_dates": ["YYYY-MM-DD", ...], "updated_at": "<ISO>" }`.
- 같은 날짜 재실행은 자동 skip → 작업 스케줄러가 여러 번 트리거되어도 안전.
- 가지치기 없음 (날짜 문자열은 작아서 부담 없음).
