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
