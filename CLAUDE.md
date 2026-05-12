# Briefing-Telegram Daily Sender

매일 07:15 KST에 `files/briefing_YYYY-MM-DD.md`(Claude Code로 사용자가 직접 생성)를 읽어 Telegram MarkdownV2로 변환·송신하는 봇. 트리거는 Windows 작업 스케줄러(`docs/SCHEDULING.md`).

## 기술 스택
- TypeScript strict mode (`tsc --noEmit`)
- 런타임: tsx (`tsx scripts/daily.ts`)
- 외부 라이브러리: **없음** (Telegram Bot API만 fetch로 호출)
- 테스트: vitest
- 스케줄러: Windows 작업 스케줄러 (GitHub Actions 미사용)

## 아키텍처 규칙
- CRITICAL: 시크릿(`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)을 코드·테스트·로그·커밋 메시지에 절대 하드코딩 금지. 반드시 `process.env.<KEY>` 경유.
- CRITICAL: dedup 상태는 `state/sent.json` 단일 파일에만 저장한다. sqlite 등 별도 DB 도입 금지.
- CRITICAL: Next.js, tailwind, postcss, better-sqlite3, @google/genai, react, rss-parser, @anthropic-ai/sdk 의존성 신규 추가 금지. (번역·RSS fetch는 Claude Code가 MD 생성 단계에서 흡수)
- 모든 외부 IO는 `src/lib/` 하위 모듈로 격리한다. `scripts/`는 orchestration만 담당.
- 입력 MD는 `files/briefing_YYYY-MM-DD.md` 명명 규칙 고정. 파일 1개 = 하루치 브리핑.

## 개발 프로세스
- CRITICAL: 새로운 lib 모듈 추가 시 vitest 단위 테스트를 함께 작성하고 통과시킨다.
- 커밋 메시지: conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`).

## 환경변수 / 시크릿
| 이름 | 용도 | 형식 |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API | `<bot_id>:<bot_secret>` |
| `TELEGRAM_CHAT_ID` | 수신자 chat_id | 정수 문자열 |

## 명령어
```bash
npm install                      # 의존성 설치 (devDeps만)
npm run build                    # tsc --noEmit (타입 검증)
npm run test                     # vitest run
npm run daily                    # tsx scripts/daily.ts (실전 송신)
npm run daily -- --dry-run       # 변환 결과만 확인, 전송 X
npm run daily -- --force         # sent.json 무시하고 강제 재송신
```
