export interface LifelogContent {
  type: 'heading1' | 'heading2' | 'blockquote';
  content: string;
  startTime: string;
  endTime: string;
  startOffsetMs: number;
  endOffsetMs: number;
  children: LifelogContent[];
  speakerName?: string;
  speakerIdentifier?: 'user' | null;
}

export interface Lifelog {
  id: string;
  title: string;
  markdown?: string;
  startTime: string;
  endTime: string;
  contents?: LifelogContent[];
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
