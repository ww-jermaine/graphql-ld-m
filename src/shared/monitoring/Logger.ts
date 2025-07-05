/**
 * Log levels for the application
 */
export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: Error;
}

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole?: boolean;
  enableMetrics?: boolean;
  metricsEndpoint?: string;
}

/**
 * Application logger with metrics support
 */
export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private metrics: Map<string, number>;

  private constructor(config: Partial<LoggerConfig>) {
    this.config = {
      enableConsole: true,
      enableMetrics: false,
      minLevel: LogLevel.INFO,
      ...config
    };
    this.metrics = new Map();
  }

  /**
   * Get logger instance (singleton)
   */
  public static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config || {});
    } else if (config) {
      // Update config if provided
      Logger.instance.config = {
        ...Logger.instance.config,
        ...config
      };
    }
    return Logger.instance;
  }

  /**
   * Log a debug message
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Increment a metric counter
   */
  public incrementMetric(name: string, value = 1): void {
    if (!this.config.enableMetrics) return;

    const current = this.metrics.get(name) || 0;
    this.metrics.set(name, current + value);
  }

  /**
   * Get current metrics
   */
  public getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Reset metrics counters
   */
  public resetMetrics(): void {
    this.metrics.clear();
  }

  /**
   * Internal logging implementation
   */
  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (this.shouldLog(level)) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        context,
        error,
      };

      if (this.config.enableConsole) {
        this.writeToConsole(entry);
      }

      // Track error metrics
      if (level === LogLevel.ERROR) {
        this.incrementMetric('errors_total');
      }
    }
  }

  /**
   * Check if message should be logged based on minimum level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LogLevel);
    const minLevelIndex = levels.indexOf(this.config.minLevel);
    const currentLevelIndex = levels.indexOf(level);
    return currentLevelIndex >= minLevelIndex;
  }

  /**
   * Write log entry to console with formatting
   */
  private writeToConsole(entry: LogEntry): void {
    const { timestamp, level, message, context, error } = entry;
    
    let output = `${timestamp} [${level.toUpperCase()}] ${message}`;
    
    if (context) {
      try {
        const getCircularReplacer = () => {
          const seen = new WeakSet();
          return (_: string, value: any) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Circular]';
              }
              seen.add(value);
            }
            return value;
          };
        };
        output += `\nContext: ${JSON.stringify(context, getCircularReplacer(), 2)}`;
      } catch (e) {
        output += '\nContext: [Unable to stringify context]';
      }
    }
    
    if (error) {
      output += `\nError: ${error.message}`;
      if (error.stack) {
        output += `\n${error.stack}`;
      }
    }

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(output);
        break;
      case LogLevel.INFO:
        console.info(output);
        break;
      case LogLevel.WARN:
        console.warn(output);
        break;
      case LogLevel.ERROR:
        console.error(output);
        break;
    }
  }
} 