import { describe, expect, it } from "vitest";
import { parseEnvFile } from "../src/lib/env";

describe("parseEnvFile", () => {
  it("KEY=VALUE 줄을 파싱한다", () => {
    expect(parseEnvFile("A=1\nB=two")).toEqual({ A: "1", B: "two" });
  });

  it("빈 줄과 # 주석을 무시한다", () => {
    expect(parseEnvFile("\n# comment\nA=1\n\n  # indented\nB=2\n")).toEqual({
      A: "1",
      B: "2",
    });
  });

  it("키·값의 앞뒤 공백을 제거한다", () => {
    expect(parseEnvFile("  A  =  1  ")).toEqual({ A: "1" });
  });

  it("값 안의 = 를 보존한다 (첫 = 만 구분자)", () => {
    expect(parseEnvFile("URL=http://x/y?a=b&c=d")).toEqual({
      URL: "http://x/y?a=b&c=d",
    });
  });

  it("= 없는 줄과 = 로 시작하는 줄은 버린다", () => {
    expect(parseEnvFile("BARE\n=novalue\nA=1")).toEqual({ A: "1" });
  });

  it("빈 값을 허용한다 (미설정 표현)", () => {
    expect(parseEnvFile("KAKAO_REST_API_KEY=")).toEqual({
      KAKAO_REST_API_KEY: "",
    });
  });

  it("뒤에 온 같은 키가 앞을 덮어쓴다", () => {
    expect(parseEnvFile("A=1\nA=2")).toEqual({ A: "2" });
  });
});
