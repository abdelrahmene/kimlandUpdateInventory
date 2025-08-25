import { ProcessedProduct, ProductsResponse } from '../types';
import { shopifyApiService } from './shopify-api.service';
import { firebaseService } from './firebase.service';
import { logger } from '../utils/logger';

export class ProductService {
  /**
   * Charge tous les produits d'un shop avec pagination automatique
   */
  public async loadAllProducts(
    shop: string,
    accessToken: string,
    options: {
      search?: string;
      maxProducts?: number;
      maxPages?: number;
    } = {}
  ): Promise<ProcessedProduct[]> {
    const { search, maxProducts = 10000, maxPages = 50 } = options;
    const allProducts: ProcessedProduct[] = [];
    let pageInfo: string | undefined;
    let currentPage = 0;

    logger.info('Début du chargement des produits', { shop, search, maxProducts, maxPages });

    try {
      do {
        currentPage++;
        logger.debug('Chargement page', { page: currentPage, shop });

        const result = await shopifyApiService.getProductsPage(shop, accessToken, {
          limit: 250,
          search,
          pageInfo,
        });

        if (!result || !result.products.length) {
          logger.debug('Arrêt du chargement: page vide', { page: currentPage });
          break;
        }

        // Traiter les produits de cette page
        for (const shopifyProduct of result.products) {
          if (allProducts.length >= maxProducts) {
            logger.info('Limite de produits atteinte', { maxProducts });
            break;
          }

          const processedProduct = shopifyApiService.processProduct(shopifyProduct);
          allProducts.push(processedProduct);
        }

        pageInfo = result.nextPageInfo;
        logger.debug('Page traitée', {
          page: currentPage,
          productsOnPage: result.products.length,
          totalProducts: allProducts.length,
          hasNextPage: !!pageInfo,
        });

        // Vérifications de sécurité
        if (currentPage >= maxPages) {
          logger.warn('Limite de pages atteinte', { maxPages });
          break;
        }

        if (allProducts.length >= maxProducts) {
          logger.info('Limite de produits atteinte', { maxProducts });
          break;
        }

      } while (pageInfo);

      logger.info('Chargement des produits terminé', {
        shop,
        totalProducts: allProducts.length,
        pagesLoaded: currentPage,
      });

      return allProducts;
    } catch (error) {
      logger.error('Erreur lors du chargement des produits', {
        shop,
        error: error instanceof Error ? error.message : error,
        productsLoaded: allProducts.length,
      });
      throw error;
    }
  }

  /**
   * Génère les statistiques des produits
   */
  public generateStats(products: ProcessedProduct[]): {
    totalCount: number;
    displayedCount: number;
    withRefCount: number;
    totalStock: number;
  } {
    const withRefCount = products.filter(p => p.has_ref).length;
    const totalStock = products.reduce((sum, p) => sum + p.total_stock, 0);

    return {
      totalCount: products.length,
      displayedCount: products.length,
      withRefCount,
      totalStock,
    };
  }

  /**
   * Charge et traite les produits avec génération de réponse complète
   */
  public async getProductsWithStats(
    shop: string,
    accessToken: string,
    options: {
      search?: string;
      loadAll?: boolean;
      limit?: number;
    } = {}
  ): Promise<ProductsResponse> {
    const { search, loadAll = false, limit = 50 } = options;

    try {
      let products: ProcessedProduct[];

      if (loadAll) {
        // Charger tous les produits
        products = await this.loadAllProducts(shop, accessToken, {
          search,
          maxProducts: 10000,
          maxPages: 50,
        });
      } else {
        // Charger seulement une page
        const result = await shopifyApiService.getProductsPage(shop, accessToken, {
          limit,
          search,
        });

        if (!result) {
          throw new Error('Impossible de récupérer les produits');
        }

        products = result.products.map(p => shopifyApiService.processProduct(p));
      }

      const stats = this.generateStats(products);

      // Sauvegarder les statistiques dans Firebase (async, sans attendre)
      firebaseService.saveExtractionStats(shop, {
        totalProducts: stats.totalCount,
        withReferences: stats.withRefCount,
        extractionRate: stats.totalCount > 0 ? (stats.withRefCount / stats.totalCount) * 100 : 0,
        timestamp: new Date(),
      }).catch(error => {
        logger.warn('Erreur lors de la sauvegarde des stats', { error });
      });

      return {
        success: true,
        products,
        stats,
        metadata: {
          total_products_fetched: stats.totalCount,
        },
      };
    } catch (error) {
      logger.error('Erreur dans getProductsWithStats', {
        shop,
        error: error instanceof Error ? error.message : error,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        message: `Erreur lors du chargement des produits: ${error instanceof Error ? error.message : 'Erreur inconnue'}`,
      };
    }
  }

  /**
   * Filtre les produits selon des critères
   */
  public filterProducts(
    products: ProcessedProduct[],
    filters: {
      withReferencesOnly?: boolean;
      minStock?: number;
      vendor?: string;
      productType?: string;
    }
  ): ProcessedProduct[] {
    let filtered = [...products];

    if (filters.withReferencesOnly) {
      filtered = filtered.filter(p => p.has_ref);
    }

    if (filters.minStock !== undefined) {
      filtered = filtered.filter(p => p.total_stock >= filters.minStock);
    }

    if (filters.vendor) {
      filtered = filtered.filter(p => 
        p.vendor?.toLowerCase().includes(filters.vendor!.toLowerCase())
      );
    }

    if (filters.productType) {
      filtered = filtered.filter(p =>
        p.product_type?.toLowerCase().includes(filters.productType!.toLowerCase())
      );
    }

    return filtered;
  }
}

export const productService = new ProductService();
