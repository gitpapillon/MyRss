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
