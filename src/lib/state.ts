import fs from "node:fs";
import path from "node:path";
import type { FetchedItem, SeenStateFile } from "./types";

const STATE_DIR = path.join(process.cwd(), "state");
const STATE_FILE = path.join(STATE_DIR, "seen.json");

export function loadSeen(): Set<string> {
  if (!fs.existsSync(STATE_FILE)) {
    return new Set();
  }
  const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as SeenStateFile;
  return new Set(data.seen);
}

export function saveSeen(guids: Iterable<string>): void {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
  const uniqueGuids = Array.from(new Set(guids));
  uniqueGuids.sort();
  const stateFile: SeenStateFile = {
    seen: uniqueGuids,
    updated_at: new Date().toISOString(),
  };
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(stateFile, null, 2));
    console.log(`[state] saved ${uniqueGuids.length} guids to ${STATE_FILE}`);
  } catch (e) {
    console.error(`[state] failed to write: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  }
}

export function diffNew(items: FetchedItem[], seen: Set<string>): FetchedItem[] {
  return items.filter((item) => !seen.has(item.guid));
}
