import { Lifelog } from '../types/limitless';

interface FormatOptions {
  includeMarkdown?: boolean;
  includeHeadings?: boolean;
}

export function formatLifelogResponse(
  lifelogs: Lifelog[],
  options: FormatOptions,
  searchTerm?: string
): string {
  if (lifelogs.length === 0) {
    return searchTerm ? `No lifelogs found matching "${searchTerm}"` : 'No lifelogs found';
  }

  const header = searchTerm
    ? `Found ${lifelogs.length} lifelog${lifelogs.length === 1 ? '' : 's'} matching "${searchTerm}":\n\n`
    : `Found ${lifelogs.length} lifelog${lifelogs.length === 1 ? '' : 's'}:\n\n`;

  const formattedLogs = lifelogs.map((log) => formatSingleLifelog(log, options)).join('\n---\n\n');

  return header + formattedLogs;
}

function formatSingleLifelog(log: Lifelog, options: FormatOptions): string {
  const parts: string[] = [];

  // Basic info
  parts.push(`ID: ${log.id}`);
  parts.push(`Title: ${log.title || 'Untitled'}`);
  parts.push(`Date: ${log.date}`);

  if (log.createdAt) {
    parts.push(`Created: ${formatDateTime(log.createdAt)}`);
  }

  if (log.duration) {
    parts.push(`Duration: ${formatDuration(log.duration)}`);
  }

  if (log.tags && log.tags.length > 0) {
    parts.push(`Tags: ${log.tags.join(', ')}`);
  }

  // Summary
  if (log.summary) {
    parts.push(`\nSummary:\n${log.summary}`);
  }

  // Headings
  if (options.includeHeadings && log.headings && log.headings.length > 0) {
    parts.push(`\nHeadings:`);
    log.headings.forEach((heading, index) => {
      parts.push(`  ${index + 1}. ${heading}`);
    });
  }

  // Content/Markdown
  if (options.includeMarkdown && log.markdown) {
    parts.push(`\nContent:\n${log.markdown}`);
  } else if (log.content) {
    parts.push(`\nContent:\n${log.content}`);
  }

  return parts.join('\n');
}

function formatDateTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return dateString;
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}
