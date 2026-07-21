import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildKakaoSummary,
  exchangeAuthCode,
  refreshAccessToken,
  sendToMe,
} from "../src/lib/kakao";

const curlMock = vi.mocked(execFileSync);

const BRIEFING = `# 📈 데일리 브리핑 — 2026-07-20 (월)

## 🌐 매크로

매크로 요약 텍스트.

## 🚀 RKLB — Rocket Lab USA

**$67.62 (+0.4%)** · 진단: **이벤트 드리븐 강세**

🟢 **호재**
1. 발사 성공

## 🤖 NBIS — Nebius Group

**$177.71 (+3.46%)** · 진단: **모멘텀**

## 🛡️ 064350.KS — 현대로템

**₩159,000 (-5.19%)** · 진단: **리스크 부각**

## 🔭 산업 트래킹

- 광통신 뉴스
`;

describe("buildKakaoSummary", () => {
  it("종목별 1줄(티커·가격·등락·진단) 조립", () => {
    const out = buildKakaoSummary(BRIEFING, "2026-07-20");
    expect(out).toContain("RKLB $67.62 +0.4% 이벤트 드리븐 강세");
    expect(out).toContain("NBIS $177.71 +3.46% 모멘텀");
  });

  it("한국 종목(.KS)은 티커 대신 회사명 + ₩ 표기", () => {
    const out = buildKakaoSummary(BRIEFING, "2026-07-20");
    expect(out).toContain("현대로템 ₩159,000 -5.19% 리스크 부각");
    expect(out).not.toContain("064350.KS");
  });

  it("헤더는 M/D(요일), linkUrl 미지정 시 꼬리 없음", () => {
    const out = buildKakaoSummary(BRIEFING, "2026-07-20");
    expect(out.startsWith("📈 7/20(월) 브리핑")).toBe(true);
    expect(out).not.toContain("전문:");
    expect(out.endsWith("현대로템 ₩159,000 -5.19% 리스크 부각")).toBe(true);
  });

  it("linkUrl 지정 시 마지막 줄에 평문 URL", () => {
    const out = buildKakaoSummary(BRIEFING, "2026-07-20", "https://t.me/sc_rssfeed_bot");
    expect(out.endsWith("\n전문: https://t.me/sc_rssfeed_bot")).toBe(true);
  });

  const many = Array.from({ length: 20 }, (_, i) =>
    [
      `## 🚀 TICK${i} — Long Company Name ${i}`,
      "",
      `**$${100 + i}.00 (+1.2%)** · 진단: **이벤트 드리븐 강세**`,
    ].join("\n"),
  ).join("\n\n");

  it("항상 200자 이하 (종목 과다 시 말줄임)", () => {
    const out = buildKakaoSummary(many, "2026-07-20");
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith("…")).toBe(true);
  });

  it("잘림이 발생해도 URL은 보존 (본문만 잘라냄)", () => {
    const url = "https://t.me/sc_rssfeed_bot";
    const out = buildKakaoSummary(many, "2026-07-20", url);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(`\n전문: ${url}`)).toBe(true);
    expect(out).toContain("…");
  });

  it("가격 미수집 종목은 요약에서 제외", () => {
    const md = [
      "## 🚀 RKLB — Rocket Lab USA",
      "",
      "**가격 미수집** · 진단: **관망**",
      "",
      "## 🤖 NBIS — Nebius Group",
      "",
      "**$177.71 (+3.46%)** · 진단: **모멘텀**",
    ].join("\n");
    const out = buildKakaoSummary(md, "2026-07-20");
    expect(out).not.toContain("RKLB");
    expect(out).toContain("NBIS $177.71");
  });
});

