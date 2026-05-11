# Step 3: ci-live-trigger (GitHub Actions 실전 검증)

## 읽어야 할 파일

- `.github/workflows/daily.yml`
- `docs/ARCHITECTURE.md` — 데이터 흐름

## 사전 조건

1. 현재 브랜치(`feat-mvp` 또는 머지 후 master)가 GitHub 원격 repo에 push되어 있어야 함.
2. GitHub repo에 secrets 3종이 설정되어 있어야 함: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
3. `gh` CLI가 사용자 머신에 설치 + 인증되어 있어야 함.

위 조건 중 하나라도 미달 → status `blocked`, blocked_reason에 어느 조건이 빠졌는지 + 사용자가 취해야 할 조치 명시. 예:
- "gh CLI 미설치. https://cli.github.com/ 에서 설치 후 `gh auth login` 실행"
- "GitHub repo가 원격에 연결되지 않음. `git remote add origin ...` 후 push"
- "Secrets 미설정. https://github.com/<owner>/<repo>/settings/secrets/actions 에서 3종 등록"

## 작업

### A. YAML 스키마 검증 (재확인)

```bash
# 간이 검증: YAML 파싱 성공 여부
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/daily.yml'))" && echo "YAML OK"
```

### B. Secrets 존재 확인

```bash
gh secret list 2>&1 | tee phases/1-mvp-verification/secrets.log
```

`ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` 3개가 출력에 보여야 함. 누락 → blocked.

### C. 수동 trigger 실행

워크플로 이름은 `.github/workflows/daily.yml`의 `name:` 필드 또는 파일명 기준이다. 사전 셋업의 workflow name은 `daily` 또는 `RSS Daily Digest`로 가정한다 — Read해서 정확한 이름 확인 후 사용.

```bash
# 워크플로 수동 실행 (workflow_dispatch 트리거가 정의되어 있어야 함)
gh workflow run daily.yml
echo "Triggered. Waiting for run..."
sleep 10

# 가장 최근 run 정보
gh run list --workflow=daily.yml --limit 1 --json databaseId,status,conclusion,createdAt | tee phases/1-mvp-verification/run.json
```

`workflow_dispatch` 트리거가 daily.yml에 없으면 → status `blocked`, reason `"daily.yml에 workflow_dispatch 트리거가 없음. 수동 검증 불가. 사용자가 직접 GitHub Actions 페이지에서 'Run workflow' 사용하거나 daily.yml에 workflow_dispatch: 추가"`.

### D. Run 완료 대기 + 결과 확인

```bash
RUN_ID=$(gh run list --workflow=daily.yml --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --exit-status
echo "exit=$?"   # 0 = success, 그 외 = failure
```

`gh run watch --exit-status`는 conclusion이 `success`가 아니면 비0 종료 → 자동으로 fail 처리됨.

### E. Commit-back 검증

```bash
# Action이 state/seen.json을 commit했는지 확인
git fetch origin
git log origin/master --oneline -5 | tee phases/1-mvp-verification/log.txt
```

워크플로 실행 직후 `chore: update seen state` 또는 유사한 commit이 origin에 있어야 한다. 없으면 → 부분 실패 (action은 success인데 commit이 안 됨). status `error` + 구체적 사유.

### F. 사용자 수신 확인 — blocked 패턴

step 2와 동일. workflow가 success여도 텔레그램 수신은 별도 확인.

```
status: "blocked"
blocked_reason: "GitHub Actions workflow가 성공으로 표시되었다. 텔레그램에서 다이제스트가 도착했는지 확인하라. 도착했으면 status를 'completed'로, 안 도착했으면 'error'로 변경 후 재실행."
```

### G. 정리

```bash
rm -f phases/1-mvp-verification/{secrets.log,run.json,log.txt}
```

## Acceptance Criteria

A·B·C·D·E 자동 통과 + F 패턴으로 blocked → 사용자가 수신 확인 후 completed로 변경.

## 검증 절차

1. 사전 조건 확인. 미달 시 즉시 blocked.
2. A~E 차례로 실행.
3. F 패턴으로 blocked 처리.
4. G 정리.

## 금지사항

- `gh secret set`으로 시크릿을 자동 설정하지 마라. 사용자가 직접 GitHub UI 또는 명시적 명령으로 처리한다. 이유: 시크릿은 사용자만 다룬다.
- 워크플로 파일을 이 step에서 수정하지 마라. workflow_dispatch가 없으면 blocked, 사용자가 결정.
- `gh run rerun` 자동 호출 금지. 한 번 실패하면 사용자에게 보고하고 멈춘다.
- `gh auth login` 같은 인증 단계를 자동 실행 금지.
