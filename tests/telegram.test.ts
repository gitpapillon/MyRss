import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
import { execFileSync } from "node:child_process";
import { escapeMarkdownV2, sendMessage } from "../src/lib/telegram";

const curlMock = vi.mocked(execFileSync);

describe("escapeMarkdownV2", () => {
  it("모든 MarkdownV2 특수문자를 escape", () => {
    const all = "_*[]()~`>#+-=|{}.!";
    const out = escapeMarkdownV2(all);
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

  beforeEach(() => {
    curlMock.mockReset();
    process.env.TELEGRAM_BOT_TOKEN = "12345:test-token";
    process.env.TELEGRAM_CHAT_ID = "999";
  });

  afterEach(() => {
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

  it("정상 호출 — curl 인자(URL·body) 검증", async () => {
    curlMock.mockReturnValueOnce('{"ok":true}' as never);
    await sendMessage("hello", { parseMode: "MarkdownV2" });

    expect(curlMock).toHaveBeenCalledTimes(1);
    const [bin, args] = curlMock.mock.calls[0] as [string, string[]];
    expect(bin).toBe("curl");
    expect(args).toContain("POST");
    expect(args[args.length - 1]).toBe(
      "https://api.telegram.org/bot12345:test-token/sendMessage",
    );
    const dataIdx = args.indexOf("--data");
    const body = JSON.parse(args[dataIdx + 1]);
    expect(body.chat_id).toBe("999");
    expect(body.text).toBe("hello");
    expect(body.parse_mode).toBe("MarkdownV2");
    expect(body.disable_web_page_preview).toBe(true);
  });

  it("parseMode 미지정 시 parse_mode 필드 없음", async () => {
    curlMock.mockReturnValueOnce('{"ok":true}' as never);
    await sendMessage("plain text");
    const args = curlMock.mock.calls[0][1] as string[];
    const body = JSON.parse(args[args.indexOf("--data") + 1]);
    expect(body.parse_mode).toBeUndefined();
  });

  it("응답 ok:false면 throw (error_code/description 포함)", async () => {
    curlMock.mockReturnValueOnce(
      '{"ok":false,"error_code":400,"description":"bad request"}' as never,
    );
    await expect(sendMessage("x")).rejects.toThrow(
      /sendMessage failed: 400 bad request/,
    );
  });

  it("curl 전송 실패(throw) 시 transport 에러", async () => {
    curlMock.mockImplementationOnce(() => {
      throw new Error("curl: (28) timeout");
    });
    await expect(sendMessage("x")).rejects.toThrow(/transport failed \(curl\)/);
  });

  it("토큰 값이 에러 메시지에 노출되지 않음", async () => {
    curlMock.mockImplementationOnce(() => {
      throw new Error("curl exit https://api.telegram.org/bot12345:test-token/...");
    });
    try {
      await sendMessage("x");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).not.toContain("test-token");
    }
  });
});
