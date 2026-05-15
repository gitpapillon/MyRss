import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { hasSent, markSent } from "../src/lib/state";

const STATE_FILE = path.join(process.cwd(), "state", "sent.json");

function removeStateFile() {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

describe("state", () => {
  beforeEach(removeStateFile);
  afterEach(removeStateFile);

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
    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    expect(data.sent_dates).toEqual(["2026-05-13"]);
  });

  it("저장 파일에 정렬된 배열 + updated_at 포함", () => {
    markSent("2026-05-14");
    markSent("2026-05-13");
    const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
    expect(data.sent_dates).toEqual(["2026-05-13", "2026-05-14"]);
    expect(typeof data.updated_at).toBe("string");
  });
});
