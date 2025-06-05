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

export function convertUTCTimestampsToLocal(content: string): string {
  // Pattern to match timestamps like "(6/4/25 7:37 PM)"
  const timestampPattern = /\((\d{1,2}\/\d{1,2}\/\d{2,4}\s+\d{1,2}:\d{2}\s+[AP]M)\)/g;

  return content.replace(timestampPattern, (match, timestamp) => {
    try {
      // Parse the timestamp assuming it's UTC
      const [datePart, timePart, ampm] = timestamp.split(/\s+/);
      const [month, day, year] = datePart.split('/');
      const [hours, minutes] = timePart.split(':');

      // Convert to full year if needed
      const fullYear = year.length === 2 ? `20${year}` : year;

      // Convert 12-hour to 24-hour format
      let hour24 = parseInt(hours);
      if (ampm === 'PM' && hour24 !== 12) hour24 += 12;
      if (ampm === 'AM' && hour24 === 12) hour24 = 0;

      // Create UTC date
      const utcDate = new Date(
        Date.UTC(parseInt(fullYear), parseInt(month) - 1, parseInt(day), hour24, parseInt(minutes))
      );

      // Format to local time
      const localTime = utcDate.toLocaleString('en-US', {
        timeZone: 'America/Chicago',
        month: 'numeric',
        day: 'numeric',
        year: '2-digit',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      return `(${localTime})`;
    } catch {
      // If parsing fails, return original
      return match;
    }
  });
}
