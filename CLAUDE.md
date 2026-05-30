# Briefing-Telegram Daily Sender

매일 06:00 KST 전후에 `files/news_YYYY-MM-DD.json` 수집 → 헤드리스 claude로 `files/briefing_YYYY-MM-DD.md` 작성 → Telegram MarkdownV2로 변환·송신하는 봇. **활성 트리거는 Windows 작업 스케줄러**(`docs/SCHEDULING.md`, 06:00/06:05/06:15/06:35 4작업, `scripts/cron-run.sh` 래퍼 경유). PC-off가 잦아지면 GHA 등 원격 트리거를 별도 구성할 수 있으나 현재 미구현.

## 기술 스택
- TypeScript strict mode (`tsc --noEmit`)
- 런타임: tsx (`tsx scripts/daily.ts`)
- 외부 라이브러리: **없음** (Telegram Bot API + RSS 피드 + Yahoo 시세 API를 fetch로 호출, RSS/Atom·CSV·JSON 파서 자체 구현)
- 테스트: vitest
- 스케줄러: Windows 작업 스케줄러 활성 (`scripts/cron-run.sh` 래퍼가 nvm+`~/.local/bin` 명시 로드 — Task Scheduler 클린 셸이 .bashrc/.profile 미로드하는 함정 회피). brief는 로컬 OAuth claude(구독분, 추가 과금 0).

