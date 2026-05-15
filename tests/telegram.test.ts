import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { escapeMarkdownV2, sendMessage } from "../src/lib/telegram";

describe("escapeMarkdownV2", () => {
  it("모든 MarkdownV2 특수문자를 escape", () => {
    const all = "_*[]()~`>#+-=|{}.!";
    const out = escapeMarkdownV2(all);
    // 각 특수문자마다 백슬래시가 앞에 붙는다
    for (const c of all) {
      expect(out).toContain("\\" + c);
    }
  });

  it("일반 텍스트는 그대로", () => {
    expect(escapeMarkdownV2("Hello world 한국어")).toBe("Hello world 한국어");
  });

  it("점 하나도 escape (Telegram 흔한 실수 케이스)", () => {
    expect(escapeMarkdownV2("v1.2.3")).toBe("v1\\.2\\.3");
  });

  it("괄호 escape", () => {
    expect(escapeMarkdownV2("(test)")).toBe("\\(test\\)");
  });

  it("빈 문자열은 빈 문자열", () => {
    expect(escapeMarkdownV2("")).toBe("");
  });
});

describe("sendMessage", () => {
  const originalEnv = { ...process.env };
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.TELEGRAM_BOT_TOKEN = "12345:test-token";
    process.env.TELEGRAM_CHAT_ID = "999";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("토큰 없으면 throw", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    await expect(sendMessage("hi")).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);
  });

  it("chat_id 없으면 throw", async () => {
    delete process.env.TELEGRAM_CHAT_ID;
    await expect(sendMessage("hi")).rejects.toThrow(/TELEGRAM_CHAT_ID/);
  });

  it("정상 호출 — URL과 body 검증", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await sendMessage("hello", { parseMode: "MarkdownV2" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot12345:test-token/sendMessage");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.chat_id).toBe("999");
    expect(body.text).toBe("hello");
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.disable_web_page_preview).toBe(true);
  });

  it("parseMode 미지정 시 parse_mode 필드 없음", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    await sendMessage("plain text");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.parse_mode).toBeUndefined();
  });

  it("응답이 not ok면 throw", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => '{"description":"bad request"}',
    });
    await expect(sendMessage("x")).rejects.toThrow(/sendMessage failed: 400/);
  });

  it("토큰 값이 에러 메시지에 노출되지 않음", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "internal error",
    });
    try {
      await sendMessage("x");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).not.toContain("test-token");
    }
  });
});
