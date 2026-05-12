import fs from "node:fs";
import path from "node:path";

const STATE_DIR = path.join(process.cwd(), "state");
const STATE_FILE = path.join(STATE_DIR, "sent.json");

interface SentStateFile {
  sent_dates: string[];
  updated_at: string;
}

function loadAll(): Set<string> {
  if (!fs.existsSync(STATE_FILE)) return new Set();
  const raw = fs.readFileSync(STATE_FILE, "utf-8");
  const data = JSON.parse(raw) as SentStateFile;
  return new Set(data.sent_dates ?? []);
}

export function hasSent(date: string): boolean {
  return loadAll().has(date);
}

export function markSent(date: string): void {
  const dates = loadAll();
  dates.add(date);
  if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
  const file: SentStateFile = {
    sent_dates: [...dates].sort(),
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(file, null, 2));
  console.log(`[state] marked ${date} as sent (total ${file.sent_dates.length})`);
}
