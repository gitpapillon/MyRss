# Step 2: parser-v4 (브리핑 v4 파싱 검증)

## 읽어야 할 파일

- `CLAUDE.md` — "브리핑 MD 작성 템플릿" 섹션 (v4 구조 정의)
- `docs/ARCHITECTURE.md` — `src/lib/parser.ts` 시그니처 (v4 + v3 레거시)
- `src/lib/parser.ts` — 파싱 로직
- `tests/parser.test.ts` — 기존 v3 + v4 케이스
- `scripts/history.ts` — parseBriefing 소비처

진실 원점은 `CLAUDE.md` + `docs/ARCHITECTURE.md`. `docs/ARCHITECTURE.md`의 parser 시그니처 주석이 v4 구조를 정의한다.

## 작업

### A. 파서 단위 테스트

```bash
npx vitest run tests/parser.test.ts
```

v3 레거시 케이스와 v4 케이스(`describe("parseBriefing v4 ...")`)가 **모두** 통과해야 한다.

### B. 실제 브리핑 파싱 (있는 경우)

`files/` 디렉토리에서 `briefing_YYYY-MM-DD.md` 패턴 파일을 찾는다.

- 파일이 1개 이상 있으면: 가장 최근 파일을 `parseBriefing(content, date)`로 파싱하고 아래를 확인:
  - `result.tickers.length > 0`
  - 각 ticker에 `ticker`(대문자 심볼)와 `name`이 채워짐
  - 적어도 한 ticker에 `bullish` 또는 `bearish` 항목이 1개 이상
  - 적어도 한 ticker에 `summary`(💡 한줄) 또는 `close_price`(가격 라인) 추출됨
- `files/`에 briefing 파일이 하나도 없으면: 이 검증(B)은 **skip**하고 그 사실을 summary에 기록 (fail 아님). 이유: briefing은 Claude/Cowork가 생성하는 입력이라 실행 시점에 없을 수 있다.

검증용 일회성 스크립트는 `/tmp/`에 작성해 실행하라. 리포지토리에 파일을 남기지 마라.

### C. history CLI 동작

```bash
npm run history
```

종료 코드 0. 등록 종목 목록 또는 "등록된 종목이 없습니다" 안내가 출력되어야 한다 (briefing이 없으면 후자 — 정상). 종목 데이터가 있으면 `npm run history <존재하는TICKER>`가 타임라인 + 센티먼트 추세를 출력하고 종료 코드 0.

## Acceptance Criteria

```bash
npx vitest run tests/parser.test.ts
npm run history
```

A의 테스트 전부 통과 + C 종료 코드 0. B는 briefing 존재 시 조건 충족, 부재 시 skip 허용.

## 검증 절차

1. A 실행, v3+v4 전부 green 확인.
2. B: briefing 파일 유무에 따라 파싱 검증 또는 skip.
3. C: history CLI 종료 코드 확인.
4. step 2 status 갱신:
   - 통과 → `"completed"`, summary에 v4 테스트 통과 / B 검증 또는 skip 여부 기록.
   - 테스트 실패 → `"error"` + 실패 케이스명.

## 금지사항

- `src/lib/parser.ts`를 수정하지 마라. 이유: 이 step은 검증이다. 파서 버그가 발견되면 error로 보고하고 사용자가 결정한다.
- v3 레거시 정규식(`TICKER_HEADER_V3`, `**🟢 호재**` 등)을 제거하지 마라. 이유: 과거에 생성된 briefing 아카이브와의 하위호환이 필요하다.
- 검증용 스크립트를 리포지토리에 commit하지 마라. `/tmp/`에서 실행하라.
- 기존 테스트를 깨뜨리지 마라.
