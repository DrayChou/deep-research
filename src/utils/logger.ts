/**
 * 日志工具类 - 提供结构化的日志记录功能
 * 支持浏览器和Node.js环境
 */

// 环境检测 - 兼容Edge Runtime
const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

// Edge Runtime 兼容的Node.js检测
let isNode = false;
try {
  isNode = !isBrowser && 
           typeof process !== 'undefined' && 
           typeof globalThis.process !== 'undefined' &&
           'versions' in process &&
           'node' in (process.versions || {});
} catch {
  // Edge Runtime 或其他受限环境
  isNode = false;
}

// 浏览器环境下的额外功能
interface BrowserStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const browserStorage: BrowserStorage = {
  getItem: function (key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: function (key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 静默失败
    }
  },
  removeItem: function (key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // 静默失败
    }
  }
};

class Logger {
  private static instance: Logger;
  private context: string = '';
  private logLevel: string;
  private enableStorage: boolean;

  constructor(options: {
    logLevel?: string;
    enableStorage?: boolean;
    context?: string;
  } = {}) {
    this.context = options.context || '';
    this.logLevel = options.logLevel || (isBrowser ? 'INFO' : 'DEBUG');
    this.enableStorage = options.enableStorage || false;
  }

  static getInstance(context?: string): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    if (context) {
      Logger.instance.context = context;
    }
    return Logger.instance;
  }

  shouldLog(level: string): boolean {
    const levels: { [key: string]: number } = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    return levels[level] >= levels[this.logLevel];
  }

  formatMessage(level: string, message: string, data?: any, allowFullData: boolean = false): string {
    const timestamp = new Date().toISOString();
    const contextPrefix = this.context ? `[${this.context}]` : '';
    const envPrefix = isBrowser ? '[Browser]' : '[Node]';
    
    let dataStr = '';
    if (data) {
      const jsonStr = JSON.stringify(data);
      // 对于重要的日志（如错误、质量检查失败），允许输出完整数据
      if (allowFullData || level === 'ERROR') {
        dataStr = ` | Data: ${jsonStr}`;
      } else {
        dataStr = ` | Data: ${jsonStr.substring(0, 500)}${jsonStr.length > 500 ? '... (truncated)' : ''}`;
      }
    }
    
    return `${timestamp} [${level}]${envPrefix}${contextPrefix} ${message}${dataStr}`;
  }

  truncateData(data: any, maxLength: number = 500): any {
    if (typeof data === 'string') {
      return data.length > maxLength ? data.substring(0, maxLength) + '...' : data;
    }
    if (typeof data === 'object' && data !== null) {
      const truncated: { [key: string]: any } = {};
      for (const [key, value] of Object.entries(data)) {
        truncated[key] = this.truncateData(value, maxLength);
      }
      return truncated;
    }
    return data;
  }

  writeToStorage(level: string, message: string, data?: any): void {
    if (!this.enableStorage || !isBrowser) return;

    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        level,
        context: this.context,
        message,
        data: this.truncateData(data),
        env: isBrowser ? 'browser' : 'node'
      };

      const key = `deep-research-logs-${new Date().toDateString()}`;
      const existingLogs = JSON.parse(browserStorage.getItem(key) || '[]');
      existingLogs.push(logEntry);

      // 只保留最近1000条日志
      if (existingLogs.length > 1000) {
        existingLogs.splice(0, existingLogs.length - 1000);
      }

      browserStorage.setItem(key, JSON.stringify(existingLogs));
    } catch {
      // 静默失败，避免影响主要功能
    }
  }

  debug(message: string, data?: any, allowFullData: boolean = false): void {
    if (!this.shouldLog('DEBUG')) return;

    const formattedMessage = this.formatMessage('DEBUG', message, allowFullData ? data : this.truncateData(data), allowFullData);

    if (isBrowser) {
      console.debug(formattedMessage);
    } else {
      console.log(formattedMessage);
    }

    this.writeToStorage('DEBUG', message, data);
  }

  info(message: string, data?: any, allowFullData: boolean = false): void {
    if (!this.shouldLog('INFO')) return;

    const formattedMessage = this.formatMessage('INFO', message, allowFullData ? data : this.truncateData(data), allowFullData);
    console.log(formattedMessage);
    this.writeToStorage('INFO', message, data);
  }

  warn(message: string, data?: any, allowFullData: boolean = false): void {
    if (!this.shouldLog('WARN')) return;

    const formattedMessage = this.formatMessage('WARN', message, allowFullData ? data : this.truncateData(data), allowFullData);
    console.warn(formattedMessage);
    this.writeToStorage('WARN', message, data);
  }

  error(message: string, error?: Error, data?: any, allowFullData: boolean = true): void {
    if (!this.shouldLog('ERROR')) return;

    const errorData = error ? {
      message: error.message,
      stack: error.stack,
      name: error.name,
      ...data
    } : data;

    // 错误日志默认允许完整输出
    const formattedMessage = this.formatMessage('ERROR', message, errorData, allowFullData);
    console.error(formattedMessage);
    this.writeToStorage('ERROR', message, errorData);
  }

  logLLMCall(action: string, config: any, input?: any, output?: any, duration?: number): void {
    if (!this.shouldLog('INFO')) return;

    this.info(`LLM Call: ${action}`, {
      config: this.truncateData(config, 200),
      input: input ? {
        length: typeof input === 'string' ? input.length : 'object',
        preview: typeof input === 'string' ? input.substring(0, 200) : 'object'
      } : undefined,
      output: output ? {
        length: typeof output === 'string' ? output.length : 'object',
        preview: typeof output === 'string' ? output.substring(0, 200) : 'object'
      } : undefined,
      duration
    });
  }

  logStep(step: string, status: string, data?: any): void {
    if (!this.shouldLog('INFO')) return;

    this.info(`Step: ${step} - ${status}`, data);
  }

  setContext(context: string): void {
    this.context = context;
  }

  setLogLevel(level: string): void {
    this.logLevel = level;
  }

  enableLocalStorage(enable: boolean): void {
    this.enableStorage = enable;
  }

  // 浏览器环境下的额外方法
  getStoredLogs(date?: string): any[] {
    if (!isBrowser) return [];

    try {
      const key = date ? `deep-research-logs-${date}` : `deep-research-logs-${new Date().toDateString()}`;
      return JSON.parse(browserStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  }

  clearStoredLogs(date?: string): void {
    if (!isBrowser) return;

    try {
      const key = date ? `deep-research-logs-${date}` : `deep-research-logs-${new Date().toDateString()}`;
      browserStorage.removeItem(key);
    } catch {
      // 静默失败
    }
  }

  exportLogs(): string {
    if (!isBrowser) return '';

    try {
      const logs = this.getStoredLogs(new Date().toDateString());
      return JSON.stringify(logs, null, 2);
    } catch {
      return '';
    }
  }
}

// 创建默认实例
const defaultLogger = Logger.getInstance();

// 导出Logger类和实例，同时提供向后兼容的接口
export const logger = {
  ...defaultLogger,
  getInstance: (context?: string) => Logger.getInstance(context)
};

export { Logger };

// 浏览器环境下的全局访问
if (isBrowser) {
  (window as any).DeepResearchLogger = Logger;
}

// Node.js环境下的全局访问
if (isNode) {
  (globalThis as any).DeepResearchLogger = { Logger, logger };
}