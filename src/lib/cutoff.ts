import type { FetchedItem } from "./types";

export const TOP_K_PER_SOURCE = 5;

export function topKPerSource(items: FetchedItem[], k: number): FetchedItem[] {
  const sorted = [...items].sort((a, b) => b.published_at - a.published_at);
  const counts = new Map<string, number>();
  const result: FetchedItem[] = [];
  for (const it of sorted) {
    const c = counts.get(it.source) ?? 0;
    if (c >= k) continue;
    counts.set(it.source, c + 1);
    result.push(it);
  }
  return result;
}
