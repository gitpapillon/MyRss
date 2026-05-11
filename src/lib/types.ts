export interface SourceDef {
  id: string;
  name: string;
  url: string;
}

export interface FetchedItem {
  guid: string;
  source: string;
  title: string;
  summary: string | null;
  link: string;
  published_at: number; // unix seconds
  fetched_at: number;
}

export interface TranslatedArticle extends FetchedItem {
  title_ko: string;
  summary_ko: string;
}

export interface SeenStateFile {
  seen: string[];
  updated_at: string; // ISO 8601
}
