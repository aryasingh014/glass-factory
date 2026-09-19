// ponytail: use native console methods directly without unnecessary serialization layers
export const logger = {
  info: (message: string, meta?: Record<string, any>) => {
    meta && Object.keys(meta).length ? console.log(`[INFO] ${message}`, meta) : console.log(`[INFO] ${message}`);
  },
  warn: (message: string, meta?: Record<string, any>) => {
    meta && Object.keys(meta).length ? console.warn(`[WARN] ${message}`, meta) : console.warn(`[WARN] ${message}`);
  },
  error: (message: string, meta?: Record<string, any>) => {
    meta && Object.keys(meta).length ? console.error(`[ERROR] ${message}`, meta) : console.error(`[ERROR] ${message}`);
  },
  debug: (message: string, meta?: Record<string, any>) => {
    meta && Object.keys(meta).length ? console.debug(`[DEBUG] ${message}`, meta) : console.debug(`[DEBUG] ${message}`);
  },
};

