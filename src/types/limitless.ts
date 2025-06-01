export interface Lifelog {
  id: string;
  title: string;
  date: string;
  summary?: string;
  content?: string;
  markdown?: string;
  headings?: string[];
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
  duration?: number;
}

export interface ListLifelogsOptions {
  limit?: number;
  timezone?: string;
  direction?: 'asc' | 'desc';
  includeMarkdown?: boolean;
  includeHeadings?: boolean;
}

export interface DateRangeOptions extends ListLifelogsOptions {
  start: string;
  end: string;
}

export interface SearchOptions extends ListLifelogsOptions {
  searchTerm: string;
  fetchLimit?: number;
}

export interface LimitlessAPIResponse<T> {
  data: T;
  pagination?: {
    nextCursor?: string;
    hasMore: boolean;
    total?: number;
  };
  error?: {
    message: string;
    code?: string;
  };
}

export interface LimitlessClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
}