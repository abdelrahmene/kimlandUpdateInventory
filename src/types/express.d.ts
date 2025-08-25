/**
 * Types pour les sessions Express avec données Shopify
 */
declare module 'express-session' {
  interface SessionData {
    oauthState?: string;
    shop?: string;
    accessToken?: string;
  }
}

/**
 * Extension de l'objet Request d'Express
 */
declare global {
  namespace Express {
    interface Request {
      oauth?: {
        code: string;
        shop: string;
        state: string;
        hmac: string;
        timestamp?: string;
      };
      shopData?: Promise<{
        id: string;
        name: string;
        domain: string;
        myshopifyDomain: string;
        accessToken: string;
        email: string;
        country: string;
        currency: string;
        planName: string;
        installedAt: Date;
        isActive: boolean;
      }>;
    }
  }
}