/**
 * Logger Utility
 * Structured logging with levels and context
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
	[key: string]: any;
}

class Logger {
	private level: LogLevel = 'info';
	private enabled: boolean = true;

	private levels: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	/**
	 * Set minimum log level
	 */
	setLevel(level: LogLevel) {
		this.level = level;
	}

	/**
	 * Enable or disable logging
	 */
	setEnabled(enabled: boolean) {
		this.enabled = enabled;
	}

	/**
	 * Check if level should be logged
	 */
	private shouldLog(level: LogLevel): boolean {
		return this.enabled && this.levels[level] >= this.levels[this.level];
	}

	/**
	 * Format log message with context
	 */
	private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
		const timestamp = new Date().toISOString();
		const levelUpper = level.toUpperCase().padEnd(5);

		let formatted = `[${timestamp}] ${levelUpper} ${message}`;

		if (context && Object.keys(context).length > 0) {
			formatted += ` ${JSON.stringify(context)}`;
		}

		return formatted;
	}

	/**
	 * Debug level logging (lowest priority)
	 */
	debug(message: string, context?: LogContext) {
		if (!this.shouldLog('debug')) return;
		console.log(this.formatMessage('debug', message, context));
	}

	/**
	 * Info level logging (general information)
	 */
	info(message: string, context?: LogContext) {
		if (!this.shouldLog('info')) return;
		console.log(this.formatMessage('info', message, context));
	}

	/**
	 * Warning level logging
	 */
	warn(message: string, context?: LogContext) {
		if (!this.shouldLog('warn')) return;
		console.warn(this.formatMessage('warn', message, context));
	}

	/**
	 * Error level logging (highest priority)
	 */
	error(message: string, error?: Error | unknown, context?: LogContext) {
		if (!this.shouldLog('error')) return;

		const errorContext = {
			...context,
			...(error instanceof Error && {
				error: error.message,
				stack: error.stack,
			}),
		};

		console.error(this.formatMessage('error', message, errorContext));
	}

	/**
	 * Create a child logger with preset context
	 */
	child(defaultContext: LogContext): ChildLogger {
		return new ChildLogger(this, defaultContext);
	}
}

/**
 * Child logger with preset context
 */
class ChildLogger {
	constructor(
		private parent: Logger,
		private defaultContext: LogContext
	) {}

	private mergeContext(context?: LogContext): LogContext {
		return { ...this.defaultContext, ...context };
	}

	debug(message: string, context?: LogContext) {
		this.parent.debug(message, this.mergeContext(context));
	}

	info(message: string, context?: LogContext) {
		this.parent.info(message, this.mergeContext(context));
	}

	warn(message: string, context?: LogContext) {
		this.parent.warn(message, this.mergeContext(context));
	}

	error(message: string, error?: Error | unknown, context?: LogContext) {
		this.parent.error(message, error, this.mergeContext(context));
	}
}

// Export singleton instance
export const logger = new Logger();

// Set log level from environment variable
const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
if (envLevel && ['debug', 'info', 'warn', 'error'].includes(envLevel)) {
	logger.setLevel(envLevel);
}
