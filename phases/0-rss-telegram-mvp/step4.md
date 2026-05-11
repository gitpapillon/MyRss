# Step 4: digest-formatter

## 읽어야 할 파일

- `docs/ARCHITECTURE.md` — `digest.ts` 시그니처, MarkdownV2 사용 정책
- `docs/ADR.md`
- `src/lib/types.ts` (step 1 산출물) — `TranslatedArticle`
- `src/lib/telegram.ts` (step 3 산출물) — `escapeMarkdownV2` 재사용

## 작업

### A. `src/lib/digest.ts` 신규 작성

Write로 새 파일 생성. 본문 그대로 사용한다:

```typescript
import type { TranslatedArticle } from "./types";
import { escapeMarkdownV2 } from "./telegram";

const MAX_LENGTH = 4096;
const ELLIPSIS = "\n\\(이하 생략\\)";

// URL은 escapeMarkdownV2를 그대로 쓰면 . / 등이 escape되어 깨진다.
// MarkdownV2 link target에서 escape 필요한 문자는 ) 와 \ 뿐.
function escapeLinkUrl(url: string): string {
  return url.replace(/[)\\]/g, (m) => "\\" + m);
}

export function buildDigest(articles: TranslatedArticle[]): string {
  if (articles.length === 0) {
    return escapeMarkdownV2("오늘은 새 기사가 없습니다.");
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const lines: string[] = [];
  lines.push(`*${escapeMarkdownV2(`📰 ${today} RSS 다이제스트`)}*`);

  // 소스별 그룹화 — 첫 등장 순서 유지 (Map이 insertion order 보장)
  const bySource = new Map<string, TranslatedArticle[]>();
  for (const a of articles) {
    const list = bySource.get(a.source);
    if (list) list.push(a);
    else bySource.set(a.source, [a]);
  }

  for (const [source, items] of bySource) {
    lines.push("");
    lines.push(`*${escapeMarkdownV2(source)} \\(${items.length}건\\)*`);
    items.forEach((a, i) => {
      lines.push(`${i + 1}\\. *${escapeMarkdownV2(a.title_ko)}*`);
      if (a.summary_ko) {
        lines.push(`   ${escapeMarkdownV2(a.summary_ko)}`);
      }
      lines.push(`   [원문](${escapeLinkUrl(a.link)})`);
    });
  }

  let result = lines.join("\n");
  if (result.length > MAX_LENGTH) {
    const limit = MAX_LENGTH - ELLIPSIS.length;
    result = result.slice(0, limit) + ELLIPSIS;
  }
  return result;
}
```

### B. `tests/digest.test.ts` 신규 작성

