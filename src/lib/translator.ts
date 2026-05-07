import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });
export const MODEL = "gemini-2.5-flash-lite";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface TranslateInput {
  guid: string;
  title: string;
  summary: string | null;
}
export interface TranslateOutput {
  guid: string;
  title_ko: string;
  summary_ko: string;
}

const SYSTEM = `너는 영어 금융/경제 뉴스 헤드라인을 자연스러운 한국어로 번역하는 전문가다.
규칙:
- 의역 OK, 한국어 경제 뉴스 톤으로 자연스럽게.
- 고유명사(기업명, 인명, 종목)는 그대로 영문으로 두거나 한국에서 통용되는 표기 사용.
- 출력은 오직 JSON 배열. 설명/머리말/코드펜스 절대 금지.
- 입력의 모든 항목을 동일한 guid로 응답. 누락 금지.
- summary가 빈 문자열이면 summary_ko도 빈 문자열로 반환.`;

function buildPrompt(items: TranslateInput[]): string {
  const payload = items.map((i) => ({
    guid: i.guid,
    title: i.title,
    summary: i.summary ?? "",
  }));
  return `다음 기사들을 번역하라. 출력 스키마: [{"guid":"...","title_ko":"...","summary_ko":"..."}]

${JSON.stringify(payload, null, 2)}`;
}

function extractJson(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

async function callOnce(items: TranslateInput[]): Promise<TranslateOutput[]> {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: buildPrompt(items),
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
  const text = response.text ?? "";
  if (!text) throw new Error("Empty response from Gemini");
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch (e) {
    throw new Error(
      `Translation JSON parse failed: ${(e as Error).message}\nRaw: ${text.slice(0, 500)}`
    );
  }
  if (!Array.isArray(parsed)) throw new Error("Translation output is not an array");
  return parsed.filter(
    (r): r is TranslateOutput =>
      !!r &&
      typeof r === "object" &&
      typeof (r as TranslateOutput).guid === "string" &&
      typeof (r as TranslateOutput).title_ko === "string" &&
      typeof (r as TranslateOutput).summary_ko === "string"
  );
}

function parseRetryDelaySec(message: string): number | null {
  const m = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  if (m) return Math.ceil(parseFloat(m[1]));
  return null;
}

function isQuotaError(message: string): boolean {
  return (
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes('"code":429') ||
    message.includes("code: 429") ||
    /\b429\b/.test(message)
  );
}

async function translateChunk(items: TranslateInput[]): Promise<TranslateOutput[]> {
  if (items.length === 0) return [];
  try {
    return await callOnce(items);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (!isQuotaError(msg)) throw e;
    const waitSec = (parseRetryDelaySec(msg) ?? 30) + 2;
    console.warn(`[translator] 429 — ${waitSec}s 대기 후 1회 재시도`);
    await sleep(waitSec * 1000);
    return callOnce(items);
  }
}

export async function translateArticles(items: TranslateInput[]): Promise<TranslateOutput[]> {
  if (items.length === 0) return [];
  const CHUNK = 30;
  const RATE_DELAY_MS = 4500;
  const chunks: TranslateInput[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) chunks.push(items.slice(i, i + CHUNK));
  const results: TranslateOutput[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(RATE_DELAY_MS);
    const out = await translateChunk(chunks[i]);
    results.push(...out);
  }
  return results;
}
