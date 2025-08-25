import fs from 'fs';
import path from 'path';

export class Logger {
  private static instance: Logger;
  private logFile: string;

  private constructor(logFile: string = 'logs/app.log') {
    this.logFile = logFile;
    this.ensureLogDirectory();
  }

  public static getInstance(logFile?: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(logFile);
    }
    return Logger.instance;
  }

  private ensureLogDirectory(): void {
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  private formatMessage(level: string, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` - ${JSON.stringify(data, null, 2)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}\n`;
  }

  private writeLog(level: string, message: string, data?: any): void {
    const formattedMessage = this.formatMessage(level, message, data);
    
    // Affichage console
    console.log(formattedMessage.trim());
    
    // Écriture fichier
    fs.appendFileSync(this.logFile, formattedMessage);
  }

  public info(message: string, data?: any): void {
    this.writeLog('info', message, data);
  }

  public error(message: string, data?: any): void {
    this.writeLog('error', message, data);
  }

  public warn(message: string, data?: any): void {
    this.writeLog('warn', message, data);
  }

  public debug(message: string, data?: any): void {
    if (process.env.NODE_ENV !== 'production') {
      this.writeLog('debug', message, data);
    }
  }
}

export const logger = Logger.getInstance();
