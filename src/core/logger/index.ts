export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  context: string;
  message: string;
  data?: unknown;
}

export type LogListener = (entry: LogEntry) => void;

class LoggerService {
  private static instance: LoggerService;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private listeners: Set<LogListener> = new Set();
  private minLevel: LogLevel = 'DEBUG';

  private readonly levelWeights: Record<LogLevel, number> = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  };

  private constructor() {}

  public static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  public setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
  }

  private log(level: LogLevel, context: string, message: string, data?: unknown): void {
    if (this.levelWeights[level] < this.levelWeights[this.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: Date.now(),
      level,
      context,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Format for development console
    const timeStr = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = `[${timeStr}] [${level}] [${context}]:`;

    switch (level) {
      case 'DEBUG':
        console.debug(prefix, message, data !== undefined ? data : '');
        break;
      case 'INFO':
        console.info(prefix, message, data !== undefined ? data : '');
        break;
      case 'WARN':
        console.warn(prefix, message, data !== undefined ? data : '');
        break;
      case 'ERROR':
        console.error(prefix, message, data !== undefined ? data : '');
        break;
    }

    // Notify listeners
    this.listeners.forEach((listener) => {
      try {
        listener(entry);
      } catch (err) {
        console.error('Error in log listener:', err);
      }
    });
  }

  public debug(context: string, message: string, data?: unknown): void {
    this.log('DEBUG', context, message, data);
  }

  public info(context: string, message: string, data?: unknown): void {
    this.log('INFO', context, message, data);
  }

  public warn(context: string, message: string, data?: unknown): void {
    this.log('WARN', context, message, data);
  }

  public error(context: string, message: string, data?: unknown): void {
    this.log('ERROR', context, message, data);
  }
}

export const Logger = LoggerService.getInstance();
