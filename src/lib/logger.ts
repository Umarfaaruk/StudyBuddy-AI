/**
 * Logger Utility for Development and Production
 * ==================================================
 * Provides centralized logging that can be controlled
 * per environment and component.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  isDev: boolean;
  enableTimers: boolean;
  enableTracing: boolean;
  prefix?: string;
}

class Logger {
  private config: LoggerConfig;
  private timers: Map<string, number> = new Map();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      isDev: import.meta.env.DEV,
      enableTimers: import.meta.env.DEV,
      enableTracing: import.meta.env.DEV,
      prefix: 'EduOnx',
      ...config,
    };
  }

  private formatMessage(level: LogLevel, message: string, prefix?: string): string {
    const timestamp = new Date().toISOString();
    const finalPrefix = prefix || this.config.prefix;
    return `[${timestamp}] [${level.toUpperCase()}] [${finalPrefix}] ${message}`;
  }

  /**
   * Development-only logging (stripped in production)
   */
  debug(message: string, data?: any, prefix?: string): void {
    if (!this.config.isDev) return;
    const formatted = this.formatMessage('debug', message, prefix);
    console.debug(formatted, data);
  }

  /**
   * General info logging
   */
  info(message: string, data?: any, prefix?: string): void {
    const formatted = this.formatMessage('info', message, prefix);
    console.log(formatted, data);
  }

  /**
   * Warning logging
   */
  warn(message: string, data?: any, prefix?: string): void {
    const formatted = this.formatMessage('warn', message, prefix);
    console.warn(formatted, data);
  }

  /**
   * Error logging
   */
  error(message: string, error?: any, prefix?: string): void {
    const formatted = this.formatMessage('error', message, prefix);
    console.error(formatted, error);
  }

  /**
   * Performance timing (dev-only)
   */
  startTimer(label: string): void {
    if (!this.config.enableTimers) return;
    this.timers.set(label, performance.now());
  }

  /**
   * End performance timing and log (dev-only)
   */
  endTimer(label: string, prefix?: string): number {
    if (!this.config.enableTimers) return 0;
    const start = this.timers.get(label);
    if (!start) {
      this.warn(`Timer "${label}" not started`, undefined, prefix);
      return 0;
    }

    const duration = performance.now() - start;
    this.debug(`⏱️ ${label}: ${duration.toFixed(2)}ms`, undefined, prefix);
    this.timers.delete(label);
    return duration;
  }

  /**
   * Trace execution (dev-only, production-safe no-op)
   */
  trace(message: string, data?: any, prefix?: string): void {
    if (!this.config.enableTracing) return;
    const stack = new Error().stack;
    this.debug(`📍 ${message}`, { data, stack }, prefix);
  }

  /**
   * Group related logs (dev-only)
   */
  group(label: string): void {
    if (!this.config.isDev) return;
    console.group(label);
  }

  /**
   * End log group (dev-only)
   */
  groupEnd(): void {
    if (!this.config.isDev) return;
    console.groupEnd();
  }
}

// Create default logger instance
export const logger = new Logger();

// Export for creating custom loggers
export { Logger, type LoggerConfig, type LogLevel };
