# Step 1: collect-live (RSS 수집 실전 검증)

## 읽어야 할 파일

- `CLAUDE.md` — 수집 파이프라인 규칙, 금지 의존성
- `docs/ARCHITECTURE.md` — "데이터 흐름"의 [수집] 단계, `src/lib/feeds.ts` 시그니처
- `scripts/collect-news.ts` — 실행 대상 orchestration
- `src/lib/feeds.ts` — fetch/parse 로직
- `files/config/watchlist.json` — 입력 (tickers[] + sectors[])

진실 원점은 `CLAUDE.md` + `docs/ARCHITECTURE.md`. `docs/PRD.md`의 "5개 RSS(Reuters 등)"는 구 아키텍처이므로 무시하라.

## 사전 조건

이 step은 **실제 외부 네트워크 호출**을 한다. 인터넷 연결이 필요하다. 연결 불가 또는 사내 프록시 차단 시 → `status: blocked`, reason에 명시.

## 작업

### A. 수집 실행

```bash
npm run collect
```

종료 코드 0이어야 한다.

### B. 산출 파일 검증

오늘 날짜(`Asia/Seoul` YYYY-MM-DD)로 `files/news_<today>.json`이 생성되어야 한다. Read 또는 `node -e`로 파싱해 아래 스키마를 확인:

- 최상위 키: `date`, `generated_at`, `window_hours`, `feeds`, `market`, `tickers`, `sectors`
- `feeds`: `{ ok: number, failed: string[] }`
- `market`: 배열. 각 원소 `{ title, source, published, link, summary }`
- `tickers`: 배열. 각 원소 `{ ticker, name, items: [...] }` — `ticker`/`name`은 watchlist와 일치
- `sectors`: 배열. 각 원소 `{ name, items: [...] }`
- 모든 item의 `published`는 ISO 8601 문자열

### C. 수집 품질 임계치

- `feeds.ok >= 8` (전체 피드의 절반 이상이 성공). 미만이면 네트워크/차단 의심 → `error`로 두고 `feeds.failed` 내용을 error_message에 기록.
- `tickers[]` 중 **최소 1개**의 `items.length > 0`. (RSS 특성상 특정 종목/섹터가 0건일 수 있으나 전부 0이면 비정상.)

### D. gitignore 확인

```bash
git check-ignore files/news_<today>.json && echo "ignored OK"
```

`news_*.json`은 `.gitignore` 대상이어야 한다. ignore되지 않으면 → `error` (CLAUDE.md: 매일 생성물은 commit 불요).

## Acceptance Criteria

```bash
npm run collect
test -f "files/news_$(TZ=Asia/Seoul date +%F).json"
node -e 'const p=require(`./files/news_${new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul"}).format(new Date())}.json`); if(p.feeds.ok<8) process.exit(1); if(!p.tickers.some(t=>t.items.length>0)) process.exit(1); console.log("schema OK ok="+p.feeds.ok)'
```

## 검증 절차

1. 네트워크 가용성 확인. 불가 시 즉시 `blocked`.
2. A 실행, 종료 코드 확인.
3. B, C, D 검증.
4. step 1 status 갱신:
   - 통과 → `"completed"`, `summary`에 `feeds.ok`/실패 수 / ticker별 item 수 요약 (다음 step에 컨텍스트로 전달됨).
   - 네트워크 불가 → `"blocked"`.
   - 스키마 위반 / feeds.ok 미달 → `"error"` + 구체 메시지.

## 금지사항

- `--dry-run`으로 대체하지 마라. 이유: 실제 파일 산출과 네트워크 동작 검증이 목적이다.
- `files/news_*.json`을 git에 commit하지 마라. 이유: 매일 생성되는 산출물이며 gitignore 대상이다.
- `files/config/watchlist.json`을 수정하지 마라. 이유: 사용자 관리 입력 데이터다.
- 피드 URL/소스 목록을 임의로 바꾸지 마라. 이유: 이 step은 검증이지 개발이 아니다.
- 기존 테스트를 깨뜨리지 마라.
