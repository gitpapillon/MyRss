import { NextResponse } from "next/server";
import { listArticles } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source") ?? undefined;
  const limit = Number(searchParams.get("limit") ?? "200");
  const articles = listArticles({
    source: source && source !== "all" ? source : undefined,
    limit: Number.isFinite(limit) ? limit : 200,
  });
  return NextResponse.json({ articles });
}
