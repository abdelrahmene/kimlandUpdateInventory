import { KimlandAuthenticator } from './utils/kimland-authenticator';
import { KimlandProductSearcher } from './utils/kimland-product-searcher';
import { KimlandCredentials, KimlandProduct } from './types/kimland.types';
import { logger } from '../../utils/logger';

export class KimlandAuthService {
  private authenticator: KimlandAuthenticator;
  private productSearcher: KimlandProductSearcher;
  private credentials: KimlandCredentials;

  constructor() {
    this.authenticator = new KimlandAuthenticator();
    this.productSearcher = new KimlandProductSearcher(this.authenticator);
    this.credentials = {
      email: 'Benmerdjabn@gmail.com',
      username: 'Adel Benmerdja ',
      password: 'adelbn17686421'
    };
  }

  /**
   * Authentification sur Kimland
   */
  async authenticate(credentials: KimlandCredentials): Promise<boolean> {
    return await this.authenticator.authenticate(credentials);
  }

  /**
   * Rechercher un produit par SKU avec nom produit pour plus de précision
   */
  async searchProductBySku(sku: string, productName?: string): Promise<KimlandProduct | null> {
    try {
      if (!this.authenticator.isLoggedIn()) {
        logger.info('🔐 Connexion à Kimland requise', { sku });
        const authSuccess = await this.authenticator.authenticate(this.credentials);
        if (!authSuccess) {
          logger.error('❌ Échec authentification Kimland', { sku });
          return null;
        }
      }

      return await this.productSearcher.searchProductBySku(sku, productName);
    } catch (error) {
      logger.error('❌ Erreur recherche produit', { sku, error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  /**
   * Vérifier si connecté
   */
  isLoggedIn(): boolean {
    return this.authenticator.isLoggedIn();
  }

  /**
   * Déconnexion
   */
  logout(): void {
    this.authenticator.logout();
  }
}

// Export des types pour compatibilité
export * from './types/kimland.types';
