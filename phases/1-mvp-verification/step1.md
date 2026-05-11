# Step 1: e2e-dry-run (실전 RSS + 번역, 송신은 dry-run)

## 읽어야 할 파일

- `scripts/daily.ts` — 실행 대상
- `docs/PRD.md` — first-run guard 정책

## 사전 조건

이 step은 **실제 외부 API 호출**을 수반한다:
- `ANTHROPIC_API_KEY` 환경변수가 `.env` 또는 셸에 설정되어 있어야 한다
- 인터넷 연결
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`는 dry-run이라 필요 없음 (송신 안 함)

환경변수 미설정 시 → status `blocked`, reason `"ANTHROPIC_API_KEY 미설정 — .env에 값을 채우고 status를 pending으로 변경 후 재실행하라"`

## 작업

### A. dry-run 실행

```bash
npm run daily -- --dry-run > phases/1-mvp-verification/preview.txt 2>&1
```

종료 코드 0이어야 한다.

### B. preview.txt 검증

Read로 `phases/1-mvp-verification/preview.txt`를 읽고 아래를 확인:

1. **시작 로그**: `[daily] start (dry-run=true)` 포함
2. **fetch 보고**: `[daily] fetched <N> items` 포함, N ≥ 0
3. **분기 확인**:
   - first-run인 경우: `FIRST-RUN: would send: ...` 포함, 다이제스트 출력 X
   - 신규 0건: `no new items` 포함
   - 신규 N건: `=== DIGEST (dry-run) ===` 본문 등장
4. **에러 없음**: `FATAL` 또는 unhandled rejection 키워드 부재

### C. 번역 품질 sanity check (신규 N건 분기에 한함)

다이제스트 본문에서:
- 한국어 문자(한글 음절 `가-힯`) 비율이 전체 문자 중 **30% 이상**
- 영문 제목/요약 원문이 완전히 그대로 남아있지 않음 (번역이 실제로 일어났음)

신규 0건 또는 first-run 분기면 이 검증은 skip.

### D. 결과 보존

`phases/1-mvp-verification/preview.txt`는 **commit하지 않는다**. 이미 사전 셋업에서 `.gitignore`에 `phases/*/preview.txt` 또는 본 파일 자체가 명시되어 있어야 한다 — 만약 없으면 status `blocked`로 두고 reason에 명시.

→ 작업 중 `.gitignore`에 `phases/1-mvp-verification/preview.txt` 줄이 없으면 추가하고 commit하라 (chore: gitignore preview.txt).

## Acceptance Criteria

```bash
# 1. dry-run 실행 성공
npm run daily -- --dry-run > phases/1-mvp-verification/preview.txt 2>&1
echo "exit=$?"   # 0이어야 함

# 2. preview에 핵심 키워드 존재
grep -q "\[daily\] start" phases/1-mvp-verification/preview.txt
grep -q -E "FIRST-RUN|no new items|=== DIGEST" phases/1-mvp-verification/preview.txt

# 3. FATAL 부재
! grep -q "FATAL" phases/1-mvp-verification/preview.txt
```

## 검증 절차

1. 환경변수 확인: `ANTHROPIC_API_KEY` 셸에 있는지 (`echo "${ANTHROPIC_API_KEY:+set}"` → "set" 이어야 함). 없으면 blocked.
2. A 실행. 종료 코드 확인.
3. B, C 검증.
4. D 확인 후 필요 시 .gitignore 갱신 + commit.
5. step 1 status:
   - 모두 통과 → `"completed"`, summary에 fetch한 item 수 / 번역한 item 수 / 다이제스트 길이 기록
   - 환경변수 부재 → `"blocked"`
   - 번역 실패 / fetch 실패 → `"error"` + 구체 메시지

## 금지사항

- 실제 송신(`sendMessage`) 발생 금지. 반드시 `--dry-run` 플래그 사용.
- `preview.txt`를 git commit에 포함하지 마라. 시크릿이 우연히 로그에 포함되었을 수 있다.
- `state/seen.json`이 변경되어도 commit하지 마라 (이번 step에서). 사용자가 다음 step에서 처리.
- 코드 수정 금지 (이 step은 실행+검증만).
