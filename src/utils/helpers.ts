import crypto from 'crypto';
import { config } from '../config';
import { logger } from './logger';

export class CryptoUtils {
  /**
   * Vérifie la signature HMAC de Shopify
   */
  public static verifyShopifyHmac(data: string, signature: string): boolean {
    try {
      const calculatedSignature = crypto
        .createHmac('sha256', config.shopify.apiSecret)
        .update(data)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(calculatedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Erreur lors de la vérification HMAC', { error, signature });
      return false;
    }
  }

  /**
   * Génère un état aléatoire pour OAuth
   */
  public static generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Hash sécurisé d'un token
   */
  public static hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

export class ValidationUtils {
  /**
   * Valide le format d'un shop Shopify
   */
  public static validateShopDomain(shop: string): boolean {
    const shopPattern = /^[a-zA-Z0-9\-]+\.myshopify\.com$/;
    return shopPattern.test(shop);
  }

  /**
   * Nettoie et normalise un nom de shop
   */
  public static normalizeShopDomain(shop: string): string {
    // Supprimer les protocoles
    shop = shop.replace(/^https?:\/\//, '');
    
    // Ajouter .myshopify.com si manquant
    if (!shop.endsWith('.myshopify.com')) {
      shop = `${shop}.myshopify.com`;
    }
    
    return shop.toLowerCase();
  }

  /**
   * Valide les paramètres OAuth
   */
  public static validateOAuthParams(params: {
    code?: string;
    shop?: string;
    state?: string;
    hmac?: string;
  }): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.code) errors.push('Code OAuth manquant');
    if (!params.shop) errors.push('Shop manquant');
    if (!params.state) errors.push('State manquant');
    if (!params.hmac) errors.push('HMAC manquant');

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

export class UrlUtils {
  /**
   * Construit l'URL d'autorisation OAuth Shopify
   */
  public static buildAuthUrl(shop: string, state: string): string {
    const params = new URLSearchParams({
      client_id: config.shopify.apiKey,
      scope: config.shopify.scopes,
      redirect_uri: config.shopify.redirectUri,
      state: state
    });

    return `https://${shop}/admin/oauth/authorize?${params.toString()}`;
  }

  /**
   * Construit une URL d'API Shopify
   */
  public static buildApiUrl(shop: string, endpoint: string): string {
    return `https://${shop}/admin/api/${config.shopify.apiVersion}/${endpoint}`;
  }
}