## 아키텍처 규칙
- CRITICAL: 시크릿(`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)을 코드·테스트·로그·커밋 메시지에 절대 하드코딩 금지. 반드시 `process.env.<KEY>` 경유.
- CRITICAL: dedup 상태는 `state/sent.json` 단일 파일에만 저장한다. sqlite 등 별도 DB 도입 금지.
- CRITICAL: Next.js, tailwind, postcss, better-sqlite3, @google/genai, react, rss-parser, @anthropic-ai/sdk 의존성 신규 추가 금지. RSS/Atom 파싱은 `src/lib/feeds.ts` 무의존 파서 사용 (rss-parser 금지 유지). 뉴스 분석·번역은 Claude Code가 MD 생성 단계에서 흡수.
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
npm run history                  # 등록된 종목 목록 + 일수
npm run history RKLB             # 특정 종목 타임라인 + 센티먼트 추세
npm run collect                  # 10개 RSS 피드 수집 → files/news_YYYY-MM-DD.json
npm run collect -- --dry-run     # 수집 결과 요약만, 파일 미작성
npm run collect -- --hours 36    # 수집 시간 윈도우 변경 (기본 24h, 주말 보완용)
npm run verify                   # 오늘 collect/brief/daily 정상완료 자가검증 → PASS/FAIL Telegram 통보
npm run verify -- --dry          # 검증 결과만 출력, Telegram 미전송
```

## 브리핑 MD 작성 템플릿 (Claude Code 생성 가이드)

매일 `files/briefing_YYYY-MM-DD.md` 작성 시 아래 구조를 따른다. 표(`| ... |`)는 Telegram MarkdownV2가 렌더링하지 않으므로 절대 사용하지 않는다. 모노스페이스 코드블록 안에 한글+영문/숫자를 섞어 정렬하지 않는다 (전각/반각 폭 차이로 깨짐). 출처 표기는 `_(소스, M/D)_` 형식의 이탤릭으로 통일.

### 섹션 순서

1. `# 📈 데일리 브리핑 — YYYY-MM-DD (요일)`
2. `## 🌐 매크로` — 전일 지수 마감 / 하락·상승 원인 / 이번주 핵심 매크로 이벤트
3. `## <이모지> <티커> — <회사명>` (watchlist.json의 `tickers[]` 순회)
   - 가격 라인: `**$XXX.XX (±Y%)** · 진단: **<한 단어 진단>**`
   - `**핵심 숫자**` — 굵게 강조 불릿 리스트 (코드블록 사용 X). 핵심 수치만 `**굵게**`
   - `🟢 **호재**` — 번호 매김 리스트, 1번이 가장 강한 시그널
   - `🔴 **악재**` — 번호 매김 리스트, 1번이 가장 강한 시그널
   - `📄 **공시 (8-K)**` — SEC EDGAR 8-K 0건이면 생략. 중대 공시(M&A·실적·가이던스·자금조달·소송 등)는 3줄(제목/주가 영향/성장 영향), 단순 공시(정기 서류·임원변경)는 1줄
   - `💡 **한줄**:` — 핵심 평가 1~2문장
   - `📅 **다음 이벤트**:` — D-N 표기 포함
4. `## 🔭 산업 트래킹` — `sectors[]` 항목별 핵심 뉴스 2~3개
5. `## 📅 이번주 캘린더` — 날짜순 불릿, 어닝스/매크로 지표/정책 이벤트
6. `> ⚠️ 본 브리핑은 정보 제공 목적이며 투자 권유가 아닙니다.`

### 종목 헤더 이모지 매핑 (예시)
- 🚀 우주·항공  / 🤖 AI·클라우드 / 💎 반도체 / ⚡ 에너지 / 🏦 금융 / 🛒 소비재

### 진단 라벨 어휘 (한 단어 또는 짧은 구)
- 강세 계열: "강세 추세", "이벤트 드리븐 강세", "모멘텀"
- 약세 계열: "조정·관망", "리스크 부각", "약세 전환"
- 중립 계열: "관망", "이벤트 대기", "혼조"
- 주의 계열: "모멘텀 추격 주의", "변동성 확대"

### 작성 원칙
- Telegram 4096자 한도 — 종목 3~5개 기준으로 한 청크에 수렴하도록 호재/악재 핵심 3~4개로 제한
- 호재·악재는 **강도 우선순위**대로 번호 매김 (1번이 가장 강한 시그널)
- 핵심 수치(매출, EPS, 가이던스, 시총)는 반드시 `**굵게**` 처리
- 출처는 모든 항목 끝에 `_(소스, M/D)_` 부착
- D-N 카운트다운(D-7, D-1 등)을 다음 이벤트·이번주 캘린더에 적극 활용

### 입력 데이터 소스
- `files/config/watchlist.json` — `tickers[]` (보유·관심 종목) + `sectors[]` (산업 트래킹)
- `files/news_YYYY-MM-DD.json` — `npm run collect`가 생성하는 원시 뉴스풀. Claude Code/Cowork는 WebSearch 대신 **이 파일을 읽어** 호재/악재·진단을 분석해 브리핑 MD를 작성한다. 구조: `{ market[], tickers[{ticker,name,quote,items[]}], sectors[{name,items[]}] }`, 각 item = `{title,source,published,link,summary}`. `quote` = `{price,changePct,prevClose,currency,source,asOf}`(`currency`는 "USD"/"KRW" 등 — brief가 통화 기호 ₩/$ 결정) 또는 시세 미수집 시 `null`(brief가 "가격 미수집" 출력). `feeds.failed[]`가 비어있지 않으면 일부 소스 누락이므로 참고.

### 뉴스 수집 파이프라인 (10개 해외 RSS)
- 종목별(`tickers[]` 순회): SEC EDGAR(8-K) · Yahoo Finance · Seeking Alpha · StockTitan · Bing News · Google News. **단 한국 종목(`.KS`/`.KQ` 티커)은 미국 소스가 무용하므로 한국 Google News 1개로 대체** — 레버리지 ETN/ETF는 watchlist의 `newsQuery`(기초자산명, 예 "SK하이닉스")로 underlying 뉴스를 추적.
- 시장·매크로(1회): CNBC · WSJ · MarketWatch · Investing.com
- 섹터(`sectors[]` 순회): Google News 한국어 로케일(`{name} 관련주`)
- 종목 시세(`tickers[]`): Yahoo v8 chart(query1→query2 폴백, 무인증) — 일간 %는 일봉 종가 마지막 2개로 계산. 신규 상장 등 일봉이 1개뿐이면 `meta.regularMarketPrice`+`chartPreviousClose`로 폴백. fetch는 `src/lib/quotes.ts`에 격리(순수 파서 단위테스트). Stooq는 무료 CSV가 apikey(캡차) 필요해져 미사용.
- 24시간 윈도우 필터 + link/title 중복 제거. fetch는 `src/lib/feeds.ts`에 격리, `scripts/collect-news.ts`는 orchestration만.

