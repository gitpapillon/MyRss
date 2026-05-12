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
    system: SYSTEM_PROMPT,
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
