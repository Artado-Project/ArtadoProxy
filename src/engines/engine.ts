import type { SearchEngineId, SearchResult } from '../types.js';

export type EngineSearchParams = {
  query: string;
  limit: number;
  pageno?: number;
  signal?: AbortSignal;
  region?: string;
};

export type Engine = {
  id: SearchEngineId;
  search: (params: EngineSearchParams) => Promise<SearchResult[]>;
};
