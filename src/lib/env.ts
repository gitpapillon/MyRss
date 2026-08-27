/**
 * .env 로더.
 *
 * 시크릿은 중앙 볼트(`/mnt/d/.secrets/MyRss/.env`)에 두고 프로젝트 폴더에는 두지 않는다.
 * 스케줄러 경로는 `scripts/cron-run.sh` 가 볼트를 export 해주지만, 래퍼 없이 직접 실행할 때
 * (`npm run kakao:auth` 등)는 아무도 export 해주지 않으므로 같은 경로를 여기서도 읽는다.
 *
 * 파일이 없으면 조용히 건너뛴다 — 볼트가 없는 CI·테스트 환경에서도 import 가 실패하면 안 된다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 중앙 시크릿 볼트의 .env. `cron-run.sh` 의 ENV_FILE 과 같은 경로여야 한다. */
export const VAULT_ENV = "/mnt/d/.secrets/MyRss/.env";

/**
 * `KEY=VALUE` 줄을 파싱한다. 빈 줄과 `#` 주석은 무시하고, 키·값의 앞뒤 공백은 제거한다.
 * 값 안의 `=` 는 보존한다(첫 `=` 만 구분자).
 */
export function parseEnvFile(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

/**
 * 볼트 → 프로젝트 순으로 .env 를 읽어 `process.env` 에 주입한다(뒤에 읽은 쪽이 우선).
 * 실제로 읽은 경로 목록을 반환한다. `ENV_FILE` 환경변수로 볼트 경로를 덮어쓸 수 있다.
 */
export function loadEnv(paths?: string[]): string[] {
  const targets = paths ?? [
    process.env.ENV_FILE ?? VAULT_ENV,
    join(process.cwd(), ".env"),
  ];
  const loaded: string[] = [];
  for (const p of targets) {
    let content: string;
    try {
      content = readFileSync(p, "utf-8");
    } catch {
      continue;
    }
    for (const [k, v] of Object.entries(parseEnvFile(content))) {
      process.env[k] = v;
    }
    loaded.push(p);
  }
  return loaded;
}
