import {
  Lifelog,
  ListLifelogsOptions,
  DateRangeOptions,
  SearchOptions,
  LimitlessAPIResponse,
  LimitlessClientConfig,
} from '../types/limitless';
import { logger } from '../utils/logger';
import { retry } from '../utils/retry';
import { formatDate } from '../utils/date';
import {
  lifelogCache,
  lifelogArrayCache,
  searchCache,
  buildLifelogCacheKey,
  buildDateCacheKey,
  buildSearchCacheKey,
  buildRecentCacheKey,
} from './cache';

const DEFAULT_BASE_URL = 'https://api.limitless.ai/v1';
const DEFAULT_TIMEOUT = 120000; // 120 seconds
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY = 1000;

export class LimitlessAPIError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'LimitlessAPIError';
  }
}

export class LimitlessClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;
  private retryAttempts: number;
  private retryDelay: number;

  constructor(config: LimitlessClientConfig) {
    // Allow empty API key for local-only mode
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.retryAttempts = config.retryAttempts || DEFAULT_RETRY_ATTEMPTS;
    this.retryDelay = config.retryDelay || DEFAULT_RETRY_DELAY;
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    // Check if API key is available
    if (!this.apiKey) {
      throw new LimitlessAPIError('API key is required for API calls', 401);
    }

    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await retry(
        async () => {
          const res = await fetch(url, {
            ...options,
            headers: {
              'X-API-Key': this.apiKey,
              'Content-Type': 'application/json',
              ...options.headers,
            },
            signal: controller.signal,
          });

          if (!res.ok) {
            const errorData = (await res.json().catch(() => ({ message: res.statusText }))) as {
              message?: string;
              code?: string;
            };
            throw new LimitlessAPIError(
              errorData.message || `HTTP ${res.status}`,
              res.status,
              errorData.code,
              errorData
            );
          }

          return res;
        },
        {
          attempts: this.retryAttempts,
          delay: this.retryDelay,
          shouldRetry: (error) => {
            if (error instanceof LimitlessAPIError) {
              // Retry on 5xx errors or specific 4xx errors
              return error.statusCode ? error.statusCode >= 500 || error.statusCode === 429 : false;
            }
            return true; // Retry on network errors
          },
        }
      );

      const data = await response.json();
      return data as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LimitlessAPIError('Request timeout', 408, 'TIMEOUT');
      }
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getLifelogById(
    id: string,
    options: Pick<ListLifelogsOptions, 'includeMarkdown' | 'includeHeadings'> = {}
  ): Promise<Lifelog> {
    logger.debug(`Fetching lifelog with ID: ${id}`);

    // Check cache first
    const cacheKey = buildLifelogCacheKey(id);
    const cached = lifelogCache.get(cacheKey);
    if (cached) {
      logger.debug(`Lifelog ${id} retrieved from cache`);
      return cached;
    }

    const params = new URLSearchParams();
    if (options.includeMarkdown !== undefined) {
      params.append('includeMarkdown', String(options.includeMarkdown));
    }
    if (options.includeHeadings !== undefined) {
      params.append('includeHeadings', String(options.includeHeadings));
    }

    const queryString = params.toString();
    const endpoint = `/lifelogs/${id}${queryString ? `?${queryString}` : ''}`;

    const response = await this.makeRequest<LimitlessAPIResponse<Lifelog>>(endpoint);

    if (response.error) {
      throw new LimitlessAPIError(response.error.message, undefined, response.error.code);
    }

    // Cache the result
    lifelogCache.set(cacheKey, response.data);

    return response.data;
  }

  async listLifelogsByDate(date: string, options: ListLifelogsOptions = {}): Promise<Lifelog[]> {
    const formattedDate = formatDate(date);
    logger.debug(`Listing lifelogs for date: ${formattedDate}`);

    // Check cache first
    const cacheKey = buildDateCacheKey(formattedDate, options);
    const cached = lifelogArrayCache.get(cacheKey);
    if (cached) {
      logger.debug(`Lifelogs for ${formattedDate} retrieved from cache`);
      return cached;
    }

    const params = this.buildQueryParams(options);
    params.append('date', formattedDate);

    const result = await this.fetchAllLifelogs('/lifelogs', params, options.limit);

    // Cache the result
    lifelogArrayCache.set(cacheKey, result);

    return result;
  }

  async listLifelogsByRange(options: DateRangeOptions): Promise<Lifelog[]> {
    const { start, end, ...listOptions } = options;
    const formattedStart = formatDate(start);
    const formattedEnd = formatDate(end);

    logger.debug(`Listing lifelogs from ${formattedStart} to ${formattedEnd}`);

    const params = this.buildQueryParams(listOptions);
    params.append('start', formattedStart);
    params.append('end', formattedEnd);

    return this.fetchAllLifelogs('/lifelogs', params, listOptions.limit);
  }

  async listRecentLifelogs(options: ListLifelogsOptions = {}): Promise<Lifelog[]> {
    const limit = options.limit || 10;
    logger.debug(`Listing ${limit} recent lifelogs`);

    // Check cache first
    const cacheKey = buildRecentCacheKey(options);
    const cached = lifelogArrayCache.get(cacheKey);
    if (cached) {
      logger.debug(`Recent lifelogs retrieved from cache`);
      return cached;
    }

    const params = this.buildQueryParams(options);
    params.append('recent', 'true');

    const result = await this.fetchAllLifelogs('/lifelogs', params, limit);

    // Cache the result
    lifelogArrayCache.set(cacheKey, result);

    return result;
  }

  async searchLifelogs(options: SearchOptions): Promise<Lifelog[]> {
    const { searchTerm, fetchLimit = 20, ...listOptions } = options;
    logger.debug(`Searching for "${searchTerm}" in recent ${fetchLimit} lifelogs`);

    // Check search cache first
    const cacheKey = buildSearchCacheKey(searchTerm, options);
    const cached = searchCache.get(cacheKey);
    if (cached) {
      logger.debug(`Search results for "${searchTerm}" retrieved from cache`);
      return cached;
    }

    // First fetch recent lifelogs
    const recentLogs = await this.listRecentLifelogs({
      ...listOptions,
      limit: fetchLimit,
      includeMarkdown: true,
    });

    // Search within the fetched logs
    const searchLower = searchTerm.toLowerCase();
    const results = recentLogs.filter((log) => {
      const titleMatch = log.title?.toLowerCase().includes(searchLower);
      const markdownMatch = log.markdown?.toLowerCase().includes(searchLower);

      // Search in contents
      const contentsMatch = log.contents?.some((content) =>
        content.content.toLowerCase().includes(searchLower)
      );

      return titleMatch || markdownMatch || contentsMatch;
    });

    // Apply limit if specified
    const finalResults = listOptions.limit ? results.slice(0, listOptions.limit) : results;

    // Cache the search results
    searchCache.set(cacheKey, finalResults);

    return finalResults;
  }

  private buildQueryParams(options: ListLifelogsOptions): URLSearchParams {
    const params = new URLSearchParams();

    if (options.timezone) params.append('timezone', options.timezone);
    if (options.direction) params.append('direction', options.direction);
    if (options.includeMarkdown !== undefined) {
      params.append('includeMarkdown', String(options.includeMarkdown));
    }
    if (options.includeHeadings !== undefined) {
      params.append('includeHeadings', String(options.includeHeadings));
    }

    return params;
  }

  private async fetchAllLifelogs(
    endpoint: string,
    params: URLSearchParams,
    limit?: number
  ): Promise<Lifelog[]> {
    const results: Lifelog[] = [];
    let nextCursor: string | undefined;
    const pageSize = 100; // API max page size

    do {
      if (nextCursor) {
        params.set('cursor', nextCursor);
      }
      params.set('limit', String(Math.min(pageSize, (limit || pageSize) - results.length)));

      const queryString = params.toString();
      const fullEndpoint = `${endpoint}${queryString ? `?${queryString}` : ''}`;

      const response = await this.makeRequest<LimitlessAPIResponse<Lifelog[]>>(fullEndpoint);

      if (response.error) {
        throw new LimitlessAPIError(response.error.message, undefined, response.error.code);
      }

      // Handle both array response and object with lifelogs array
      if (Array.isArray(response.data)) {
        results.push(...response.data);
      } else if (response.data && 'lifelogs' in response.data) {
        results.push(...(response.data as { lifelogs: Lifelog[] }).lifelogs);
      } else {
        throw new Error('Unexpected API response format');
      }
      nextCursor = response.pagination?.nextCursor;

      // Stop if we've reached the limit or there's no more data
      if ((limit && results.length >= limit) || !response.pagination?.hasMore) {
        break;
      }
    } while (nextCursor);

    return limit ? results.slice(0, limit) : results;
  }
}
