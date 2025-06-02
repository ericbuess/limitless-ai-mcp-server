export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  return d.toISOString().split('T')[0];
}

export function parseDate(dateStr: string): Date {
  const date = new Date(dateStr);

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }

  return date;
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${date}`);
  }

  return d.toISOString();
}

export function isValidDateFormat(dateStr: string): boolean {
  // Check YYYY-MM-DD format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateStr)) {
    return false;
  }

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

export function isValidDateTimeFormat(dateTimeStr: string): boolean {
  // Check YYYY-MM-DD HH:mm:SS format
  const dateTimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

  if (!dateTimeRegex.test(dateTimeStr) && !isoRegex.test(dateTimeStr)) {
    return false;
  }

  const date = new Date(dateTimeStr);
  return !isNaN(date.getTime());
}
