#!/bin/bash
# Windows 작업 스케줄러 → wsl.exe 에서 호출되는 무인 래퍼.
# CRITICAL: Task Scheduler 가 띄우는 클린 로그인 셸은 .bashrc(nvm 초기화)를 읽지 않아
#   npm 이 WSL PATH interop 의 Windows npm(/mnt/c/...)으로 폴백 → tsx 실패.
#   따라서 nvm 을 명시적으로 로드하고, 그래도 Linux node 가 아니면 즉시 실패(로그에 명확히).
# 사용: cron-run.sh <collect|brief|daily>
set -o pipefail
cd /mnt/d/Project/ai-make/rss-feed || exit 1
step="$1"
[ -z "$step" ] && { echo "usage: cron-run.sh <collect|brief|daily>" >&2; exit 2; }
mkdir -p logs
log="logs/${step}.log"
ts() { date '+%Y-%m-%d %H:%M:%S %Z'; }
echo "=== [$(ts)] cron-run ${step} start ===" >> "$log"

# brief 단계의 `claude` CLI 는 ~/.local/bin. -l 미사용이라 .profile 이 안 읽히므로 명시 추가.
export PATH="$HOME/.local/bin:$PATH"

export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1
fi

npm_path="$(command -v npm || true)"
case "$npm_path" in
  "$NVM_DIR"/*) : ;; # OK: nvm npm
  *)
    echo "[wrap] FATAL: Linux nvm npm 미해결 (npm=${npm_path:-none}). nvm 로드 실패 — 중단." >> "$log"
    echo "=== [$(ts)] cron-run ${step} exit 90 ===" >> "$log"
    exit 90
    ;;
esac

# 의존성 가드: Task Scheduler 의 missed-task catch-up 이 collect/brief/daily 를
# 거의 동시에 트리거할 때 선행 산출물이 아직 없으면 단순 실패하는 함정 회피.
# 선행 파일이 생길 때까지 폴링하고, 타임아웃되면 exit 75(skip) — verify 가 잡음.
today="$(TZ=Asia/Seoul date +%F)"
wait_for() {
  local path="$1" timeout="$2" waited=0
  while [ ! -s "$path" ]; do
    if [ "$waited" -ge "$timeout" ]; then
      echo "[wrap] SKIP: 선행 산출물 미생성 (${path}) — ${timeout}s 대기 타임아웃." >> "$log"
      echo "=== [$(ts)] cron-run ${step} exit 75 ===" >> "$log"
      exit 75
    fi
    sleep 5
    waited=$((waited + 5))
  done
  [ "$waited" -gt 0 ] && echo "[wrap] gated: ${path} 등장까지 ${waited}s 대기 후 진행." >> "$log"
}
case "$step" in
  brief) wait_for "files/news_${today}.json" 120 ;;
  daily) wait_for "files/briefing_${today}.md" 300 ;;
esac

npm run "$step" >> "$log" 2>&1
rc=$?
echo "=== [$(ts)] cron-run ${step} exit ${rc} ===" >> "$log"
exit "$rc"