```typescript
import { describe, it, expect } from "vitest";
import { buildDigest } from "../src/lib/digest";
import type { TranslatedArticle } from "../src/lib/types";

const article = (overrides: Partial<TranslatedArticle> = {}): TranslatedArticle => ({
  guid: "g1",
  source: "reuters",
  title: "Title",
  summary: "Summary",
  link: "https://example.com/a",
  published_at: 1700000000,
  fetched_at: 1700000000,
  title_ko: "제목",
  summary_ko: "요약",
  ...overrides,
});

describe("buildDigest", () => {
  it("빈 배열 → 기본 메시지", () => {
    const out = buildDigest([]);
    expect(out).toContain("오늘은 새 기사가 없습니다");
  });

  it("1건 — 헤더 + 소스명 + 제목 + 요약 + 링크 포함", () => {
    const out = buildDigest([article()]);
    expect(out).toContain("RSS 다이제스트");
    expect(out).toContain("reuters");
    expect(out).toContain("제목");
    expect(out).toContain("요약");
    expect(out).toContain("https://example.com/a");
    expect(out).toContain("[원문]");
  });

  it("여러 소스 — 그룹화", () => {
    const out = buildDigest([
      article({ guid: "g1", source: "reuters", title_ko: "A1" }),
      article({ guid: "g2", source: "cnbc", title_ko: "A2" }),
      article({ guid: "g3", source: "reuters", title_ko: "A3" }),
    ]);
    // reuters 섹션이 cnbc보다 먼저 등장
    const reutersIdx = out.indexOf("reuters");
    const cnbcIdx = out.indexOf("cnbc");
    expect(reutersIdx).toBeGreaterThan(-1);
    expect(cnbcIdx).toBeGreaterThan(reutersIdx);
    // reuters 섹션에 A1, A3 둘 다
    const reutersSection = out.slice(reutersIdx, cnbcIdx);
    expect(reutersSection).toContain("A1");
    expect(reutersSection).toContain("A3");
  });

  it("소스별 카운트 표기", () => {
    const out = buildDigest([
      article({ guid: "g1", source: "x" }),
      article({ guid: "g2", source: "x" }),
    ]);
    // "x (2건)" — 괄호는 escape되어 \( \)
    expect(out).toMatch(/x.*2건/);
  });

  it("summary_ko가 빈 문자열이면 요약 라인 생략", () => {
    const out = buildDigest([article({ summary_ko: "" })]);
    // 요약 라인이 없어야 한다 — "요약"이라는 단어 자체가 없음 (테스트 데이터에 \"요약\" 텍스트 없도록)
    const lines = out.split("\n");
    const titleLineIdx = lines.findIndex((l) => l.includes("제목"));
    const nextLine = lines[titleLineIdx + 1] ?? "";
    // 다음 줄은 [원문] 링크여야 함 (요약 줄 X)
    expect(nextLine).toContain("[원문]");
  });

  it("MarkdownV2 escape — 점·하이픈 escape 확인", () => {
    const out = buildDigest([article()]);
    // "1." 표시는 "1\\." 로 escape
    expect(out).toContain("1\\.");
    // 날짜 하이픈은 escape
    expect(out).toMatch(/\d{4}\\-\d{2}\\-\d{2}/);
  });

  it("URL은 . / : 등을 escape하지 않음 (MarkdownV2 link 규칙)", () => {
    const out = buildDigest([article({ link: "https://example.com/path?q=1" })]);
    expect(out).toContain("https://example.com/path?q=1");
    expect(out).not.toContain("https:\\//");
  });

  it("URL에 ) 포함 시 escape", () => {
    const out = buildDigest([article({ link: "https://example.com/a)b" })]);
    expect(out).toContain("https://example.com/a\\)b");
  });

  it("4096자 초과 시 잘리고 ellipsis 부착", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      article({
        guid: `g${i}`,
        source: "src",
        title_ko: `매우긴제목 ${i} `.repeat(10),
        summary_ko: `매우긴요약 ${i} `.repeat(10),
      })
    );
    const out = buildDigest(many);
    expect(out.length).toBeLessThanOrEqual(4096);
    expect(out).toContain("이하 생략");
  });

  it("제목·요약의 특수문자 escape (괄호, 점 등)", () => {
    const out = buildDigest([
      article({ title_ko: "A.B (test)", summary_ko: "x_y*z" }),
    ]);
    expect(out).toContain("A\\.B \\(test\\)");
    expect(out).toContain("x\\_y\\*z");
  });
});
```

## Acceptance Criteria

```bash
test -f src/lib/digest.ts
test -f tests/digest.test.ts
npm run build
npx vitest run tests/digest.test.ts
```

위 모두 0으로 종료. 단위 테스트 **10개 전부** 통과.

## 검증 절차

1. `src/lib/digest.ts`가 위 A 본문과 일치. 특히 `escapeLinkUrl` 정규식과 ELLIPSIS escape 확인.
2. 10개 테스트 전부 통과.
3. `npm run build` 통과.
4. step 4 status 업데이트:
   - 통과 → `"completed"`, `"summary": "digest.ts (소스별 그룹 + 길이 제한 + escape) + digest.test.ts 10 case 통과"`

## 금지사항

- `telegram.ts`의 `escapeMarkdownV2`를 복제하지 마라. 반드시 import 재사용. 이유: DRY + 일관성.
- MarkdownV2 link target 안에서 점/슬래시를 escape하지 마라. 이유: URL이 깨진다 (`escapeLinkUrl`만 사용).
- `today` 계산 시 라이브러리(date-fns, dayjs 등) 추가 금지. `new Date().toISOString()` 사용. 이유: 의존성 최소화.
- 메시지 길이 제한 값(4096)을 환경변수로 외부화하지 마라. 이유: Telegram 고정 값.
- 다른 lib 파일 수정 금지.
