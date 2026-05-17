import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hasSent, markSent } from "../src/lib/state";

// 실제 런타임 state/sent.json 을 절대 건드리지 않도록 매 테스트 임시 디렉터리로 격리.
// (과거: 이 테스트가 process.cwd()/state/sent.json 을 unlink 해 무인 dedup 상태가 소실됐음.)
let tmpDir: string;
let stateFile: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rss-state-"));
  process.env.RSS_STATE_DIR = tmpDir;
  stateFile = path.join(tmpDir, "sent.json");
});

afterEach(() => {
  delete process.env.RSS_STATE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("state", () => {
  it("파일 없으면 hasSent false", () => {
    expect(hasSent("2026-05-13")).toBe(false);
  });

  it("markSent 후 hasSent true", () => {
    markSent("2026-05-13");
    expect(hasSent("2026-05-13")).toBe(true);
    expect(hasSent("2026-05-14")).toBe(false);
  });

  it("여러 날짜 누적", () => {
    markSent("2026-05-13");
    markSent("2026-05-14");
    expect(hasSent("2026-05-13")).toBe(true);
    expect(hasSent("2026-05-14")).toBe(true);
  });

  it("동일 날짜 중복 추가 무해", () => {
    markSent("2026-05-13");
    markSent("2026-05-13");
    const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    expect(data.sent_dates).toEqual(["2026-05-13"]);
  });

  it("저장 파일에 정렬된 배열 + updated_at 포함", () => {
    markSent("2026-05-14");
    markSent("2026-05-13");
    const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    expect(data.sent_dates).toEqual(["2026-05-13", "2026-05-14"]);
    expect(typeof data.updated_at).toBe("string");
  });
});
