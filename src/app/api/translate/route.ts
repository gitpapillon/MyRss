import { NextResponse } from "next/server";
import { getUntranslated, saveTranslations, getArticles } from "@/lib/db";
import { translateArticles } from "@/lib/translator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요." },
      { status: 500 }
    );
  }
  let body: { guids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const guids = Array.isArray(body.guids) ? (body.guids as unknown[]).filter((g): g is string => typeof g === "string") : [];
  if (guids.length === 0) {
    return NextResponse.json({ articles: [] });
  }

  const todo = getUntranslated(guids);
  if (todo.length === 0) {
    return NextResponse.json({ articles: getArticles(guids) });
  }

  try {
    const translated = await translateArticles(
      todo.map((a) => ({ guid: a.guid, title: a.title, summary: a.summary }))
    );
    if (translated.length > 0) saveTranslations(translated);
    return NextResponse.json({ articles: getArticles(guids) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[translate] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
