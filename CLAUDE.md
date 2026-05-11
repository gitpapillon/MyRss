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
