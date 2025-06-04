import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import type { Phase2Lifelog } from '../types/phase2.js';

export interface LifelogMetadata {
  id: string;
  date: string;
  duration: number;
  createdAt: string;
  keywords?: string[];
  embedding?: number[];
  summary?: string;
  actionItems?: string[];
}

export interface StorageOptions {
  baseDir: string;
  enableEmbeddings: boolean;
  enableMetadata: boolean;
}

export class FileManager {
  private readonly baseDir: string;
  private readonly lifelogsDir: string;
  private readonly embeddingsDir: string;
  private readonly indexesDir: string;
  private readonly enableEmbeddings: boolean;
  private readonly enableMetadata: boolean;

  constructor(options: StorageOptions) {
    this.baseDir = options.baseDir || path.join(process.cwd(), 'data');
    this.lifelogsDir = path.join(this.baseDir, 'lifelogs');
    this.embeddingsDir = path.join(this.baseDir, 'embeddings');
    this.indexesDir = path.join(this.baseDir, 'indexes');
    this.enableEmbeddings = options.enableEmbeddings ?? true;
    this.enableMetadata = options.enableMetadata ?? true;
  }

  async initialize(): Promise<void> {
    logger.info('Initializing file storage', { baseDir: this.baseDir });

    await fs.mkdir(this.lifelogsDir, { recursive: true });
    await fs.mkdir(this.embeddingsDir, { recursive: true });
    await fs.mkdir(this.indexesDir, { recursive: true });

    logger.info('File storage initialized');
  }

  private getDatePath(date: Date): { year: string; month: string; day: string } {
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return { year, month, day };
  }

  private async ensureDateDirectory(date: Date, type: 'lifelogs' | 'embeddings'): Promise<string> {
    const { year, month, day } = this.getDatePath(date);
    const baseDir = type === 'lifelogs' ? this.lifelogsDir : this.embeddingsDir;
    const dirPath = path.join(baseDir, year, month, day);

    await fs.mkdir(dirPath, { recursive: true });
    return dirPath;
  }

  async saveLifelog(lifelog: Phase2Lifelog): Promise<void> {
    const date = new Date(lifelog.createdAt);
    const dirPath = await this.ensureDateDirectory(date, 'lifelogs');

    // Save markdown content
    const mdPath = path.join(dirPath, `${lifelog.id}.md`);
    const content = this.formatLifelogAsMarkdown(lifelog);
    await fs.writeFile(mdPath, content, 'utf8');

    // Save metadata if enabled
    if (this.enableMetadata) {
      const metaPath = path.join(dirPath, `${lifelog.id}.meta.json`);
      const metadata: LifelogMetadata = {
        id: lifelog.id,
        date: lifelog.createdAt,
        duration: lifelog.duration,
        createdAt: lifelog.createdAt,
        keywords: this.extractKeywords(lifelog.content),
      };
      await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
    }

    logger.debug('Saved lifelog', { id: lifelog.id, date: date.toISOString() });
  }

