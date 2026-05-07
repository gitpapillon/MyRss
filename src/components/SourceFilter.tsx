"use client";

import { SOURCES } from "@/lib/feeds";

export default function SourceFilter({
  active,
  counts,
  onChange,
}: {
  active: string;
  counts: Record<string, number>;
  onChange: (sourceId: string) => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const options: { id: string; name: string; count: number }[] = [
    { id: "all", name: "전체", count: total },
    ...SOURCES.map((s) => ({ id: s.id, name: s.name, count: counts[s.id] ?? 0 })),
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const isActive = active === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              isActive
                ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {o.name} <span className="opacity-60">{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}
