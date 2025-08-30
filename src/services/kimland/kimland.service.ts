import { KimlandAuthService, KimlandCredentials, KimlandProduct } from './kimland-auth.service';
import { shopifyApiService } from '../shopify-api.service';
import { logger } from '../../utils/logger';
import { shopifyLog } from '../../utils/shopify-logger';

export interface InventorySync {
  sku: string;
  shopifyProductId: string;
  kimlandProduct: KimlandProduct | null;
  syncStatus: 'success' | 'error' | 'not_found';
  errorMessage?: string;
  syncedAt: Date;
}

interface UpdateResult {
  updates: number;
  creates: number;
  errors: number;
}

export class KimlandService {
  private authService: KimlandAuthService;
  private credentials: KimlandCredentials;

  constructor() {
    this.authService = new KimlandAuthService();
    this.credentials = {
      email: 'bousetta88@gmail.com',
      username: 'Boumediene Bousetta',
      password: 'Abraj@Injaz'
    };
  }

  /**
   * Synchroniser l'inventaire d'un produit
   */
  async syncProductInventory(sku: string, shopifyProductId: string, shop?: string, accessToken?: string): Promise<InventorySync> {
    shopifyLog.syncStart(sku, shopifyProductId);

    const syncResult: InventorySync = {
      sku,
      shopifyProductId,
      kimlandProduct: null,
      syncStatus: 'error',
      syncedAt: new Date()
    };

    try {
      // Authentification si nécessaire
      if (!this.authService.isLoggedIn()) {
        logger.info('🔐 Connexion à Kimland requise', { sku });
        const authSuccess = await this.authService.authenticate(this.credentials);
        
        if (!authSuccess) {
          syncResult.errorMessage = 'Échec authentification Kimland';
          shopifyLog.syncError(sku, 'Échec authentification Kimland');
          return syncResult;
        }
      }

      // Rechercher le produit par SKU
      const kimlandProduct = await this.authService.searchProductBySku(sku);
      
      if (!kimlandProduct) {
        syncResult.syncStatus = 'not_found';
        syncResult.errorMessage = 'Produit non trouvé sur Kimland';
        shopifyLog.syncError(sku, 'Produit non trouvé sur Kimland');
        return syncResult;
      }

      syncResult.kimlandProduct = kimlandProduct;
      shopifyLog.productFound(
        sku, 
        kimlandProduct.name, 
        kimlandProduct.variants.length,
        kimlandProduct.variants.reduce((total, v) => total + v.stock, 0)
      );
      
      // Mettre à jour Shopify si shop et accessToken fournis
      if (shop && accessToken) {
        const updateResult = await this.updateShopifyInventory(shop, accessToken, shopifyProductId, kimlandProduct);
        
        if (updateResult) {
          shopifyLog.syncComplete(sku, updateResult.updates, updateResult.creates, updateResult.errors);
        } else {
          shopifyLog.syncError(sku, 'Échec mise à jour Shopify');
        }
      }
      
      syncResult.syncStatus = 'success';
      
      logger.info('✅ Synchronisation réussie', {
        sku,
        productName: kimlandProduct.name,
        variantsCount: kimlandProduct.variants.length,
        totalStock: kimlandProduct.variants.reduce((total, v) => total + v.stock, 0)
      });

      return syncResult;

    } catch (error) {
      syncResult.errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      shopifyLog.syncError(sku, syncResult.errorMessage);
      logger.error('❌ Erreur sync inventaire', { sku, error: syncResult.errorMessage });
      return syncResult;
    }
  }

  /**
   * Synchroniser plusieurs produits en lot
   */
  async syncMultipleProducts(products: Array<{sku: string, shopifyProductId: string}>): Promise<InventorySync[]> {
    const results: InventorySync[] = [];
    
    logger.info('🔄 Début sync batch', { count: products.length });

    // Authentification une seule fois
    if (!this.authService.isLoggedIn()) {
      const authSuccess = await this.authService.authenticate(this.credentials);
      if (!authSuccess) {
        return products.map(p => ({
          sku: p.sku,
          shopifyProductId: p.shopifyProductId,
          kimlandProduct: null,
          syncStatus: 'error' as const,
          errorMessage: 'Échec authentification Kimland',
          syncedAt: new Date()
        }));
      }
    }

    // Synchroniser chaque produit avec délai
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      logger.info(`📦 Sync produit ${i + 1}/${products.length}`, { sku: product.sku });
      
      const result = await this.syncProductInventory(product.sku, product.shopifyProductId);
      results.push(result);
      
      // Délai entre les requêtes pour éviter d'être bloqué
      if (i < products.length - 1) {
        await this.delay(2000);
      }
    }

