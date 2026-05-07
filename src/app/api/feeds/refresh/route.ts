import { NextResponse } from "next/server";
import { fetchAllSources } from "@/lib/feeds";
import { upsertArticles, listArticles } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const { items, report } = await fetchAllSources();
  const inserted = items.length > 0 ? upsertArticles(items) : 0;
  const articles = listArticles({ limit: 200 });
  return NextResponse.json({ report, inserted, articles });
}

export async function GET() {
  return POST();
}
