#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import { join } from "node:path";

try {
  const envPath = join(process.cwd(), ".env");
  const envContent = readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const k = trimmed.substring(0, eq).trim();
        const v = trimmed.substring(eq + 1).trim();
        process.env[k] = v;
      }
    }
  });
} catch {
  // .env 없으면 무시
}

import { createServer } from "node:http";
import { exchangeAuthCode, sendToMe } from "../src/lib/kakao";

const PORT = 8877;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

async function main(): Promise<void> {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    console.error("[kakao-auth] KAKAO_REST_API_KEY가 .env에 없습니다.");
    process.exit(1);
  }
  if (!process.env.KAKAO_TOKEN_PATH) {
    console.error("[kakao-auth] KAKAO_TOKEN_PATH가 .env에 없습니다.");
    process.exit(1);
  }

  const authorizeUrl =
    `https://kauth.kakao.com/oauth/authorize?response_type=code` +
    `&client_id=${key}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=talk_message`;

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        c
          ? "<h3>✅ 인증 완료 — 터미널로 돌아가세요. 이 창은 닫아도 됩니다.</h3>"
          : "<h3>❌ 인증 실패 — 터미널 로그를 확인하세요.</h3>",
      );
      server.close();
      if (c) resolve(c);
      else reject(new Error(`authorize callback error: ${err ?? "no code"}`));
    });
    server.on("error", reject);
    server.listen(PORT, () => {
      console.log("[kakao-auth] 아래 URL을 브라우저에서 열어 카카오 로그인·동의를 완료하세요:\n");
      console.log(authorizeUrl + "\n");
      console.log(`[kakao-auth] 콜백 대기 중... (${REDIRECT_URI})`);
    });
  });

  console.log("[kakao-auth] 인가 코드 수신 → 토큰 교환 중...");
  const accessToken = exchangeAuthCode(code, REDIRECT_URI);
  console.log(`[kakao-auth] refresh token 저장 완료: ${process.env.KAKAO_TOKEN_PATH}`);

  sendToMe("✅ 카카오 연동 성공 — 데일리 브리핑 요약이 이 채팅으로 도착합니다.", accessToken);
  console.log("[kakao-auth] 테스트 메시지 발송 완료. 카카오톡 '나와의 채팅'을 확인하세요.");
}

main().catch((e) => {
  console.error("[kakao-auth] FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
