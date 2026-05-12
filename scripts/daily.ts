#!/usr/bin/env tsx
import { fetchAllSources } from "../src/lib/feeds";
import { loadSeen, saveSeen, diffNew } from "../src/lib/state";
import { translateArticles } from "../src/lib/translator";
import { buildDigest } from "../src/lib/digest";
import { sendMessage } from "../src/lib/telegram";
import { topKPerSource, TOP_K_PER_SOURCE } from "../src/lib/cutoff";

const FIRST_RUN_MESSAGE = "🟢 RSS 봇 초기화 완료. 다음 실행부터 다이제스트가 도착합니다.";

function isDryRun(): boolean {
  return process.argv.slice(2).includes("--dry-run");
}

async function main(): Promise<void> {
  const dryRun = isDryRun();
  console.log(`[daily] start (dry-run=${dryRun})`);

  const seen = loadSeen();
  const isFirstRun = seen.size === 0;
  console.log(`[daily] seen=${seen.size} (first-run=${isFirstRun})`);

  const { items, report } = await fetchAllSources();
  console.log(`[daily] fetched ${items.length} items from ${report.length} sources`);
  for (const r of report) {
    if (!r.ok) console.warn(`[daily] source failed: ${r.source} (${r.error ?? "unknown"})`);
  }

  if (isFirstRun) {
    if (dryRun) {
      console.log(`[daily] (dry-run) FIRST-RUN: would send: ${FIRST_RUN_MESSAGE}`);
    } else {
      await sendMessage(FIRST_RUN_MESSAGE);
    }
    saveSeen(items.map((i) => i.guid));
    console.log(`[daily] first-run init: marked ${items.length} items as seen`);
    return;
  }

  const newItems = diffNew(items, seen);
  console.log(`[daily] new items: ${newItems.length}`);

  if (newItems.length === 0) {
    console.log("[daily] no new items. skipping send.");
    saveSeen([...seen, ...items.map((i) => i.guid)]);
    return;
  }

  const toTranslate = topKPerSource(newItems, TOP_K_PER_SOURCE);
  console.log(`[daily] translating ${toTranslate.length}/${newItems.length} items (top-${TOP_K_PER_SOURCE}/source)...`);
  const translated = await translateArticles(toTranslate);

  const digest = buildDigest(translated);
  console.log(`[daily] digest length: ${digest.length} chars`);

  if (dryRun) {
    console.log("\n=== DIGEST (dry-run) ===\n");
    console.log(digest);
    console.log("\n=== END ===\n");
  } else {
    await sendMessage(digest, { parseMode: "MarkdownV2" });
    console.log("[daily] digest sent.");
  }

  saveSeen([...seen, ...items.map((i) => i.guid)]);
  console.log("[daily] state saved.");
}

main().catch((e) => {
  console.error("[daily] FATAL:", e instanceof Error ? (e.stack ?? e.message) : String(e));
  process.exit(1);
});
