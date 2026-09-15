import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface ChildLogger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

const LEVEL_RANK: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevelRank: number | null = null;

function getMinLevelRank(): number {
  if (minLevelRank === null) {
    const fromEnv = process.env.LOG_LEVEL as LogLevel | undefined;
    if (fromEnv && fromEnv in LEVEL_RANK) {
      minLevelRank = LEVEL_RANK[fromEnv];
    } else {
      let packaged = false;
      try {
        packaged = app.isPackaged === true;
      } catch {
        packaged = false;
      }
      minLevelRank = packaged ? LEVEL_RANK.info : LEVEL_RANK.debug;
    }
  }
  return minLevelRank;
}

const MAX_LINE_CHARS = 32 * 1024;
let currentStream: fs.WriteStream | null = null;
let currentStreamDate: string | null = null;

function getLogsDir(): string {
  try {
    return path.join(app.getPath('userData'), 'logs');
  } catch {
    return path.join(process.cwd(), 'logs');
  }
}

function getStream(date: string): fs.WriteStream {
  if (currentStream && currentStreamDate === date) {
    return currentStream;
  }
  currentStream?.end();

  const dir = getLogsDir();
  fs.mkdirSync(dir, { recursive: true });
  currentStream = fs.createWriteStream(path.join(dir, `${date}.ndjson`), { flags: 'a' });
  currentStreamDate = date;
  return currentStream;
}

function write(record: LogRecord): void {
  let line = JSON.stringify(record);
  if (line.length > MAX_LINE_CHARS) {
    line = JSON.stringify({
      timestamp: record.timestamp,
      level: record.level,
      module: record.module,
      message: record.message,
      context: {
        truncated: true,
        originalChars: line.length,
        preview: line.slice(0, 2048),
      },
    });
  }
  try {
    getStream(record.timestamp.slice(0, 10)).write(`${line}\n`);
  } catch {
    // best-effort
  }
  if (process.env.NODE_ENV !== 'production') {
    const tag = `[${record.module}]`;
    if (record.level === 'error') {
      console.error(tag, record.message, record.context ?? '');
    } else if (record.level === 'warn') {
      console.warn(tag, record.message, record.context ?? '');
    } else {
      console.log(tag, record.message, record.context ?? '');
    }
  }
}

function log(
  moduleName: string,
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (LEVEL_RANK[level] < getMinLevelRank()) {
    return;
  }
  write({
    timestamp: new Date().toISOString(),
    level,
    module: moduleName,
    message,
    ...(context ? { context } : {}),
  });
}

export const Logger = {
  createChildLogger(moduleName: string): ChildLogger {
    return {
      debug: (message, context) => log(moduleName, 'debug', message, context),
      info: (message, context) => log(moduleName, 'info', message, context),
      warn: (message, context) => log(moduleName, 'warn', message, context),
      error: (message, context) => log(moduleName, 'error', message, context),
    };
  },
};
