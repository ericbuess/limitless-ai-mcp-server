export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(prefix: string = 'limitless-mcp', level: LogLevel = LogLevel.INFO) {
    this.prefix = prefix;
    this.level = this.getLogLevelFromEnv() || level;
  }

  private getLogLevelFromEnv(): LogLevel | null {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      return LogLevel[envLevel as keyof typeof LogLevel] as LogLevel;
    }
    return null;
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    return `[${timestamp}] [${this.prefix}] [${level}] ${message}${formattedArgs}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      process.stderr.write(this.formatMessage('DEBUG', message, ...args) + '\n');
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      process.stderr.write(this.formatMessage('INFO', message, ...args) + '\n');
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      process.stderr.write(this.formatMessage('WARN', message, ...args) + '\n');
    }
  }

  error(message: string, error?: Error | unknown, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      const errorDetails =
        error instanceof Error ? { message: error.message, stack: error.stack } : error;
      process.stderr.write(this.formatMessage('ERROR', message, errorDetails, ...args) + '\n');
    }
  }
}

export const logger = new Logger();
