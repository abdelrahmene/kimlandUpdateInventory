import { ShopData } from '../types';
import { logger } from '../utils/logger';

/**
 * Stockage en mémoire temporaire (remplace Firebase pour le développement)
 */
export class MemoryStorageService {
  private static instance: MemoryStorageService;
  private shops: Map<string, ShopData> = new Map();
  
  private constructor() {
    logger.info('🧠 Service de stockage mémoire initialisé');
  }

  public static getInstance(): MemoryStorageService {
    if (!MemoryStorageService.instance) {
      MemoryStorageService.instance = new MemoryStorageService();
    }
    return MemoryStorageService.instance;
  }

  /**
   * Sauvegarde les données d'une boutique
   */
  public async saveShopData(shopData: ShopData): Promise<void> {
    this.shops.set(shopData.shop, {
      ...shopData,
      updatedAt: new Date()
    });
    
    logger.info('💾 Données boutique sauvegardées (mémoire)', { 
      shop: shopData.shop,
      name: shopData.name 
    });
  }

  /**
   * Récupère les données d'une boutique
   */
  public async getShopData(shop: string): Promise<ShopData | null> {
    const data = this.shops.get(shop);
    return data || null;
  }

  /**
   * Récupère l'access token d'une boutique
   */
  public async getShopToken(shop: string): Promise<string | null> {
    const data = this.shops.get(shop);
    return data?.accessToken || null;
  }

  /**
   * Vérifie si une boutique est connectée
   */
  public async isShopConnected(shop: string): Promise<boolean> {
    return this.shops.has(shop);
  }

  /**
   * Supprime les données d'une boutique
   */
  public async deleteShopData(shop: string): Promise<void> {
    this.shops.delete(shop);
    logger.info('🗑️ Données boutique supprimées (mémoire)', { shop });
  }

  /**
   * Liste toutes les boutiques connectées
   */
  public getConnectedShops(): string[] {
    return Array.from(this.shops.keys());
  }

  /**
   * Vide le token d'une boutique (force réauth)
   */
  public async clearShopToken(shop: string): Promise<void> {
    const data = this.shops.get(shop);
    if (data) {
      data.accessToken = '';
      this.shops.set(shop, data);
      logger.info('🔄 Token vidé (mémoire)', { shop });
    }
  }

  /**
   * Stats du stockage
   */
  public getStats() {
    return {
      totalShops: this.shops.size,
      shops: this.getConnectedShops()
    };
  }
}

export const memoryStorage = MemoryStorageService.getInstance();
