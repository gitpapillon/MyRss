import { execFileSync } from "node:child_process";

const BASE_URL = "https://api.telegram.org";
const TIMEOUT_SEC = 25;

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

  // Node fetch(undici)가 일부 환경(WSL2)에서 api.telegram.org에 ETIMEDOUT 되는
  // 문제로 전송은 curl(system 바이너리, npm 의존성 아님)로 처리한다.
  let stdout: string;
  try {
    stdout = execFileSync(
      "curl",
      [
        "-sS",
        "-X",
        "POST",
        "-H",
        "Content-Type: application/json",
        "--max-time",
        String(TIMEOUT_SEC),
        "--data",
        JSON.stringify(body),
        url,
      ],
      { encoding: "utf-8", maxBuffer: 1024 * 1024 },
    );
  } catch {
    // 토큰이 포함된 url/명령을 에러 메시지에 절대 넣지 않는다.
    throw new Error("Telegram sendMessage transport failed (curl)");
  }

  let ok = false;
  let detail = "";
  try {
    const json = JSON.parse(stdout) as {
      ok?: boolean;
      error_code?: number;
      description?: string;
    };
    ok = json.ok === true;
    if (!ok) detail = `${json.error_code ?? ""} ${json.description ?? ""}`.trim();
  } catch {
    detail = "non-JSON response";
  }
  if (!ok) {
    throw new Error(`Telegram sendMessage failed: ${detail.slice(0, 300)}`);
  }
}
