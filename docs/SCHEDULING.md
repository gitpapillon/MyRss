# 자동 실행 — Windows 작업 스케줄러 (2개 작업)

매일 KST 기준 **2개 작업**이 순차로 동작해야 한다:

매일 KST 기준 **3개 작업**이 순차로 동작한다 (완전 무인):

| 시각 | 작업 | 명령 | 산출물 |
|---|---|---|---|
| 07:00 | RSS 수집 | `npm run collect` | `files/news_YYYY-MM-DD.json` |
| 07:05 | 브리핑 자동 작성 | `npm run brief` (헤드리스 claude) | `files/briefing_YYYY-MM-DD.md` |
| 07:15 | Telegram 송신 | `npm run daily` | 텔레그램 메시지 |

- 프로젝트 경로 — WSL: `/mnt/d/Project/ai-make/rss-feed` / Windows: `D:\Project\ai-make\rss-feed`
- `npm run brief`는 `scripts/brief.ts`가 news풀을 헤드리스 `claude -p`(기본 `claude-sonnet-4-6`, `BRIEF_MODEL` 로 override)로 분석해 v4 브리핑을 작성한다. 검증(헤더+parseBriefing) 실패 시 파일 미작성·exit 1 → daily가 안 보냄(쓰레기 송신 방지). `briefing_<오늘>.md`가 이미 있으면 skip(수동 작성본 보호).
- 매일 brief 1회당 claude 토큰 비용 발생(news풀 압축 입력 + 짧은 출력).

## 등록 방법 A — schtasks 한 줄 (가장 빠름)

Windows에서 **관리자 명령 프롬프트/PowerShell**로 실행:

```cmd
schtasks /Create /TN "rss-feed collect 0700" /TR "wsl.exe -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run collect" /SC DAILY /ST 07:00 /F
schtasks /Create /TN "rss-feed brief 0705"   /TR "wsl.exe -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run brief"   /SC DAILY /ST 07:05 /F
schtasks /Create /TN "rss-feed daily 0715"   /TR "wsl.exe -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run daily"   /SC DAILY /ST 07:15 /F
```

(WSL 배포판이 Ubuntu가 아니면 `-d <이름>` 수정. `wsl -l` 로 확인.)

등록 확인: `schtasks /Query /TN "rss-feed collect 0700" /V /FO LIST`

## 등록 방법 B — XML 임포트

`scheduler/rss-collect-0700.xml`, `scheduler/rss-brief-0705.xml`, `scheduler/rss-daily-0715.xml` 를 작업 스케줄러(`taskschd.msc`) → **작업 가져오기**로 각각 임포트. (StartBoundary는 과거 날짜여도 매일 트리거에는 무관.)

## 등록 방법 C — GUI 수동

`taskschd.msc` → 기본 작업 만들기 → 트리거 매일 07:00(collect)/07:05(brief)/07:15(daily) → 동작 "프로그램 시작" → 프로그램 `wsl.exe`, 인수 `-d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run collect`(또는 `npm run brief` / `npm run daily`) → 속성에서 "AC 전원에서만 실행" 해제 권장.

## 동작 확인 (수동 테스트)

```bash
wsl -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run collect
wsl -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run brief -- --dry   # 생성·검증만, 파일 미작성
wsl -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run brief           # briefing 작성
wsl -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run daily -- --dry-run
wsl -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run daily
```

- 오늘 분이 이미 송신되었으면 `[daily] already sent for <date>` (idempotent). 강제: `npm run daily -- --force`.

## 트러블슈팅

- **브리핑 없음**: `files/briefing_<오늘>.md` 부재 → daily `exit 1`. 원인 추적: ① `news_<오늘>.json` 있는지(collect 성공?) ② `npm run brief` 로그/검증 실패 여부(헤더·parseBriefing) ③ `claude` CLI 인증 상태. 수동 보강: `npm run brief --force` 또는 직접 작성.
- **brief 실패**: claude CLI 미인증/타임아웃/검증 실패 시 파일 미작성. `npm run brief -- --dry` 로 재현. 모델 변경: `BRIEF_MODEL=claude-opus-4-7 npm run brief`.
- **PC 꺼짐/절전으로 트리거 누락**: XML/작업 모두 `StartWhenAvailable=true` 설정 — 부팅 후 지난 작업을 가능한 한 빨리 실행.
- **WSL idle 종료**: `wsl.exe -d ... --` 호출 시 자동 부팅. 추가 설정 불필요.
- **Telegram 송신 실패**: 전송 트랜스포트는 `curl`(child_process) — WSL undici ETIMEDOUT 이슈는 해소됨. 실패 시 토큰부터 점검: `.env` 로드 후 `curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"` 가 `"ok":true` 인지(시크릿 미출력). 401이면 @BotFather에서 토큰 재발급.
- **SEC EDGAR 403**: collect 시 SEC 피드가 간헐적 403 — 나머지 20여 개 피드로 커버되므로 무시 가능.

## 무인화 (구현됨)

`news_*.json → 호재/악재 분석 → briefing_*.md` LLM 단계는 `scripts/brief.ts`(`npm run brief`, 07:05 작업)가 헤드리스 `claude -p`로 자동 수행 → **완전 무인**. 트레이드오프: 매일 claude 토큰 비용, 분석 품질은 모델 의존(기본 Sonnet, `BRIEF_MODEL`로 Opus 상향 가능), claude CLI가 해당 머신에 인증돼 있어야 함. 품질이 중요한 날은 brief를 끄고(또는 생성 후) 사람이 `briefing_<오늘>.md`를 직접 덮어써도 됨(brief는 기존 파일 skip).
