#!/usr/bin/env tsx
// 무인 파이프라인 자가검증: 오늘(KST) collect/brief/daily 가 정상 완료됐는지
// logs·briefing·sent.json 으로 확인 후 PASS/FAIL 요약을 Telegram 으로 통보.
// Windows 작업 스케줄러 'rss-feed verify' 가 daily(06:15) 이후(06:35) 1회 호출.
// 외부 IO(텔레그램)는 src/lib/telegram 격리분 재사용, 부수효과는 통보 1건뿐.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// .env 의 TELEGRAM_* 로드 (daily.ts 와 동일 패턴 — 시크릿은 process.env 경유).
try {
  const envContent = readFileSync(join(process.cwd(), ".env"), "utf-8");
  for (const line of envContent.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0) process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
} catch {
  /* .env 없으면 무시 */
}

import { hasSent } from "../src/lib/state";
import { sendMessage } from "../src/lib/telegram";

function todayKst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// logs/<step>.log 에서 오늘 날짜의 마지막 'cron-run <step> exit N' 이 0 인지.
function stepOk(step: string, date: string): { ok: boolean; detail: string } {
  const path = join(process.cwd(), "logs", `${step}.log`);
  if (!existsSync(path)) return { ok: false, detail: "로그 없음(미실행)" };
  const lines = readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.includes(`[${date}`) && l.includes(`cron-run ${step} exit`));
  if (lines.length === 0) return { ok: false, detail: "오늘 실행 기록 없음" };
  const last = lines[lines.length - 1];
  const ok = last.includes("exit 0 ===");
  return { ok, detail: ok ? "exit 0" : last.trim().slice(-40) };
}

async function main(): Promise<void> {
  const dry = process.argv.slice(2).includes("--dry");
  const date = todayKst();

  const results: { name: string; ok: boolean; detail: string }[] = [];

  for (const step of ["collect", "brief", "daily"]) {
    const r = stepOk(step, date);
    results.push({ name: step, ...r });
  }

  const briefPath = join(process.cwd(), "files", `briefing_${date}.md`);
  const briefOk =
    existsSync(briefPath) &&
    readFileSync(briefPath, "utf-8").startsWith(`# 📈 데일리 브리핑 — ${date}`);
  results.push({
    name: "briefing.md",
    ok: briefOk,
    detail: briefOk ? "헤더 정상" : "없음/헤더 불일치",
  });

  const sentOk = hasSent(date);
  results.push({
    name: "sent.json",
    ok: sentOk,
    detail: sentOk ? `${date} 기록됨` : "미기록(소실 의심 — P1b)",
  });

  const allPass = results.every((r) => r.ok);
  const head = allPass
    ? `✅ 데일리 파이프라인 정상 (${date})`
    : `⚠️ 데일리 파이프라인 점검 필요 (${date})`;
  const body = results
    .map((r) => `${r.ok ? "✅" : "❌"} ${r.name} — ${r.detail}`)
    .join("\n");
  const msg = `${head}\n\n${body}`;

  console.log(msg);

  if (dry) {
    console.log("\n[verify] dry: Telegram 미전송");
    process.exit(allPass ? 0 : 1);
  }

  try {
    await sendMessage(msg); // plain text (parseMode 없음 — 이스케이프 불필요)
    console.log("[verify] Telegram 통보 전송됨");
  } catch (e) {
    console.error(
      `[verify] Telegram 통보 실패: ${e instanceof Error ? e.message : e}`,
    );
    process.exit(1);
  }
  process.exit(allPass ? 0 : 1);
}

main();
