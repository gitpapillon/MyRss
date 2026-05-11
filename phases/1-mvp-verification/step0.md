# Step 0: quality-gate (정적 품질 검증)

## 읽어야 할 파일

- `CLAUDE.md` — CRITICAL 규칙 (시크릿 하드코딩, 의존성, 디렉토리 구조)
- `docs/ARCHITECTURE.md` — 디렉토리 구조, 인터페이스 시그니처
- `docs/ADR.md` — 모든 결정 사항
- 모든 `src/lib/*.ts` 파일 — 시그니처·import·로직 점검
- `scripts/daily.ts` — orchestration 로직 점검
- `.github/workflows/daily.yml` — workflow 정의 (사전 셋업본)

## 작업

전체 코드베이스의 정적 품질을 검증한다. 코드는 **수정하지 않는다** (이 step은 read-only 검증). 위반 발견 시 status를 `error`로 두고 구체적 에러 메시지를 기록한다.

### A. 디렉토리 구조 검증

`docs/ARCHITECTURE.md` "디렉토리 구조" 섹션과 실제가 일치하는지 확인.

기대 구조:
```
src/lib/{types,feeds,translator,telegram,digest,state}.ts
scripts/{daily.ts, execute.py, test_execute.py}
tests/{state,translator,telegram,digest,daily}.test.ts
state/ (state/seen.json은 아직 없을 수 있음)
docs/{PRD,ARCHITECTURE,ADR}.md
.github/workflows/daily.yml
phases/index.json + phases/0-rss-telegram-mvp/, phases/1-mvp-verification/
```

검증: 위 경로의 파일이 모두 존재하는지 확인.

### B. 의존성 검증

`package.json`을 Read하고 아래를 확인:
- `dependencies`에 `@anthropic-ai/sdk`, `rss-parser`만 있어야 한다 (그 외 신규 추가 시 fail)
- `next`, `react`, `react-dom`, `@google/genai`, `better-sqlite3`, `tailwindcss`, `postcss`, `@tailwindcss/postcss` 등이 **남아있지 않아야** 한다
- `devDependencies`에 `typescript`, `tsx`, `vitest`, `@types/node`가 있어야 한다

### C. 시크릿 하드코딩 grep

```bash
# (1) 실제 시크릿 패턴이 코드에 없어야 함
grep -rnE 'sk-ant-[A-Za-z0-9_-]{20,}' src scripts tests 2>&1 || echo "OK: no anthropic key pattern"
grep -rnE '[0-9]{8,}:[A-Za-z0-9_-]{30,}' src scripts 2>&1 || echo "OK: no telegram token pattern"

# (2) 환경변수 참조는 OK이지만, 값을 변수로 캡처 후 로깅하는 패턴은 의심
grep -rn 'console.log.*TELEGRAM_BOT_TOKEN\|console.log.*ANTHROPIC_API_KEY' src scripts 2>&1
```

위 패턴이 src/scripts에서 검출되면 fail.

테스트 파일(`tests/`)의 더미 토큰 `12345:test-token`은 허용.

### D. MarkdownV2 escape 정확성 검증

`src/lib/telegram.ts`를 Read하고 정규식을 확인:
- 정확히 14개 특수문자: `_ * [ ] ( ) ~ ` > # + - = | { } . !` 가 모두 포함되어야 함
- escape 함수가 backslash를 prefix로 붙이는지

`src/lib/digest.ts`에서:
- `escapeMarkdownV2` 사용 여부
- URL은 `escapeLinkUrl` (점/슬래시 미escape)을 사용하는지

### E. prompt caching 검증

`src/lib/translator.ts`를 Read하고:
- `system` 인자가 배열 형식이어야 함
- 배열 첫 요소에 `cache_control: { type: "ephemeral" }` 존재
- 모델 ID = `"claude-haiku-4-5-20251001"`

### F. workflow YAML 검증

`.github/workflows/daily.yml`을 Read하고:
- `on.schedule.cron === "30 22 * * *"`
- `permissions.contents === "write"`
- `env`에 시크릿 3종(`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) 모두 `${{ secrets.* }}`로 참조
- `npm run daily` 또는 `npx tsx scripts/daily.ts`를 호출하는 단계 존재
- `state/seen.json` commit-back 단계 존재

### G. 빌드 + 테스트 일괄 실행

```bash
npm run build
npx vitest run
```

전체 테스트 스위트(state + translator + telegram + digest + daily = 약 40+ 케이스) 통과해야 함.

## Acceptance Criteria

위 A~G 항목 **모두** 통과. 하나라도 fail → status `error`.

```bash
npm run build && npx vitest run
```

## 검증 절차

1. A~G를 차례로 검증. 각 단계의 결과를 stdout에 출력.
2. 위반이 발견되면 **즉시 중단**하고 status `error` + 구체적 위반 내용을 `error_message`에 기록.
3. 전부 통과 → status `completed`, summary에 검증 항목 수와 통과 결과 요약.

## 금지사항

- **어떤 파일도 수정하지 마라.** 이 step은 read-only 게이트. 이유: 검증 단계에서 코드 변경은 검증의 의미를 훼손한다.
- 위반 발견 시 자동 수정 시도 금지. 사용자가 보고 결정한다.
- 검증 항목 누락 금지. A~G 7항목 전부 수행.
