export interface Article {
  guid: string;
  source: string;
  title: string;
  summary: string | null;
  link: string;
  published_at: number;
  fetched_at: number;
  title_ko: string | null;
  summary_ko: string | null;
}

export interface SourceDef {
  id: string;
  name: string;
  url: string;
}
