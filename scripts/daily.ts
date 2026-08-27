#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { loadEnv } from "../src/lib/env";

loadEnv();

import { gfmToMd2 } from "../src/lib/markdown";
import { splitMessage } from "../src/lib/splitter";
import { getBotUsername, sendMessage } from "../src/lib/telegram";
import { hasSent, markSent } from "../src/lib/state";
import { buildKakaoSummary, refreshAccessToken, sendToMe } from "../src/lib/kakao";

const FILES_DIR = "files";

function todayKst(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const force = argv.includes("--force");

  const date = todayKst();
  const briefingPath = join(process.cwd(), FILES_DIR, `briefing_${date}.md`);
  console.log(`[daily] start (date=${date} dry-run=${dryRun} force=${force})`);

  if (!existsSync(briefingPath)) {
    console.error(`[daily] briefing not found: ${briefingPath}`);
    process.exit(1);
  }

  if (!force && hasSent(date)) {
    console.log(`[daily] already sent for ${date}. Use --force to resend.`);
    return;
  }

  const md = readFileSync(briefingPath, "utf-8");
  const converted = gfmToMd2(md);
  const chunks = splitMessage(converted);
  console.log(`[daily] converted: ${converted.length} chars → ${chunks.length} chunk(s)`);

  if (dryRun) {
    chunks.forEach((c, i) => {
      console.log(`\n=== CHUNK ${i + 1}/${chunks.length} (${c.length} chars) ===\n`);
      console.log(c);
    });
    const kakaoPreview = buildKakaoSummary(md, date);
    console.log(`\n=== KAKAO SUMMARY (${kakaoPreview.length} chars) ===\n`);
    console.log(kakaoPreview);
    console.log("[link] 텔레그램에서 전문 보기 → https://t.me/<bot>");
    console.log("\n=== END (dry-run, not sent) ===");
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[daily] sending chunk ${i + 1}/${chunks.length}...`);
    await sendMessage(chunks[i], { parseMode: "MarkdownV2" });
  }
  markSent(date);

  // 카카오 "나에게 보내기" 요약 — 미설정 시 skip, 실패해도 Telegram 성공에 영향 없음
  const kakaoTokenPath = process.env.KAKAO_TOKEN_PATH;
  if (process.env.KAKAO_REST_API_KEY && kakaoTokenPath && existsSync(kakaoTokenPath)) {
    try {
      // 버튼 렌더링은 t.me 도메인이 카카오 앱 [제품 링크 관리]에 등록돼 있어야 한다.
      sendToMe(buildKakaoSummary(md, date), refreshAccessToken(), {
        url: `https://t.me/${getBotUsername()}`,
        buttonTitle: "텔레그램에서 전문 보기",
      });
      console.log("[daily] kakao summary sent.");
    } catch (e) {
      console.error("[daily] kakao warn:", e instanceof Error ? e.message : String(e));
    }
  } else {
    // 조용히 건너뛰면 카카오가 며칠씩 죽어도 로그·verify 어디에도 흔적이 없다.
    const missing: string[] = [];
    if (!process.env.KAKAO_REST_API_KEY) missing.push("KAKAO_REST_API_KEY");
    if (!kakaoTokenPath) missing.push("KAKAO_TOKEN_PATH");
    else if (!existsSync(kakaoTokenPath)) missing.push(`토큰 파일 없음(${kakaoTokenPath})`);
    console.log(`[daily] kakao skipped — ${missing.join(", ")}`);
  }

  console.log("[daily] done.");
}

main().catch((e) => {
  console.error("[daily] FATAL:", e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