describe("token/send API (curl)", () => {
  let tmp: string;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    curlMock.mockReset();
    tmp = mkdtempSync(join(tmpdir(), "kakao-test-"));
    process.env.KAKAO_REST_API_KEY = "rest-key-1";
    process.env.KAKAO_TOKEN_PATH = join(tmp, "kakao-token.json");
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  function writeTokenFile(rt: string): void {
    writeFileSync(
      process.env.KAKAO_TOKEN_PATH!,
      JSON.stringify({ refresh_token: rt, updated_at: "2026-07-01T00:00:00Z" }),
    );
  }

  describe("refreshAccessToken", () => {
    it("refresh grant 호출 — curl 인자(URL·form) 검증 후 access token 반환", () => {
      writeTokenFile("rt-1");
      curlMock.mockReturnValueOnce('{"access_token":"at-1","expires_in":21599}' as never);

      expect(refreshAccessToken()).toBe("at-1");
      const [bin, args] = curlMock.mock.calls[0] as [string, string[]];
      expect(bin).toBe("curl");
      expect(args[args.length - 1]).toBe("https://kauth.kakao.com/oauth/token");
      expect(args).toContain("grant_type=refresh_token");
      expect(args).toContain("client_id=rest-key-1");
      expect(args).toContain("refresh_token=rt-1");
    });

    it("응답에 새 refresh token이 오면 토큰 파일 갱신", () => {
      writeTokenFile("rt-1");
      curlMock.mockReturnValueOnce(
        '{"access_token":"at-1","refresh_token":"rt-2"}' as never,
      );
      refreshAccessToken();
      const file = JSON.parse(readFileSync(process.env.KAKAO_TOKEN_PATH!, "utf-8"));
      expect(file.refresh_token).toBe("rt-2");
    });

    it("응답에 refresh token 없으면 파일 유지", () => {
      writeTokenFile("rt-1");
      curlMock.mockReturnValueOnce('{"access_token":"at-1"}' as never);
      refreshAccessToken();
      const file = JSON.parse(readFileSync(process.env.KAKAO_TOKEN_PATH!, "utf-8"));
      expect(file.refresh_token).toBe("rt-1");
    });

    it("에러 응답이면 throw (error/error_description 포함)", () => {
      writeTokenFile("rt-1");
      curlMock.mockReturnValueOnce(
        '{"error":"invalid_grant","error_description":"expired"}' as never,
      );
      expect(() => refreshAccessToken()).toThrow(/refresh failed: invalid_grant expired/);
    });

    it("토큰 파일 없으면 kakao:auth 안내로 throw", () => {
      expect(() => refreshAccessToken()).toThrow(/kakao:auth/);
    });

    it("KAKAO_TOKEN_PATH 미설정이면 throw", () => {
      delete process.env.KAKAO_TOKEN_PATH;
      expect(() => refreshAccessToken()).toThrow(/KAKAO_TOKEN_PATH/);
    });

    it("curl 실패 시 transport 에러 — refresh token 비노출", () => {
      writeTokenFile("rt-secret");
      curlMock.mockImplementationOnce(() => {
        throw new Error("curl exit refresh_token=rt-secret");
      });
      try {
        refreshAccessToken();
        throw new Error("should have thrown");
      } catch (e) {
        expect((e as Error).message).toMatch(/transport failed \(curl\)/);
        expect((e as Error).message).not.toContain("rt-secret");
      }
    });
  });

  describe("sendToMe", () => {
    it("정상 호출 — Bearer 헤더·template_object 검증", () => {
      curlMock.mockReturnValueOnce('{"result_code":0}' as never);
      sendToMe("hello 요약", "at-1");

      const args = curlMock.mock.calls[0][1] as string[];
      expect(args[args.length - 1]).toBe(
        "https://kapi.kakao.com/v2/api/talk/memo/default/send",
      );
      expect(args).toContain("Authorization: Bearer at-1");
      const tmplArg = args.find((a) => a.startsWith("template_object="))!;
      const tmpl = JSON.parse(tmplArg.substring("template_object=".length));
      expect(tmpl.object_type).toBe("text");
      expect(tmpl.text).toBe("hello 요약");
      expect(tmpl.link).toEqual({});
      expect(tmpl.button_title).toBeUndefined();
    });

    it("link 지정 시 web/mobile_web_url + button_title 포함", () => {
      curlMock.mockReturnValueOnce('{"result_code":0}' as never);
      sendToMe("요약", "at-1", {
        url: "https://t.me/sc_rssfeed_bot",
        buttonTitle: "텔레그램에서 전문 보기",
      });

      const args = curlMock.mock.calls[0][1] as string[];
      const tmplArg = args.find((a) => a.startsWith("template_object="))!;
      const tmpl = JSON.parse(tmplArg.substring("template_object=".length));
      expect(tmpl.link).toEqual({
        web_url: "https://t.me/sc_rssfeed_bot",
        mobile_web_url: "https://t.me/sc_rssfeed_bot",
      });
      expect(tmpl.button_title).toBe("텔레그램에서 전문 보기");
    });

    it("result_code가 0이 아니면 throw (code/msg 포함)", () => {
      curlMock.mockReturnValueOnce(
        '{"code":-401,"msg":"InvalidTokenException"}' as never,
      );
      expect(() => sendToMe("x", "at-bad")).toThrow(
        /sendToMe failed: -401 InvalidTokenException/,
      );
    });

    it("non-JSON 응답이면 throw", () => {
      curlMock.mockReturnValueOnce("<html>gateway error</html>" as never);
      expect(() => sendToMe("x", "at-1")).toThrow(/non-JSON/);
    });
  });

  describe("exchangeAuthCode", () => {
    it("code 교환 → refresh token 저장 + access token 반환", () => {
      curlMock.mockReturnValueOnce(
        '{"access_token":"at-9","refresh_token":"rt-9"}' as never,
      );
      const at = exchangeAuthCode("auth-code-1", "http://localhost:8877/callback");

      expect(at).toBe("at-9");
      const args = curlMock.mock.calls[0][1] as string[];
      expect(args).toContain("grant_type=authorization_code");
      expect(args).toContain("code=auth-code-1");
      expect(args).toContain("redirect_uri=http://localhost:8877/callback");
      const file = JSON.parse(readFileSync(process.env.KAKAO_TOKEN_PATH!, "utf-8"));
      expect(file.refresh_token).toBe("rt-9");
    });

    it("에러 응답이면 throw하고 파일 미생성", () => {
      curlMock.mockReturnValueOnce('{"error":"invalid_client"}' as never);
      expect(() => exchangeAuthCode("bad", "http://localhost:8877/callback")).toThrow(
        /exchange failed: invalid_client/,
      );
      expect(() => readFileSync(process.env.KAKAO_TOKEN_PATH!, "utf-8")).toThrow();
    });
  });
});
