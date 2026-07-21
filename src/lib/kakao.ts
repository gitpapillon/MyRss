import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const AUTH_BASE = "https://kauth.kakao.com";
const API_BASE = "https://kapi.kakao.com";
const TIMEOUT_SEC = 25;
const MAX_TEXT_LEN = 200; // 카카오 "나에게 보내기" 텍스트 템플릿 표시 한도

interface KakaoTokenFile {
  refresh_token: string;
  updated_at: string;
}

function restApiKey(): string {
  const k = process.env.KAKAO_REST_API_KEY;
  if (!k) throw new Error("KAKAO_REST_API_KEY is not set");
  return k;
}

function tokenPath(): string {
  const p = process.env.KAKAO_TOKEN_PATH;
  if (!p) throw new Error("KAKAO_TOKEN_PATH is not set");
  return p;
}

function saveTokenFile(refreshToken: string): void {
  const p = tokenPath();
  mkdirSync(dirname(p), { recursive: true });
  const file: KakaoTokenFile = {
    refresh_token: refreshToken,
    updated_at: new Date().toISOString(),
  };
  writeFileSync(p, JSON.stringify(file, null, 2) + "\n");
}

// telegram.ts와 동일하게 WSL2 undici ETIMEDOUT 회피를 위해 curl로 전송한다.
function kakaoPost(
  url: string,
  form: Record<string, string>,
  headers: string[] = [],
): Record<string, unknown> {
  const args = ["-sS", "-X", "POST", "--max-time", String(TIMEOUT_SEC)];
  for (const h of headers) args.push("-H", h);
  for (const [k, v] of Object.entries(form)) args.push("--data-urlencode", `${k}=${v}`);
  args.push(url);

  let stdout: string;
  try {
    stdout = execFileSync("curl", args, { encoding: "utf-8", maxBuffer: 1024 * 1024 });
  } catch {
    // 토큰·키가 포함된 인자를 에러 메시지에 절대 넣지 않는다.
    throw new Error("Kakao API transport failed (curl)");
  }
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    throw new Error("Kakao API non-JSON response");
  }
}

function authError(prefix: string, json: Record<string, unknown>): Error {
  const detail = `${String(json.error ?? "")} ${String(json.error_description ?? "")}`.trim();
  return new Error(`${prefix}: ${detail}`.slice(0, 300));
}

/** 인가 코드 → 토큰 교환. refresh token을 KAKAO_TOKEN_PATH에 저장하고 access token을 반환. */
export function exchangeAuthCode(code: string, redirectUri: string): string {
  const json = kakaoPost(`${AUTH_BASE}/oauth/token`, {
    grant_type: "authorization_code",
    client_id: restApiKey(),
    redirect_uri: redirectUri,
    code,
  });
  const at = json.access_token;
  const rt = json.refresh_token;
  if (typeof at !== "string" || typeof rt !== "string") {
    throw authError("Kakao token exchange failed", json);
  }
  saveTokenFile(rt);
  return at;
}

/**
 * KAKAO_TOKEN_PATH의 refresh token으로 access token 발급.
 * 만료 1개월 미만이면 카카오가 새 refresh token을 내려주므로 파일을 갱신한다.
 */
export function refreshAccessToken(): string {
  const p = tokenPath();
  let refreshToken: string | undefined;
  try {
    const file = JSON.parse(readFileSync(p, "utf-8")) as KakaoTokenFile;
    refreshToken = file.refresh_token;
  } catch {
    throw new Error("Kakao token file not readable — run 'npm run kakao:auth' first");
  }
  if (!refreshToken) {
    throw new Error("Kakao token file has no refresh_token — run 'npm run kakao:auth' first");
  }

  const json = kakaoPost(`${AUTH_BASE}/oauth/token`, {
    grant_type: "refresh_token",
    client_id: restApiKey(),
    refresh_token: refreshToken,
  });
  const at = json.access_token;
  if (typeof at !== "string") {
    throw authError("Kakao token refresh failed", json);
  }
  if (typeof json.refresh_token === "string") saveTokenFile(json.refresh_token);
  return at;
}

export interface KakaoLink {
  url: string;
  buttonTitle?: string;
}

/** "나와의 채팅"으로 텍스트 메시지 발송 (기본 텍스트 템플릿). link 지정 시 버튼·본문 탭으로 연결. */
export function sendToMe(text: string, accessToken: string, link?: KakaoLink): void {
  const template: Record<string, unknown> = {
    object_type: "text",
    text,
    link: link ? { web_url: link.url, mobile_web_url: link.url } : {},
  };
  if (link?.buttonTitle) template.button_title = link.buttonTitle;
  const templateObject = JSON.stringify(template);
  const json = kakaoPost(
    `${API_BASE}/v2/api/talk/memo/default/send`,
    { template_object: templateObject },
    [`Authorization: Bearer ${accessToken}`],
  );
  if (json.result_code !== 0) {
    const detail = `${String(json.code ?? "")} ${String(json.msg ?? "")}`.trim();
    throw new Error(`Kakao sendToMe failed: ${detail}`.slice(0, 300));
  }
}

// `## 🚀 RKLB — Rocket Lab USA` (숫자 시작 한국 티커 064350.KS 포함)
const TICKER_HEADER = /^##\s+\S+\s+([A-Z0-9][A-Z0-9.\-]*)\s+[—–-]\s+(.+?)\s*$/;
// `**$67.62 (+0.4%)** · 진단: **이벤트 드리븐 강세**` ($·₩ 모두)
const PRICE_LINE = /^\*\*([$₩][\d,.]+)\s*\(([+\-]?[\d.]+%)\)\*\*\s*·\s*진단:\s*\*\*(.+?)\*\*/;

/**
 * 브리핑 MD → 카카오 200자 요약 (순수 함수). date는 "YYYY-MM-DD".
 *
 * linkUrl을 주면 본문 마지막 줄에 평문 URL로 붙인다(카톡 클라이언트가 자동 링크화).
 * 템플릿 link/button은 도메인을 [앱 > 제품 링크 관리]에 등록해야만 렌더링되므로
 * 본문 URL이 설정 없이 동작하는 유일한 경로다. URL은 잘림에서 항상 보호된다.
 */
export function buildKakaoSummary(
  briefingMd: string,
  date: string,
  linkUrl?: string,
): string {
  const rows: string[] = [];
  let pendingName: string | null = null;
  for (const raw of briefingMd.split("\n")) {
    const line = raw.trim();
    const header = TICKER_HEADER.exec(line);
    if (header) {
      // 한국 종목(.KS/.KQ)은 숫자 티커 대신 회사명으로 표기
      pendingName = /\.(KS|KQ)$/.test(header[1]) ? header[2] : header[1];
      continue;
    }
    if (!pendingName) continue;
    const price = PRICE_LINE.exec(line);
    if (price) {
      rows.push(`${pendingName} ${price[1]} ${price[2]} ${price[3]}`);
      pendingName = null;
    }
  }

  const weekday = new Intl.DateTimeFormat("ko-KR", {
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(`${date}T00:00:00+09:00`));
  const [, m, d] = date.split("-");
  const header = `📈 ${Number(m)}/${Number(d)}(${weekday}) 브리핑`;

  const tail = linkUrl ? `\n전문: ${linkUrl}` : "";
  const budget = MAX_TEXT_LEN - tail.length;
  const body = [header, ...rows].join("\n");
  return (body.length <= budget ? body : body.slice(0, budget - 1) + "…") + tail;
}
