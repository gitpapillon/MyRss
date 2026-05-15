# Step 0: quality-gate (정적 품질 검증)

## 읽어야 할 파일

먼저 아래를 읽고 **현행 아키텍처**를 파악하라:

- `CLAUDE.md` — CRITICAL 규칙 (시크릿 하드코딩, 금지 의존성, 디렉토리, 수집 파이프라인)
- `docs/ARCHITECTURE.md` — 디렉토리 구조 / 데이터 흐름 / 인터페이스 시그니처 (현행화됨)
- 모든 `src/lib/*.ts` (feeds, markdown, splitter, telegram, parser, state)
- `scripts/collect-news.ts`, `scripts/daily.ts`, `scripts/history.ts`
- `package.json`

**진실 원점은 `CLAUDE.md` + `docs/ARCHITECTURE.md` 두 개뿐이다.** `docs/PRD.md`와 `docs/ADR.md`(특히 ADR-001 GitHub Actions, ADR-002 Haiku 번역, ADR-004 seen.json commit-back, ADR-008 first-run guard)는 **pivot 이전 RSS+translate 아키텍처 문서이므로 검증 기준으로 삼지 마라.** 그 문서를 근거로 현재 코드를 위반 처리하지 마라.

## 작업

전체 코드베이스의 정적 품질을 검증한다. 코드는 **수정하지 않는다** (read-only 게이트). 위반 발견 시 즉시 중단하고 `error` 처리.

### A. 디렉토리 구조

`docs/ARCHITECTURE.md`의 "디렉토리 구조" 섹션과 실제 파일이 일치하는지 확인. 특히 `src/lib/feeds.ts`, `scripts/collect-news.ts`가 존재해야 한다.

### B. 의존성

`package.json`을 Read:
- `dependencies`가 **비어 있거나 없어야 한다** (런타임 외부 라이브러리 0).
- `rss-parser`, `@anthropic-ai/sdk`, `next`, `react`, `react-dom`, `tailwindcss`, `postcss`, `better-sqlite3`, `@google/genai` 중 어느 것도 dependencies/devDependencies에 **없어야** 한다.
- `devDependencies`에 `tsx`, `typescript`, `vitest`, `@types/node`가 있어야 한다.

### C. 시크릿 하드코딩 grep

```bash
grep -rnE 'sk-ant-[A-Za-z0-9_-]{20,}' src scripts 2>&1 || echo "OK: no anthropic key"
grep -rnE '[0-9]{8,}:[A-Za-z0-9_-]{30,}' src scripts 2>&1 || echo "OK: no telegram token"
grep -rn 'console.log.*TELEGRAM_BOT_TOKEN\|console.log.*TELEGRAM_CHAT_ID' src scripts 2>&1 || echo "OK"
```

`src`/`scripts`에서 실제 토큰 패턴이나 시크릿 로깅이 검출되면 fail. 시크릿은 `process.env.<KEY>` 경유만 허용. `tests/`의 더미 토큰(`12345:test-token` 등)은 허용.

### D. 외부 IO 격리

네트워크 fetch는 `src/lib/feeds.ts`(RSS)와 `src/lib/telegram.ts`(Bot API)에만 존재해야 한다. `scripts/*.ts`는 이들 lib 함수를 호출만 하고 직접 `fetch(`를 호출하지 않아야 한다.

```bash
grep -n 'fetch(' scripts/*.ts 2>&1 || echo "OK: scripts에 직접 fetch 없음"
```

### E. 빌드 + 전체 테스트

```bash
npm run build
npx vitest run
```

전체 스위트(feeds, parser, state, telegram 등)가 통과해야 한다.

## Acceptance Criteria

```bash
npm run build && npx vitest run
```

A~E 전부 통과해야 한다. 하나라도 위반 → `error`.

## 검증 절차

1. A~E를 차례로 검증하고 각 결과를 stdout에 출력.
2. 위반 발견 시 즉시 중단, `phases/2-pipeline-verification/index.json`의 step 0을 `"status": "error"`, `"error_message"`에 구체적 위반 내용.
3. 전부 통과 → `"status": "completed"`, `"summary"`에 검증 항목 수와 통과 결과 요약.

## 금지사항

- **어떤 파일도 수정하지 마라.** 이유: 검증 단계에서 코드를 바꾸면 검증이 무의미해진다.
- `docs/PRD.md`·`docs/ADR.md`를 근거로 위반 판정하지 마라. 이유: 해당 문서는 pivot 이전 아키텍처라 현재 코드와 의도적으로 다르다.
- 위반 자동 수정 금지. 사용자가 보고 결정한다.
- 기존 테스트를 깨뜨리지 마라.
