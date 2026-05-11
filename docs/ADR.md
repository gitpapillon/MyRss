# Architecture Decision Records

## 철학
MVP 속도 최우선. 외부 의존성 최소화. 작동하는 최소 구현. 1인 사용자 1일 1회 전송이 전부.

---

### ADR-001: 호스팅 = GitHub Actions cron
**결정**: 매일 `30 22 * * *` UTC에 GitHub Actions workflow가 실행.
**이유**: 무료, 상시 가동 머신 불필요, secrets 관리 내장.
**트레이드오프**: cron이 best-effort라 분 단위 지연 가능. private repo는 월 2000분 한도 (월 30분 사용 예상이라 무관).

### ADR-002: 번역 모델 = Claude Haiku 4.5
**결정**: `claude-haiku-4-5-20251001` 모델, prompt caching 적용.
**이유**: 속도·비용 우선.
**트레이드오프**: Sonnet 대비 한국어 톤이 약간 떨어짐.

### ADR-003: 전달 = Telegram Bot API direct
**결정**: 별도 SDK 없이 fetch로 Bot API `sendMessage` 호출.
**이유**: 의존성 1개 줄임. API 표면이 단순.
**트레이드오프**: rate limit·error handling을 직접 구현.

### ADR-004: dedup 상태 = state/seen.json (sqlite 폐기)
**결정**: 단일 JSON 파일. 워크플로가 commit-back.
**이유**: serverless 친화. git diff로 변화 추적 가능.
**트레이드오프**: 동시성 X (cron 1일 1회라 무관).

### ADR-005: 런타임 = tsx (Next.js 제거)
**결정**: TypeScript를 `tsx`로 직접 실행. 빌드 단계 = `tsc --noEmit`.
**이유**: 단일 스크립트 실행에 Next.js / webpack 불필요.
**트레이드오프**: tsx에 가벼운 의존.

### ADR-006: 웹 UI 없음
**결정**: Next.js / React / tailwind / postcss 의존성 전부 제거. `src/app`, `src/components`, `public` 삭제.
**이유**: 전달 채널이 Telegram 1개. 웹 UI는 가치 없음.
**트레이드오프**: 로컬 아카이브 열람 UI 부재.

### ADR-007: 헤드리스 모델 강제 = Haiku
**결정**: `scripts/execute.py`가 `--model claude-haiku-4-5-20251001` 인자로 claude CLI 호출.
**이유**: 사용자 결정 (어떠한 경우에도 Haiku).
**트레이드오프**: 복잡한 step에서 자가교정 실패율 ↑ — step.md를 maximally prescriptive하게 작성해 보완.

### ADR-008: First-run guard
**결정**: `seen.json`이 빈 상태면 fetch 결과를 모두 seen에 mark하고 다이제스트 송신을 skip. "초기화 완료" 알림 1줄만 송신.
**이유**: 첫 실행 시 4096자 초과 또는 가독성 ↓.
**트레이드오프**: 사용자가 첫 실행 시 진짜 다이제스트는 다음날 받아야 함.
