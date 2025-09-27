export class Logger {
  constructor(private component: string) {}

  private formatMessage(level: string, ...args: any[]): string {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    return `[${timestamp}] [${level}] [${this.component}] ${message}`;
  }

  info(...args: any[]): void {
    console.log(this.formatMessage('INFO', ...args));
  }

  error(...args: any[]): void {
    console.error(this.formatMessage('ERROR', ...args));
  }

  warn(...args: any[]): void {
    console.warn(this.formatMessage('WARN', ...args));
  }

  debug(...args: any[]): void {
    if (process.env.DEBUG?.includes('fusion:') || process.env.NODE_ENV === 'development') {
      console.log(this.formatMessage('DEBUG', ...args));
    }
  }
}