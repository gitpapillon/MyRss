# Step 2: translator-anthropic

## 읽어야 할 파일

- `CLAUDE.md` — CRITICAL 규칙 (시크릿, 의존성)
- `docs/ARCHITECTURE.md` — `translator.ts` 시그니처, `TranslatedArticle` 타입
- `docs/ADR.md` — ADR-002, ADR-007
- `src/lib/types.ts` (step 1 산출물) — `FetchedItem`, `TranslatedArticle`

## 작업

### A. `src/lib/translator.ts` 신규 작성

Write로 새 파일 생성. 아래 본문을 그대로 사용한다 (변수명·prompt 본문 변경 금지):

```typescript
import Anthropic from "@anthropic-ai/sdk";
import type { FetchedItem, TranslatedArticle } from "./types";

export const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `너는 영어 금융/경제 뉴스 헤드라인을 자연스러운 한국어로 번역하는 전문가다.
규칙:
- 의역 OK, 한국어 경제 뉴스 톤으로 자연스럽게.
- 고유명사(기업명, 인명, 종목)는 영문 그대로 두거나 한국에서 통용되는 표기 사용.
- 출력은 오직 JSON 배열. 설명/머리말/코드펜스 절대 금지.
- 입력의 모든 항목을 동일한 guid로 응답. 누락 금지.
- summary가 빈 문자열이면 summary_ko도 빈 문자열로 반환.`;

const CHUNK_SIZE = 20;
const MAX_TOKENS = 4096;

interface ChunkInput {
  guid: string;
  title: string;
  summary: string;
}

interface ChunkOutput {
  guid: string;
  title_ko: string;
  summary_ko: string;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  _client = new Anthropic(); // ANTHROPIC_API_KEY 환경변수 자동 인식
  return _client;
}

function extractJsonArray(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1].trim() : text;
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON array found in: ${body.slice(0, 200)}`);
  }
  return JSON.parse(body.slice(start, end + 1));
}

function isChunkOutput(v: unknown): v is ChunkOutput {
  return (
    typeof v === "object" &&
    v !== null &&
    typeof (v as ChunkOutput).guid === "string" &&
    typeof (v as ChunkOutput).title_ko === "string" &&
    typeof (v as ChunkOutput).summary_ko === "string"
  );
}

async function callOnce(items: ChunkInput[]): Promise<ChunkOutput[]> {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: `다음 기사들을 번역하라. 출력 스키마: [{"guid":"...","title_ko":"...","summary_ko":"..."}]\n\n${JSON.stringify(items, null, 2)}`,
      },
    ],
  });

  const text = response.content
    .filter((c) => c.type === "text")
    .map((c) => (c as { type: "text"; text: string }).text)
    .join("");

  if (!text) throw new Error("Empty response from Anthropic");

  const parsed = extractJsonArray(text);
  if (!Array.isArray(parsed)) throw new Error("Translation output is not an array");
  return parsed.filter(isChunkOutput);
}

export async function translateArticles(items: FetchedItem[]): Promise<TranslatedArticle[]> {
  if (items.length === 0) return [];

  const byGuid = new Map<string, ChunkOutput>();
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE).map((it) => ({
      guid: it.guid,
      title: it.title,
      summary: it.summary ?? "",
    }));
    const out = await callOnce(chunk);
    for (const o of out) byGuid.set(o.guid, o);
  }

  return items.map((it) => {
    const tr = byGuid.get(it.guid);
    return {
      ...it,
      title_ko: tr?.title_ko ?? it.title,
      summary_ko: tr?.summary_ko ?? (it.summary ?? ""),
    };
  });
}
```

### B. `tests/translator.test.ts` 신규 작성

vitest + SDK mock. 아래 본문 그대로 사용:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { translateArticles } from "../src/lib/translator";
import type { FetchedItem } from "../src/lib/types";

const item = (guid: string, title: string, summary: string | null = null): FetchedItem => ({
  guid,
  source: "test",
  title,
  summary,
  link: `https://example.com/${guid}`,
  published_at: 1700000000,
  fetched_at: 1700000000,
});

const textBlock = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

