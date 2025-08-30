import winston from 'winston';
import path from 'path';

// Logger spécifique pour les mises à jour Shopify
export const shopifyLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta, null, 0)}` : '';
      return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(__dirname, '../../logs/shopify-updates.log'),
      maxsize: 10000000, // 10MB
      maxFiles: 5
    }),
    // Aussi dans la console en mode dev
    ...(process.env.NODE_ENV === 'development' ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

// Fonctions utilitaires pour des logs concis mais détaillés
export const shopifyLog = {
  syncStart: (sku: string, productId: string) => 
    shopifyLogger.info(`🔄 SYNC START`, { sku, productId }),

  productFound: (sku: string, name: string, variants: number, stock: number) =>
    shopifyLogger.info(`📦 KIMLAND FOUND`, { sku, name, variants, stock }),

  shopifyProduct: (productId: string, title: string, existingVariants: number) =>
    shopifyLogger.info(`🏪 SHOPIFY PRODUCT`, { productId, title, existingVariants }),

  variantUpdate: (variantId: string, size: string, oldStock: number, newStock: number) =>
    shopifyLogger.info(`📊 STOCK UPDATE`, { variantId, size, oldStock, newStock }),

  variantCreate: (productId: string, size: string, stock: number) =>
    shopifyLogger.info(`➕ VARIANT CREATE`, { productId, size, stock }),

  variantSkip: (size: string, reason: string) =>
    shopifyLogger.info(`⏭️ VARIANT SKIP`, { size, reason }),

  // Logs détaillés pour les requêtes API
  apiRequest: (method: string, url: string, data?: any) => {
    const logData: any = { method, url };
    if (data) {
      logData.payload = typeof data === 'object' ? JSON.stringify(data).substring(0, 200) : data;
    }
    shopifyLogger.info(`📤 API REQUEST`, logData);
  },

  apiResponse: (method: string, url: string, status: number, success: boolean, data?: any) => {
    const logData: any = { method, url, status, success };
    if (data) {
      logData.response = typeof data === 'object' ? JSON.stringify(data).substring(0, 300) : data;
    }
    shopifyLogger.info(`📥 API RESPONSE`, logData);
  },

  apiError: (method: string, url: string, error: any) => {
    const logData: any = { method, url };
    if (error.response) {
      logData.status = error.response.status;
      logData.statusText = error.response.statusText;
      logData.errorData = JSON.stringify(error.response.data).substring(0, 300);
    }
    logData.message = error.message;
    shopifyLogger.error(`❌ API ERROR`, logData);
  },

  skuUpdate: (variantId: string, oldSku: string, newSku: string, success: boolean) => {
    shopifyLogger.info(`🏷️ SKU UPDATE`, { variantId, oldSku, newSku, success });
  },

  inventorySuccess: (variantId: string, quantity: number) =>
    shopifyLogger.info(`✅ INVENTORY OK`, { variantId, quantity }),

  inventoryError: (variantId: string, error: string) =>
    shopifyLogger.error(`❌ INVENTORY FAIL`, { variantId, error }),

  debug: (operation: string, details: any) => {
    shopifyLogger.info(`🐛 DEBUG ${operation}`, details);
  },

  syncComplete: (sku: string, updates: number, creates: number, errors: number) =>
    shopifyLogger.info(`🏁 SYNC COMPLETE`, { sku, updates, creates, errors }),

  syncError: (sku: string, error: string) =>
    shopifyLogger.error(`💥 SYNC ERROR`, { sku, error })
};
