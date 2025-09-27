export class Logger {
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] [${this.serviceName}] ${message}`;
    
    if (data) {
      return `${formattedMessage} ${JSON.stringify(data)}`;
    }
    
    return formattedMessage;
  }

  info(message: string, data?: any): void {
    console.log(this.formatMessage('INFO', message, data));
  }

  error(message: string, error?: any): void {
    console.error(this.formatMessage('ERROR', message, error));
  }

  warn(message: string, data?: any): void {
    console.warn(this.formatMessage('WARN', message, data));
  }

  debug(message: string, data?: any): void {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(this.formatMessage('DEBUG', message, data));
    }
  }
}