    const summary = {
      success: results.filter(r => r.syncStatus === 'success').length,
      notFound: results.filter(r => r.syncStatus === 'not_found').length,
      errors: results.filter(r => r.syncStatus === 'error').length
    };

    logger.info('📊 Sync batch terminé', summary);
    return results;
  }

  /**
   * Délai utilitaire
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Vérifier la connexion Kimland
   */
  async checkConnection(): Promise<boolean> {
    try {
      return this.authService.isLoggedIn();
    } catch (error) {
      logger.error('Erreur vérification connexion', { error });
      return false;
    }
  }

  /**
   * Tester la connexion Kimland
   */
  async testConnection(): Promise<{success: boolean, error?: string, details?: any}> {
    try {
      const authSuccess = await this.authService.authenticate(this.credentials);
      
      if (authSuccess) {
        return {
          success: true,
          details: {
            message: 'Connexion réussie',
            timestamp: new Date().toISOString()
          }
        };
      } else {
        return {
          success: false,
          error: 'Échec de l\'authentification'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * Vider la session Kimland
   */
  async clearSession(): Promise<void> {
    this.authService.logout();
    logger.info('Session Kimland vidée');
  }

  /**
   * Obtenir les informations d'un produit par SKU
   */
  async getProductInfo(sku: string): Promise<{found: boolean, product?: KimlandProduct, error?: string}> {
    try {
      if (!this.authService.isLoggedIn()) {
        const authSuccess = await this.authService.authenticate(this.credentials);
        if (!authSuccess) {
          return { found: false, error: 'Échec authentification' };
        }
      }

      const product = await this.authService.searchProductBySku(sku);
      
      if (product) {
        return { found: true, product };
      } else {
        return { found: false, error: 'Produit non trouvé' };
      }
    } catch (error) {
      return {
        found: false,
        error: error instanceof Error ? error.message : 'Erreur lors de la recherche'
      };
    }
  }

  /**
   * Obtenir le stock d'un produit
   */
  async getStock(sku: string): Promise<{quantity: number, available: boolean, lastUpdate: Date}> {
    try {
      const productInfo = await this.getProductInfo(sku);
      
      if (productInfo.found && productInfo.product) {
        const totalStock = productInfo.product.variants.reduce((total, v) => total + v.stock, 0);
        
        return {
          quantity: totalStock,
          available: totalStock > 0,
          lastUpdate: new Date()
        };
      } else {
        return {
          quantity: 0,
          available: false,
          lastUpdate: new Date()
        };
      }
    } catch (error) {
      throw new Error(`Erreur récupération stock: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  /**
   * Obtenir les statistiques de session
   */
  async getSessionStats(): Promise<{connected: boolean, loginTime?: Date, requestCount?: number}> {
    return {
      connected: this.authService.isLoggedIn(),
      loginTime: new Date(), // TODO: Implémenter le tracking réel
      requestCount: 0 // TODO: Implémenter le compteur
    };
  }

  /**
   * Forcer une nouvelle authentification
   */
  async forceLogin(): Promise<{success: boolean, error?: string}> {
    try {
      // Déconnexion forcée
      this.authService.logout();
      
      // Nouvelle authentification
      const success = await this.authService.authenticate(this.credentials);
      
      if (success) {
        return { success: true };
      } else {
        return { success: false, error: 'Échec de l\'authentification' };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur lors de l\'authentification'
      };
    }
  }

  /**
   * Mettre à jour l'inventaire Shopify avec les données Kimland (VERSION CORRIGÉE)
   */
  private async updateShopifyInventory(shop: string, accessToken: string, shopifyProductId: string, kimlandProduct: KimlandProduct): Promise<UpdateResult | null> {
    let updates = 0, creates = 0, errors = 0;
    
    try {
      // Récupérer le produit Shopify complet avec variants
      const shopifyProduct = await shopifyApiService.getProduct(shop, accessToken, shopifyProductId);
      
      if (!shopifyProduct || !shopifyProduct.variants) {
        shopifyLog.syncError('updateShopify', 'Produit Shopify introuvable');
        return null;
      }
      
      shopifyLog.shopifyProduct(shopifyProductId, shopifyProduct.title, shopifyProduct.variants.length);
      
      // Mapping des tailles (Kimland -> Shopify)
      const sizeMapping = {
        '2XL': 'XXL',
        'XS': 'XS',
        'S': 'S', 
        'M': 'M',
        'L': 'L',
        'XL': 'XL',
        'XXL': 'XXL',
        '3XL': 'XXXL'
      };
      
      const mapSize = (kimlandSize: string): string => {
        return sizeMapping[kimlandSize] || kimlandSize;
      };
      
      // Créer un Set des tailles Kimland (mappées) pour identification rapide
      const kimlandSizesSet = new Set(
        kimlandProduct.variants.map(v => mapSize(v.size.toString()))
      );
      
      shopifyLog.debug('SIZE_MAPPING_INFO', {
        kimlandSizes: kimlandProduct.variants.map(v => v.size),
        mappedSizes: kimlandProduct.variants.map(v => mapSize(v.size.toString())),
        shopifySizes: shopifyProduct.variants.map(v => v.option1 || v.option2 || v.option3)
      });
      
      // 1. Traiter chaque variant Kimland (créer ou mettre à jour)
      for (const kimlandVariant of kimlandProduct.variants) {
        try {
          const mappedSize = mapSize(kimlandVariant.size.toString());
          
          // Chercher le variant Shopify correspondant
          const shopifyVariant = shopifyProduct.variants.find(v => {
            const shopifySize = (v.option1 || v.option2 || v.option3 || '').toString();
            return shopifySize === mappedSize ||
                   shopifySize.toLowerCase() === mappedSize.toLowerCase() ||
                   shopifySize.replace(/\s/g, '') === mappedSize.replace(/\s/g, '');
          });
          
          shopifyLog.debug('VARIANT_MATCHING', {
            kimlandSize: kimlandVariant.size,
            mappedSize: mappedSize,
            kimlandStock: kimlandVariant.stock,
            matchFound: !!shopifyVariant,
            shopifyVariantId: shopifyVariant?.id,
            shopifySize: shopifyVariant?.option1 || shopifyVariant?.option2 || shopifyVariant?.option3
          });
          
          if (shopifyVariant) {
            // Variant existant - mise à jour
            shopifyLog.variantUpdate(
              shopifyVariant.id.toString(), 
              mappedSize, 
              shopifyVariant.inventory_quantity || 0, 
              kimlandVariant.stock
            );
            
            // 1. Mettre à jour le SKU du variant si nécessaire
            const expectedSku = `${kimlandProduct.name.replace(/\s+/g, '-').toUpperCase()}-${mappedSize}`;
            if (shopifyVariant.sku !== expectedSku) {
              shopifyLog.debug('SKU_UPDATE_NEEDED', {
                variantId: shopifyVariant.id,
                currentSku: shopifyVariant.sku,
                expectedSku
              });
              await shopifyApiService.updateVariantSku(shop, accessToken, shopifyVariant.id.toString(), expectedSku);
            }
            
            // 2. Mettre à jour l'inventaire
            await shopifyApiService.updateInventoryLevelModern(shop, accessToken, shopifyVariant.id.toString(), kimlandVariant.stock);
            
            shopifyLog.inventorySuccess(shopifyVariant.id.toString(), kimlandVariant.stock);
            updates++;
          } else {
            // Nouveau variant - création
            shopifyLog.variantCreate(shopifyProductId, mappedSize, kimlandVariant.stock);
            
            // Vérifier s'il y a déjà des variants avec des tailles numériques
            const hasNumericSizes = shopifyProduct.variants.some(v => {
              const size = v.option1 || v.option2 || v.option3;
              return size && /^\d+(\.\d+)?$/.test(size.toString());
            });
            
            // Si le produit a déjà des tailles numériques et Kimland donne "Standard", on skip
            if (hasNumericSizes && mappedSize === 'Standard') {
              shopifyLog.variantSkip(mappedSize, 'Produit avec tailles numériques, Standard incompatible');
              continue;
            }
            
            try {
              const newVariant = await shopifyApiService.createVariant(shop, accessToken, shopifyProductId, {
                option1: mappedSize,
                inventory_quantity: kimlandVariant.stock,
                inventory_management: 'shopify',
                inventory_policy: 'deny'
              });
              
              if (newVariant) {
                shopifyLog.debug('VARIANT_CREATED', {
                  newVariantId: newVariant.id,
                  option1: newVariant.option1,
                  inventory: newVariant.inventory_quantity
                });
                
                // Mettre à jour le SKU du nouveau variant
                const expectedSku = `${kimlandProduct.name.replace(/\s+/g, '-').toUpperCase()}-${mappedSize}`;
                await shopifyApiService.updateVariantSku(shop, accessToken, newVariant.id.toString(), expectedSku);
                
                shopifyLog.inventorySuccess(newVariant.id.toString(), kimlandVariant.stock);
                creates++;
              } else {
                shopifyLog.inventoryError('new-variant', 'Echec création variant - réponse nulle');
                errors++;
              }
            } catch (createError: any) {
              // Gestion spéciale pour l'erreur 422 metafield
              if (createError.response?.status === 422 && createError.response?.data?.errors?.product) {
                const errorMessages = createError.response.data.errors.product;
                const isMetafieldError = errorMessages.some((msg: string) => 
                  msg.includes('metafield') || msg.includes('Cannot set name for an option value')
                );
                
                if (isMetafieldError) {
                  shopifyLog.debug('VARIANT_CREATE_SKIP_METAFIELD', {
                    kimlandSize: kimlandVariant.size,
                    mappedSize: mappedSize,
                    reason: 'Produit avec options liées aux metafields - skip création variant'
                  });
                  // Ne pas compter comme erreur, c'est normal pour certains produits
                  continue;
                }
              }
              shopifyLog.debug('VARIANT_CREATE_ERROR_DETAIL', {
                kimlandSize: kimlandVariant.size,
                mappedSize: mappedSize,
                errorStatus: createError.response?.status,
                errorData: createError.response?.data ? JSON.stringify(createError.response.data) : 'No data',
                errorMessage: createError.message
              });
              
              shopifyLog.inventoryError('new-variant', `Erreur ${createError.response?.status || 'unknown'}: ${createError.message}`);
              errors++;
            }
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
          shopifyLog.inventoryError(
            'variant-processing',
            errorMsg
          );
          shopifyLog.debug('VARIANT_ERROR', {
            kimlandSize: kimlandVariant.size,
            error: errorMsg,
            stack: error instanceof Error ? error.stack?.substring(0, 200) : undefined
          });
          errors++;
        }
      }
      
      // 2. Mettre à zéro les variants Shopify qui n'existent pas côté Kimland
      for (const shopifyVariant of shopifyProduct.variants) {
        const shopifySize = (shopifyVariant.option1 || shopifyVariant.option2 || shopifyVariant.option3 || '').toString();
        
        // Vérifier si cette taille existe côté Kimland
        if (!kimlandSizesSet.has(shopifySize)) {
          shopifyLog.debug('ZERO_STOCK_VARIANT', {
            shopifyVariantId: shopifyVariant.id,
            shopifySize: shopifySize,
            currentStock: shopifyVariant.inventory_quantity,
            reason: 'Absent de Kimland'
          });
          
          try {
            // Mettre le stock à zéro
            await shopifyApiService.updateInventoryLevelModern(shop, accessToken, shopifyVariant.id.toString(), 0);
            
            shopifyLog.inventorySuccess(shopifyVariant.id.toString(), 0);
            updates++;
          } catch (error) {
            shopifyLog.inventoryError(
              shopifyVariant.id.toString(),
              `Erreur mise à zéro: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
            );
            errors++;
          }
        }
      }
      
      return { updates, creates, errors };
      
    } catch (error) {
      shopifyLog.syncError('updateShopify', error instanceof Error ? error.message : 'Erreur inconnue');
      return null;
    }
  }

  /**
   * Déconnexion
   */
  logout(): void {
    this.authService.logout();
  }
}

export const kimlandService = new KimlandService();
