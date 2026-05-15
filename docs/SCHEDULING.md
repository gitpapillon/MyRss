# 매일 07:15 KST 자동 송신 — Windows 작업 스케줄러

## 사전 준비

- 매일 아침 07:15 이전에 Claude Code 데스크톱에서 `files/briefing_YYYY-MM-DD.md` 파일이 생성되어 있어야 한다.
- 프로젝트 경로(WSL 기준): `/mnt/d/Project/ai-make/rss-feed`
- Windows 경로: `D:\Project\ai-make\rss-feed`

## 작업 스케줄러 설정 (GUI)

1. `Win + R` → `taskschd.msc` 실행
2. 우측 패널 → **기본 작업 만들기**
3. 이름: `rss-feed daily 07:15`
4. 트리거: **매일** / 시작 시간 07:15:00
5. 동작: **프로그램 시작**
6. 프로그램/스크립트: `wsl.exe`
7. 인수 추가:
   ```
   -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run daily
   ```
   (배포판 이름이 다르면 `-d <이름>`을 수정. `wsl -l` 로 확인 가능)
8. 마침 클릭 → 작업 우클릭 → **속성** → 다음 조정
   - "사용자 로그온 여부에 관계 없이 실행" (선택)
   - "가장 높은 권한으로 실행"은 보통 불필요
   - 조건 탭 → "AC 전원에서만 실행" 체크 해제 권장

## XML 임포트 (선택 — 빠른 셋업)

`scheduler-task.xml` 같은 이름으로 저장 후 작업 스케줄러 → **작업 가져오기**:

```xml
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-05-14T07:15:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Settings>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
  </Settings>
  <Actions>
    <Exec>
      <Command>wsl.exe</Command>
      <Arguments>-d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run daily</Arguments>
    </Exec>
  </Actions>
</Task>
```

## 동작 확인

수동 테스트:
```
wsl -d Ubuntu --cd /mnt/d/Project/ai-make/rss-feed -- npm run daily
```

- 오늘 분이 이미 송신되었으면 `[daily] already sent for <date>` 로 종료 (idempotent).
- 강제 재송신: `npm run daily -- --force`
- 송신 없이 변환만 확인: `npm run daily -- --dry-run`

## 트러블슈팅

- **파일 없음**: `files/briefing_<오늘>.md` 가 없으면 exit 1. Claude Code로 먼저 생성.
- **PC가 꺼져 있던 시간 트리거 누락**: 작업 스케줄러 설정에서 "예약 시간이 지난 후 가능한 한 빨리 작업 시작" 옵션 활성화. WOL/슬립해제 정책에 따라 동작이 달라짐.
- **WSL 인스턴스가 중단됨**: WSL이 idle로 종료되어도 `wsl.exe -d ... --` 호출 시 자동 부팅됨. 추가 설정 불필요.