describe("translator", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("빈 입력 → 빈 출력, API 미호출", async () => {
    const out = await translateArticles([]);
    expect(out).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("정상 응답을 TranslatedArticle로 변환", async () => {
    mockCreate.mockResolvedValueOnce(
      textBlock('[{"guid":"g1","title_ko":"제목","summary_ko":"요약"}]')
    );
    const out = await translateArticles([item("g1", "Title", "Summary")]);
    expect(out).toHaveLength(1);
    expect(out[0].guid).toBe("g1");
    expect(out[0].title_ko).toBe("제목");
    expect(out[0].summary_ko).toBe("요약");
    // 원본 필드도 유지되어야 함
    expect(out[0].title).toBe("Title");
    expect(out[0].link).toBe("https://example.com/g1");
  });

  it("API 응답에서 빠진 guid는 원본 영문으로 fallback", async () => {
    mockCreate.mockResolvedValueOnce(
      textBlock('[{"guid":"g1","title_ko":"제목1","summary_ko":""}]')
    );
    const out = await translateArticles([item("g1", "T1"), item("g2", "T2", "S2")]);
    expect(out[0].title_ko).toBe("제목1");
    expect(out[1].title_ko).toBe("T2"); // fallback
    expect(out[1].summary_ko).toBe("S2");
  });

  it("코드펜스로 감싼 JSON도 파싱", async () => {
    mockCreate.mockResolvedValueOnce(
      textBlock('```json\n[{"guid":"g1","title_ko":"제목","summary_ko":""}]\n```')
    );
    const out = await translateArticles([item("g1", "T")]);
    expect(out[0].title_ko).toBe("제목");
  });

  it("CHUNK_SIZE 초과 입력은 여러 번 호출", async () => {
    mockCreate
      .mockResolvedValueOnce(
        textBlock(
          JSON.stringify(
            Array.from({ length: 20 }, (_, i) => ({
              guid: `g${i}`,
              title_ko: `제목${i}`,
              summary_ko: "",
            }))
          )
        )
      )
      .mockResolvedValueOnce(
        textBlock('[{"guid":"g20","title_ko":"제목20","summary_ko":""}]')
      );
    const inputs = Array.from({ length: 21 }, (_, i) => item(`g${i}`, `Title${i}`));
    const out = await translateArticles(inputs);
    expect(out).toHaveLength(21);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(out[20].title_ko).toBe("제목20");
  });

  it("API가 비어있는 응답을 주면 throw", async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });
    await expect(translateArticles([item("g1", "T")])).rejects.toThrow(/Empty response/);
  });

  it("JSON 파싱 실패 시 throw", async () => {
    mockCreate.mockResolvedValueOnce(textBlock("not json at all"));
    await expect(translateArticles([item("g1", "T")])).rejects.toThrow(/No JSON array/);
  });

  it("system 메시지에 cache_control 포함 (prompt caching)", async () => {
    mockCreate.mockResolvedValueOnce(textBlock('[{"guid":"g1","title_ko":"x","summary_ko":""}]'));
    await translateArticles([item("g1", "T")]);
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
    expect(Array.isArray(call.system)).toBe(true);
    expect(call.system[0].cache_control).toEqual({ type: "ephemeral" });
  });
});
```

## Acceptance Criteria

```bash
test -f src/lib/translator.ts
test -f tests/translator.test.ts
npm run build
npx vitest run tests/translator.test.ts
```

위 모두 0으로 종료. 단위 테스트 **8개 전부** 통과.

## 검증 절차

1. `src/lib/translator.ts`가 위 A 본문과 일치 (모델 ID, system prompt, cache_control 위치 특히 확인).
2. `tests/translator.test.ts` 모든 케이스 통과 — 특히 "system 메시지에 cache_control 포함" 케이스가 통과해야 ADR-002의 prompt caching이 보장된다.
3. `npm run build` 통과.
4. `phases/0-rss-telegram-mvp/index.json` step 2 status:
   - 통과 → `"completed"`, `"summary": "translator.ts (Haiku 4.5, prompt caching) + translator.test.ts 8 case 통과"`
   - 실패/차단 → 규칙대로 업데이트

## 금지사항

- **`process.env.ANTHROPIC_API_KEY`를 코드에 명시적으로 읽거나 로깅하지 마라.** SDK가 자동 인식한다. 이유: 시크릿 노출 표면 최소화.
- 모델 ID를 다른 값으로 변경 금지. 이유: ADR-002·ADR-007 결정.
- `cache_control` 누락 또는 위치 변경 금지. 이유: prompt caching 미적용 시 비용 증가.
- 재시도/rate-limit 로직 추가 금지 (이번 step에서는). 이유: scope 최소화. 필요해지면 별도 step에서.
- 신규 의존성 추가 금지 (`@anthropic-ai/sdk`는 사전 셋업에 이미 있음).
