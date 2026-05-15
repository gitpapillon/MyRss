#!/usr/bin/env tsx
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const envPath = join(process.cwd(), ".env");
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const k = trimmed.substring(0, eq).trim();
        const v = trimmed.substring(eq + 1).trim();
        process.env[k] = v;
      }
    }
  });
} catch {
  // .env 없으면 무시
}

import { gfmToMd2 } from "../src/lib/markdown";
import { splitMessage } from "../src/lib/splitter";
import { sendMessage } from "../src/lib/telegram";
import { hasSent, markSent } from "../src/lib/state";

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
    console.log("\n=== END (dry-run, not sent) ===");
    return;
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`[daily] sending chunk ${i + 1}/${chunks.length}...`);
    await sendMessage(chunks[i], { parseMode: "MarkdownV2" });
  }
  markSent(date);
  console.log("[daily] done.");
}

main().catch((e) => {
  console.error("[daily] FATAL:", e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