  async loadLifelog(id: string, date: Date): Promise<Phase2Lifelog | null> {
    try {
      const { year, month, day } = this.getDatePath(date);
      const mdPath = path.join(this.lifelogsDir, year, month, day, `${id}.md`);

      const content = await fs.readFile(mdPath, 'utf8');
      const metaPath = path.join(this.lifelogsDir, year, month, day, `${id}.meta.json`);

      let metadata: LifelogMetadata | null = null;
      if (this.enableMetadata) {
        try {
          const metaContent = await fs.readFile(metaPath, 'utf8');
          metadata = JSON.parse(metaContent);
        } catch (error) {
          logger.debug('No metadata found for lifelog', { id });
        }
      }

      return this.parseMarkdownToLifelog(content, metadata);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveEmbedding(id: string, date: Date, embedding: number[]): Promise<void> {
    if (!this.enableEmbeddings) return;

    const dirPath = await this.ensureDateDirectory(date, 'embeddings');
    const embPath = path.join(dirPath, `${id}.json`);

    await fs.writeFile(embPath, JSON.stringify({ id, embedding }), 'utf8');
    logger.debug('Saved embedding', { id, dimensions: embedding.length });
  }

  async loadEmbedding(id: string, date: Date): Promise<number[] | null> {
    if (!this.enableEmbeddings) return null;

    try {
      const { year, month, day } = this.getDatePath(date);
      const embPath = path.join(this.embeddingsDir, year, month, day, `${id}.json`);

      const content = await fs.readFile(embPath, 'utf8');
      const data = JSON.parse(content);
      return data.embedding;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async listLifelogsByDate(date: Date): Promise<string[]> {
    const { year, month, day } = this.getDatePath(date);
    const dirPath = path.join(this.lifelogsDir, year, month, day);

    try {
      const files = await fs.readdir(dirPath);
      return files.filter((f) => f.endsWith('.md')).map((f) => f.replace('.md', ''));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async listLifelogsByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ id: string; date: Date }>> {
    const results: Array<{ id: string; date: Date }> = [];

    const current = new Date(startDate);
    while (current <= endDate) {
      const ids = await this.listLifelogsByDate(current);
      for (const id of ids) {
        results.push({ id, date: new Date(current) });
      }
      current.setDate(current.getDate() + 1);
    }

    return results;
  }

  async getStorageStats(): Promise<{
    totalLifelogs: number;
    totalEmbeddings: number;
    sizeInBytes: number;
    dateRange: { start: Date | null; end: Date | null };
  }> {
    let totalLifelogs = 0;
    let totalEmbeddings = 0;
    let sizeInBytes = 0;
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    const countFiles = async (dir: string, extension: string): Promise<number> => {
      let count = 0;
      try {
        const years = await fs.readdir(dir);
        for (const year of years) {
          const yearPath = path.join(dir, year);
          const months = await fs.readdir(yearPath);
          for (const month of months) {
            const monthPath = path.join(yearPath, month);
            const days = await fs.readdir(monthPath);
            for (const day of days) {
              const dayPath = path.join(monthPath, day);
              const files = await fs.readdir(dayPath);
              const matchingFiles = files.filter((f) => f.endsWith(extension));
              count += matchingFiles.length;

              if (matchingFiles.length > 0) {
                const date = new Date(`${year}-${month}-${day}`);
                if (!earliestDate || date < earliestDate) earliestDate = date;
                if (!latestDate || date > latestDate) latestDate = date;
              }

              for (const file of matchingFiles) {
                const stats = await fs.stat(path.join(dayPath, file));
                sizeInBytes += stats.size;
              }
            }
          }
        }
      } catch (error) {
        logger.debug('Error counting files', { dir, error });
      }
      return count;
    };

    totalLifelogs = await countFiles(this.lifelogsDir, '.md');
    if (this.enableEmbeddings) {
      totalEmbeddings = await countFiles(this.embeddingsDir, '.json');
    }

    return {
      totalLifelogs,
      totalEmbeddings,
      sizeInBytes,
      dateRange: { start: earliestDate, end: latestDate },
    };
  }

  private formatLifelogAsMarkdown(lifelog: Phase2Lifelog): string {
    const lines = [
      `# Lifelog: ${lifelog.title}`,
      '',
      `**ID:** ${lifelog.id}`,
      `**Date:** ${new Date(lifelog.createdAt).toLocaleString()}`,
      `**Duration:** ${Math.floor(lifelog.duration / 60)} minutes`,
      '',
      '---',
      '',
      lifelog.content,
    ];

    if (lifelog.headings && lifelog.headings.length > 0) {
      lines.push('', '## Headings', '');
      for (const heading of lifelog.headings) {
        lines.push(`- ${heading}`);
      }
    }

    return lines.join('\n');
  }

  private parseMarkdownToLifelog(content: string, metadata: LifelogMetadata | null): Phase2Lifelog {
    const lines = content.split('\n');
    const title = lines[0].replace('# Lifelog: ', '').trim();

    // Extract metadata from markdown
    const idMatch = content.match(/\*\*ID:\*\* (.+)/);
    const dateMatch = content.match(/\*\*Date:\*\* (.+)/);
    const durationMatch = content.match(/\*\*Duration:\*\* (\d+) minutes/);

    const id = idMatch ? idMatch[1] : metadata?.id || 'unknown';
    const createdAt = dateMatch
      ? new Date(dateMatch[1]).toISOString()
      : metadata?.date || new Date().toISOString();
    const duration = durationMatch ? parseInt(durationMatch[1]) * 60 : metadata?.duration || 0;

    // Extract content (everything after the --- separator)
    const contentStart = lines.findIndex((line) => line === '---') + 2;
    const headingsStart = lines.findIndex((line) => line === '## Headings');

    let mainContent = '';
    let headings: string[] = [];

    if (headingsStart > -1) {
      mainContent = lines.slice(contentStart, headingsStart).join('\n').trim();
      const headingLines = lines.slice(headingsStart + 2);
      headings = headingLines
        .filter((line) => line.startsWith('- '))
        .map((line) => line.substring(2));
    } else {
      mainContent = lines.slice(contentStart).join('\n').trim();
    }

    return {
      id,
      title,
      content: mainContent,
      createdAt,
      duration,
      headings,
      startTime: createdAt,
      endTime: new Date(new Date(createdAt).getTime() + duration * 1000).toISOString(),
    };
  }

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - can be enhanced later
    const words = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 4);

    const wordFreq = new Map<string, number>();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }

    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word]) => word);
  }

  async cleanup(daysToKeep: number = 30): Promise<{ deleted: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let deleted = 0;

    const cleanupDir = async (baseDir: string) => {
      try {
        const years = await fs.readdir(baseDir);
        for (const year of years) {
          const yearPath = path.join(baseDir, year);
          const months = await fs.readdir(yearPath);
          for (const month of months) {
            const monthPath = path.join(yearPath, month);
            const days = await fs.readdir(monthPath);
            for (const day of days) {
              const date = new Date(`${year}-${month}-${day}`);
              if (date < cutoffDate) {
                const dayPath = path.join(monthPath, day);
                await fs.rm(dayPath, { recursive: true });
                deleted++;
                logger.debug('Cleaned up old data', { date: date.toISOString() });
              }
            }
          }
        }
      } catch (error) {
        logger.error('Cleanup error', { error });
      }
    };

    await cleanupDir(this.lifelogsDir);
    if (this.enableEmbeddings) {
      await cleanupDir(this.embeddingsDir);
    }

    return { deleted };
  }
}
