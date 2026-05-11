import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadSeen, saveSeen, diffNew } from "../src/lib/state";
import type { FetchedItem } from "../src/lib/types";

const STATE_FILE = path.join(process.cwd(), "state", "seen.json");

function removeStateFile() {
  if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
}

describe("state", () => {
  beforeEach(removeStateFile);
  afterEach(removeStateFile);

  describe("loadSeen", () => {
    it("파일이 없으면 빈 Set 반환", () => {
      expect(loadSeen().size).toBe(0);
    });

    it("seen.json을 읽어 Set으로 반환", () => {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(
        STATE_FILE,
        JSON.stringify({
          seen: ["a", "b", "c"],
          updated_at: "2026-01-01T00:00:00Z",
        })
      );
      const result = loadSeen();
      expect(result.size).toBe(3);
      expect(result.has("a")).toBe(true);
      expect(result.has("b")).toBe(true);
      expect(result.has("c")).toBe(true);
    });

    it("JSON 파싱 실패 시 throw", () => {
      fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
      fs.writeFileSync(STATE_FILE, "not json");
      expect(() => loadSeen()).toThrow();
    });
  });

  describe("saveSeen", () => {
    it("디렉토리 없으면 만들고 파일 작성", () => {
      saveSeen(["x", "y"]);
      expect(fs.existsSync(STATE_FILE)).toBe(true);
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      expect(new Set(data.seen)).toEqual(new Set(["x", "y"]));
      expect(typeof data.updated_at).toBe("string");
    });

    it("중복 제거 + 정렬", () => {
      saveSeen(["c", "a", "b", "a"]);
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      expect(data.seen).toEqual(["a", "b", "c"]);
    });

    it("Set도 받을 수 있음 (Iterable)", () => {
      saveSeen(new Set(["m", "n"]));
      const data = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      expect(new Set(data.seen)).toEqual(new Set(["m", "n"]));
    });
  });

  describe("diffNew", () => {
    const mkItem = (guid: string): FetchedItem => ({
      guid,
      source: "test",
      title: "t",
      summary: null,
      link: "https://example.com",
      published_at: 0,
      fetched_at: 0,
    });

    it("seen에 없는 것만 반환", () => {
      const items = [mkItem("a"), mkItem("b"), mkItem("c")];
      const seen = new Set(["b"]);
      expect(diffNew(items, seen).map((i) => i.guid)).toEqual(["a", "c"]);
    });

    it("입력 순서 보존", () => {
      const items = [mkItem("z"), mkItem("y"), mkItem("x")];
      expect(diffNew(items, new Set()).map((i) => i.guid)).toEqual([
        "z",
        "y",
        "x",
      ]);
    });

    it("빈 입력 → 빈 배열", () => {
      expect(diffNew([], new Set(["a"]))).toEqual([]);
    });
  });
});
