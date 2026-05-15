# Step 3: e2e-dry-and-send (변환 dry-run + 실송신)

## 읽어야 할 파일

- `CLAUDE.md` — 시크릿 규칙, 송신 파이프라인
- `docs/ARCHITECTURE.md` — "데이터 흐름"의 [송신] 단계, markdown/splitter/telegram 시그니처
- `docs/SCHEDULING.md` — Windows 작업 스케줄러 실행 방식
- `scripts/daily.ts` — 실행 대상
- `src/lib/markdown.ts`, `src/lib/splitter.ts`, `src/lib/telegram.ts`

진실 원점은 `CLAUDE.md` + `docs/ARCHITECTURE.md`. `docs/PRD.md`의 first-run guard / 번역 단계는 구 아키텍처이므로 무시하라 (현재 daily.ts는 fetch·번역하지 않는다).

## 사전 조건

오늘 날짜(`Asia/Seoul`)로 `files/briefing_<today>.md`가 존재해야 dry-run이 의미가 있다.

- 오늘자 briefing 파일이 없으면 → `status: blocked`, reason: "오늘자 files/briefing_<today>.md 가 없음. Claude/Cowork로 먼저 생성한 뒤 step 3을 pending으로 바꿔 재실행하라." 후 즉시 중단. **briefing 파일을 임의로 만들지 마라.**

## 작업

### A. dry-run 변환 검증

```bash
npm run daily -- --dry-run
```

- 종료 코드 0.
- 출력에 `[daily] start` 포함.
- 출력에 `=== CHUNK 1/` (변환된 MarkdownV2 청크) 포함.
- 출력에 `FATAL` 또는 unhandled rejection 부재.

### B. 시크릿 확인 → 분기

`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 두 환경변수(.env 또는 셸)를 확인:

```bash
node -e 'console.log("BOT="+(process.env.TELEGRAM_BOT_TOKEN?"set":"MISSING"),"CHAT="+(process.env.TELEGRAM_CHAT_ID?"set":"MISSING"))'
```

(daily.ts는 `.env`를 자체 로드한다. 값 자체는 절대 출력하지 마라 — set/MISSING만.)

- **하나라도 MISSING** → A까지 통과 처리하고 `status: blocked`, reason: "dry-run 변환 통과. 실송신은 .env에 TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID 채운 뒤 step 3을 pending으로 바꿔 재실행." 후 중단.
- **둘 다 set** → C로 진행.

### C. 실송신 (시크릿이 있을 때만)

```bash
npm run daily
```

종료 코드 0. 사용자 텔레그램에 메시지가 도착해야 한다. 그 후 **사용자 수신 확인이 필요**하므로 아래 패턴으로 처리:

```
status: "blocked"
blocked_reason: "실송신 완료(스크립트 종료코드 0). 텔레그램에서 브리핑이 도착했는지 확인하라. 도착했으면 status를 'completed'로, blocked_reason 삭제 후 재실행. 도착 안 했으면 'error'로 변경."
```

이유: 스크립트가 "보냈다"를 안다고 사용자가 "받았다"가 보장되지 않는다.

## Acceptance Criteria

```bash
npm run daily -- --dry-run    # 종료 코드 0, FATAL 부재, === CHUNK 출력
```

A가 통과하면 자동 검증 통과. 이후 B 분기로 blocked(시크릿 부재) 또는 C 실송신 후 사용자 수신확인 blocked.

## 검증 절차

1. 오늘자 briefing 파일 확인. 없으면 즉시 blocked.
2. A 실행, 종료 코드·키워드·FATAL 부재 확인.
3. B로 시크릿 확인 → 분기.
4. C(시크릿 있을 때) 실송신 후 사용자 수신확인 blocked 패턴, 또는 B에서 시크릿 부재 blocked.

## 금지사항

- 시크릿 값을 stdout/로그/커밋에 출력하지 마라. set/MISSING 여부만 확인하라.
- `files/briefing_*.md`를 임의로 생성하거나 날짜를 조작하지 마라. 이유: 검증이 무의미해진다. 없으면 blocked가 정답이다.
- 송신 성공 후 자동으로 `completed` 처리하지 마라. 반드시 사용자 수신확인 blocked 패턴을 거쳐라.
- `state/sent.json`을 임의로 수정/삭제하지 마라 (idempotency 무결성).
- 기존 테스트를 깨뜨리지 마라.
