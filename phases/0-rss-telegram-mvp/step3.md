# Step 3: telegram-client

## 읽어야 할 파일

- `CLAUDE.md` — 시크릿 처리 CRITICAL
- `docs/ARCHITECTURE.md` — `telegram.ts` 시그니처
- `docs/ADR.md` — ADR-003 (Bot API direct, 별도 SDK 없음)

## 작업

### A. `src/lib/telegram.ts` 신규 작성

Write로 새 파일 생성. 아래 본문 그대로 사용한다 (escape 정규식 특히 변경 금지):

```typescript
const BASE_URL = "https://api.telegram.org";

// MarkdownV2 escape 대상 문자: _ * [ ] ( ) ~ ` > # + - = | { } . !
// 출처: https://core.telegram.org/bots/api#markdownv2-style
const MD2_SPECIAL_CHARS = /[_*\[\]()~`>#+\-=|{}.!]/g;

export function escapeMarkdownV2(s: string): string {
  return s.replace(MD2_SPECIAL_CHARS, (m) => "\\" + m);
}

export interface SendOptions {
  parseMode?: "MarkdownV2" | "HTML";
}

export async function sendMessage(text: string, opts: SendOptions = {}): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is not set");

  const url = `${BASE_URL}/bot${token}/sendMessage`;
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  };
  if (opts.parseMode) body.parse_mode = opts.parseMode;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${res.status} ${errText.slice(0, 300)}`);
  }
}
```

### B. `tests/telegram.test.ts` 신규 작성

vitest + global fetch mock. 아래 본문 그대로 사용:

```typescript
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
```

## Acceptance Criteria

```bash
test -f src/lib/telegram.ts
test -f tests/telegram.test.ts
npm run build
npx vitest run tests/telegram.test.ts
```

위 모두 0으로 종료. 단위 테스트 **11개 전부** 통과.

## 검증 절차

1. `src/lib/telegram.ts`가 위 A 본문과 일치. 특히 `MD2_SPECIAL_CHARS` 정규식의 escape 문자 목록이 정확히 14개(`_*[]()~`>#+\-=|{}.!`) 인지 확인.
2. `tests/telegram.test.ts`의 11개 케이스 전부 통과.
3. `npm run build` 통과.
4. **시크릿 누수 grep**: `grep -rE 'TELEGRAM_BOT_TOKEN\\s*=|TELEGRAM_CHAT_ID\\s*=' src tests` 결과에 실제 토큰 값이 포함되지 않는지 (변수 참조만 있어야 함). test에 더미 값 `12345:test-token`은 OK.
5. `phases/0-rss-telegram-mvp/index.json` step 3 status 업데이트:
   - 통과 → `"completed"`, `"summary": "telegram.ts (escape + sendMessage) + telegram.test.ts 11 case 통과"`

## 금지사항

- `node-telegram-bot-api`, `telegraf` 등 텔레그램 SDK 추가 금지. 이유: ADR-003 (direct fetch만 사용).
- 토큰을 URL 외에 어디에도 로깅하지 마라. 에러 메시지에도 포함 금지. 이유: 시크릿 누수 방지.
- `escapeMarkdownV2` 특수문자 목록 변경 금지. 이유: Telegram 공식 명세와 일치해야 함.
- `chat_id`를 함수 인자로 추가하지 마라. `process.env.TELEGRAM_CHAT_ID` 사용. 이유: 1인 사용자 가정 (PRD).
- 재시도 / rate-limit 로직 추가 금지. 이유: scope 최소화.
