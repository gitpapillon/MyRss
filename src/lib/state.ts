import fs from "node:fs";
import path from "node:path";

// 프로덕션 경로는 항상 state/sent.json (CLAUDE.md 단일파일 규칙 불변).
// RSS_STATE_DIR 는 테스트 격리 전용 override — 실제 런타임 상태 오염 방지.
function stateDir(): string {
  return process.env.RSS_STATE_DIR
    ? path.resolve(process.env.RSS_STATE_DIR)
    : path.join(process.cwd(), "state");
}
function stateFile(): string {
  return path.join(stateDir(), "sent.json");
}

interface SentStateFile {
  sent_dates: string[];
  updated_at: string;
}

function loadAll(): Set<string> {
  const f = stateFile();
  if (!fs.existsSync(f)) return new Set();
  const raw = fs.readFileSync(f, "utf-8");
  const data = JSON.parse(raw) as SentStateFile;
  return new Set(data.sent_dates ?? []);
}

export function hasSent(date: string): boolean {
  return loadAll().has(date);
}

export function markSent(date: string): void {
  const dates = loadAll();
  dates.add(date);
  const dir = stateDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file: SentStateFile = {
    sent_dates: [...dates].sort(),
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(stateFile(), JSON.stringify(file, null, 2));
  console.log(`[state] marked ${date} as sent (total ${file.sent_dates.length})`);
}
