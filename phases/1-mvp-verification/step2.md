# Step 2: e2e-live-and-idempotency (실전 송신 + 재실행 멱등성)

## 읽어야 할 파일

- `scripts/daily.ts`
- `src/lib/state.ts`

## 사전 조건

`.env` 또는 셸에 시크릿 3종 모두 설정:
- `ANTHROPIC_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

하나라도 부재 → status `blocked`, reason에 어떤 변수가 빠졌는지 명시.

## 작업

### A. 1차 실행 — 실제 송신

```bash
# state/seen.json 백업 (재실행 위해)
cp state/seen.json state/seen.json.bak 2>/dev/null || echo "no seen.json yet"

# 실전 실행
npm run daily
```

종료 코드 0이어야 한다. 사용자의 텔레그램에 메시지가 도착해야 한다.

### B. 1차 결과 검증

- `state/seen.json` 존재 + 유효한 JSON
- `seen` 배열 길이 ≥ 1
- `updated_at`이 최근 1분 이내 ISO timestamp

### C. 2차 실행 — 멱등성 확인

```bash
# 즉시 재실행
npm run daily 2>&1 | tee phases/1-mvp-verification/idempotency.log
```

검증:
- 종료 코드 0
- 로그에 `[daily] new items: 0` 또는 `[daily] no new items` 포함 (RSS가 1분 사이 새 기사 안 올렸다는 일반적 케이스)
- **`sendMessage`가 호출되지 않아야 함** — 로그에 `digest sent` 키워드 부재
- `state/seen.json`의 `seen` 배열은 1차와 같거나 더 크지만 줄지 않음 (단조 증가)

만약 RSS가 정확히 그 사이에 새 기사를 올려서 신규 N건이 잡혔다면 → 이 step의 멱등성 검증은 일시적으로 불확실. 한 번 더 재실행해 0건 케이스를 확인하라.

### D. 사용자 수신 확인 — blocked 패턴

1·2차 실행 후:

```
phases/1-mvp-verification/index.json의 step 2 status를 다음과 같이 설정:
  "status": "blocked"
  "blocked_reason": "텔레그램에서 다이제스트 1통이 도착했는지 확인하라. 도착했으면 status를 'completed'로 변경하고 blocked_reason을 삭제한 뒤 execute.py를 재실행. 도착 안 했으면 그대로 두고 사용자가 디버깅."
```

이 후 step 2를 종료한다 (재시도 X). 사용자가 직접 status를 변경한 뒤 `python3 scripts/execute.py 1-mvp-verification`를 재실행하면 step 2가 자동으로 completed로 인식되어 다음 step으로 넘어간다.

### E. 백업 정리

```bash
rm -f state/seen.json.bak
rm -f phases/1-mvp-verification/idempotency.log
```

## Acceptance Criteria

A·B·C가 위 조건을 만족하면 자동 검증 통과. 그 후 D 패턴으로 blocked 처리. 사용자가 수동으로 status를 completed로 변경하면 통과.

## 검증 절차

1. 시크릿 3종 확인. 없으면 즉시 blocked.
2. A 실행. 텔레그램 송신 동작.
3. B 검증.
4. C 실행 후 멱등성 확인.
5. D 패턴으로 blocked 처리.
6. E 정리.

## 금지사항

- 1차 실행 전에 `state/seen.json`을 임의 수정 금지 (멱등성 검증이 의미를 잃음).
- `--dry-run` 모드로 실행 금지 (실전 송신이 목적).
- 송신 후 자동으로 status를 `completed`로 두지 마라. 반드시 사용자 수신 확인이 필요 → `blocked` 패턴. 이유: Haiku/스크립트가 "보냈다"를 안다고 해서 사용자가 "받았다"를 보장하지 않는다.
- 시크릿 값을 로그에 출력 금지.
- `state/seen.json`이 0건으로 줄어들 만한 어떤 조작도 하지 마라 (멱등성/누적 원칙).
