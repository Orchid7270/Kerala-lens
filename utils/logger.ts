// Structured Logging Utility
// This prepares the app for Sentry/LogRocket integration

type LogLevel = 'info' | 'warn' | 'error';

interface LogContext {
  component?: string;
  action?: string;
  [key: string]: any;
}

class LoggerService {
  private isProduction = false; // Toggle this based on environment vars in real prod

  private formatMessage(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    return {
      timestamp,
      level,
      message,
      context,
      userAgent: navigator.userAgent,
    };
  }

  info(message: string, context?: LogContext) {
    const logData = this.formatMessage('info', message, context);
    console.log(`[INFO] ${message}`, context || '');
    // TODO: Send to analytics
  }

  warn(message: string, context?: LogContext) {
    const logData = this.formatMessage('warn', message, context);
    console.warn(`[WARN] ${message}`, context || '');
  }

  error(message: string, error?: any, context?: LogContext) {
    const logData = this.formatMessage('error', message, { ...context, error: error?.toString() });
    console.error(`[ERROR] ${message}`, error, context || '');
    
    // Placeholder for Sentry integration
    // if (window.Sentry) window.Sentry.captureException(error);
  }
}

export const Logger = new LoggerService();