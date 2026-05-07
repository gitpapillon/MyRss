"use client";

import { useMemo, useState, useTransition } from "react";
import type { Article } from "@/lib/types";
import ArticleCard from "./ArticleCard";
import LanguageToggle from "./LanguageToggle";
import SourceFilter from "./SourceFilter";
import RefreshButton from "./RefreshButton";

export default function ReaderShell({ initial }: { initial: Article[] }) {
  const [articles, setArticles] = useState<Article[]>(initial);
  const [ko, setKo] = useState(false);
  const [activeSource, setActiveSource] = useState<string>("all");
  const [translating, setTranslating] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of articles) c[a.source] = (c[a.source] ?? 0) + 1;
    return c;
  }, [articles]);

  const visible = useMemo(
    () => (activeSource === "all" ? articles : articles.filter((a) => a.source === activeSource)),
    [articles, activeSource]
  );

  async function handleRefresh() {
    setErrorMsg(null);
    startRefresh(async () => {
      try {
        const res = await fetch("/api/feeds/refresh", { method: "POST" });
        if (!res.ok) throw new Error(`refresh ${res.status}`);
        const data = (await res.json()) as { articles: Article[]; report?: { source: string; ok: boolean; error?: string }[] };
        setArticles(data.articles);
        const failed = (data.report ?? []).filter((r) => !r.ok);
        if (failed.length > 0) {
          setErrorMsg(`일부 소스 실패: ${failed.map((f) => f.source).join(", ")}`);
        }
      } catch (e) {
        setErrorMsg(`새로고침 실패: ${(e as Error).message}`);
      }
    });
  }

  async function handleToggle(next: boolean) {
    setKo(next);
    setErrorMsg(null);
    if (!next) return;
    const need = visible.filter((a) => a.title_ko === null).map((a) => a.guid);
    if (need.length === 0) return;
    setTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guids: need }),
      });
      const data = (await res.json()) as { articles?: Article[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `translate ${res.status}`);
      const byGuid = new Map((data.articles ?? []).map((a) => [a.guid, a]));
      setArticles((prev) => prev.map((a) => byGuid.get(a.guid) ?? a));
    } catch (e) {
      setErrorMsg(`번역 실패: ${(e as Error).message}`);
    } finally {
      setTranslating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">RSS Reader</h1>
          <div className="flex items-center gap-2">
            <RefreshButton onClick={handleRefresh} busy={refreshing} />
            <LanguageToggle ko={ko} onChange={handleToggle} busy={translating} />
          </div>
        </div>
        <SourceFilter active={activeSource} counts={counts} onChange={setActiveSource} />
      </header>

      {errorMsg && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {errorMsg}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          기사가 없습니다. 우측 상단 <b>새로고침</b>을 눌러 RSS를 수집하세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((a) => (
            <ArticleCard key={a.guid} article={a} ko={ko} loading={translating} />
          ))}
        </div>
      )}
    </div>
  );
}
