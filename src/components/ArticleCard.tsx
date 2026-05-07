import type { Article } from "@/lib/types";
import { SOURCES } from "@/lib/feeds";

const SOURCE_NAMES: Record<string, string> = Object.fromEntries(
  SOURCES.map((s) => [s.id, s.name])
);

function timeAgo(epochSec: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - epochSec);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}일 전`;
  return new Date(epochSec * 1000).toLocaleDateString("ko-KR");
}

export default function ArticleCard({
  article,
  ko,
  loading,
}: {
  article: Article;
  ko: boolean;
  loading: boolean;
}) {
  const showKo = ko && !!article.title_ko;
  const title = showKo ? article.title_ko! : article.title;
  const summary = showKo ? article.summary_ko ?? "" : article.summary ?? "";
  const sourceLabel = SOURCE_NAMES[article.source] ?? article.source;

  return (
    <article className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <span className="rounded bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {sourceLabel}
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">{timeAgo(article.published_at)}</span>
        {ko && !article.title_ko && loading && (
          <span className="text-zinc-400">번역 중…</span>
        )}
        {ko && !article.title_ko && !loading && (
          <span className="text-amber-600 dark:text-amber-400">번역 대기</span>
        )}
      </div>
      <h2 className="mb-2 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      {summary && (
        <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {summary}
        </p>
      )}
      <a
        href={article.link}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
      >
        원문 보기 →
      </a>
    </article>
  );
}
