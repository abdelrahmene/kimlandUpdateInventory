import { KimlandAuthService, KimlandCredentials, KimlandProduct } from './kimland-auth.service';
import { shopifyApiService } from '../shopify-api.service';
import { logger } from '../../utils/logger';
import { shopifyLog } from '../../utils/shopify-logger';
import axios from 'axios';

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
      if (!this.authService.isLoggedIn()) {
        logger.info('🔐 Connexion à Kimland requise', { sku });
        const authSuccess = await this.authService.authenticate(this.credentials);
        if (!authSuccess) {
          syncResult.errorMessage = 'Échec authentification Kimland';
          shopifyLog.syncError(sku, 'Échec authentification Kimland');
          return syncResult;
        }
      }

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

      if (shop && accessToken) {
        const updateResult = await this.updateShopifyInventory(shop, accessToken, shopifyProductId, kimlandProduct);
        
        shopifyLog.debug('SHOPIFY_UPDATE_RESULT', {
          sku,
          productId: shopifyProductId,
          updates: updateResult?.updates || 0,
          creates: updateResult?.creates || 0,
          errors: updateResult?.errors || 0,
          success: updateResult ? updateResult.errors === 0 : false
        });
        
        if (updateResult && updateResult.errors === 0) {
          shopifyLog.syncComplete(sku, updateResult.updates, updateResult.creates, updateResult.errors);
        } else {
          shopifyLog.syncError(sku, `Échec mise à jour Shopify - ${updateResult?.errors || 'inconnue'} erreur(s)`);
          // Ne pas faire échouer la sync entière si Kimland fonctionne
          logger.warn('⚠️ Kimland OK mais échec mise à jour Shopify', {
            sku,
            kimlandStock: kimlandProduct.variants.reduce((total, v) => total + v.stock, 0),
            shopifyErrors: updateResult?.errors || 'inconnues'
          });
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

  async syncMultipleProducts(products: Array<{sku: string, shopifyProductId: string}>): Promise<InventorySync[]> {
    const results: InventorySync[] = [];

    logger.info('🔄 Début sync batch', { count: products.length });

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

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      logger.info(`📦 Sync produit ${i + 1}/${products.length}`, { sku: product.sku });
      const result = await this.syncProductInventory(product.sku, product.shopifyProductId);
      results.push(result);
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async checkConnection(): Promise<boolean> {
    try {
      return this.authService.isLoggedIn();
    } catch (error) {
      logger.error('Erreur vérification connexion', { error });
      return false;
    }
  }

  async testConnection(): Promise<{success: boolean, error?: string, details?: any}> {
    try {
      const authSuccess = await this.authService.authenticate(this.credentials);
      if (authSuccess) {
        return {
          success: true,
          details: { message: 'Connexion réussie', timestamp: new Date().toISOString() }
        };
      } else {
        return { success: false, error: 'Échec de l\'authentification' };
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
    }
  }

  async clearSession(): Promise<void> {
    this.authService.logout();
    logger.info('Session Kimland vidée');
  }

  async getProductInfo(sku: string): Promise<{found: boolean, product?: KimlandProduct, error?: string}> {
    try {
      if (!this.authService.isLoggedIn()) {
        const authSuccess = await this.authService.authenticate(this.credentials);
        if (!authSuccess) return { found: false, error: 'Échec authentification' };
      }
      const product = await this.authService.searchProductBySku(sku);
      return product ? { found: true, product } : { found: false, error: 'Produit non trouvé' };
    } catch (error) {
      return { found: false, error: error instanceof Error ? error.message : 'Erreur lors de la recherche' };
    }
  }

  async getStock(sku: string): Promise<{quantity: number, available: boolean, lastUpdate: Date}> {
    try {
      const productInfo = await this.getProductInfo(sku);
      if (productInfo.found && productInfo.product) {
        const totalStock = productInfo.product.variants.reduce((total, v) => total + v.stock, 0);
        return { quantity: totalStock, available: totalStock > 0, lastUpdate: new Date() };
      } else {
        return { quantity: 0, available: false, lastUpdate: new Date() };
      }
    } catch (error) {
      throw new Error(`Erreur récupération stock: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  async getSessionStats(): Promise<{connected: boolean, loginTime?: Date, requestCount?: number}> {
    return { connected: this.authService.isLoggedIn(), loginTime: new Date(), requestCount: 0 };
  }

  async forceLogin(): Promise<{success: boolean, error?: string}> {
    try {
      this.authService.logout();
      const success = await this.authService.authenticate(this.credentials);
      return success ? { success: true } : { success: false, error: 'Échec de l\'authentification' };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Erreur lors de l\'authentification' };
    }
  }

  private async createSizeMetaobject(
    shop: string,
    accessToken: string,
    sizeValue: string
  ): Promise<{id: string, handle: string} | null> {
    try {
      // Créer un metaobject pour représenter cette taille/pointure
      const createMetaobjectQuery = `
        mutation metaobjectCreate($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject {
              id
              handle
              fields {
                key
                value
              }
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `;

      // Utiliser un type générique pour les tailles - peut être 'size', 'shoe_size', ou un type custom
      const metaobjectType = 'size'; // Type générique pour tailles
      const handle = `size-${sizeValue.toLowerCase()}`;

      const variables = {
        metaobject: {
          type: metaobjectType,
          handle: handle,
          fields: [
            {
              key: 'name',
              value: sizeValue
            },
            {
              key: 'value',
              value: sizeValue
            }
          ]
        }
      };

      const response = await axios.post(
        `https://${shop}/admin/api/2024-10/graphql.json`,
        {
          query: createMetaobjectQuery,
          variables
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = response.data;
      
      if (result.errors) {
        shopifyLog.debug('METAOBJECT_CREATE_GRAPHQL_ERRORS', {
          errors: result.errors
        });
        return null;
      }

      const createResult = result.data?.metaobjectCreate;
      
      if (createResult?.userErrors?.length > 0) {
        shopifyLog.debug('METAOBJECT_CREATE_USER_ERRORS', {
          userErrors: createResult.userErrors
        });
        return null;
      }

      if (createResult?.metaobject) {
        shopifyLog.debug('SIZE_METAOBJECT_CREATED_SUCCESS', {
          metaobjectId: createResult.metaobject.id,
          handle: createResult.metaobject.handle,
          sizeValue
        });
        
        return {
          id: createResult.metaobject.id,
          handle: createResult.metaobject.handle
        };
      }

      return null;
    } catch (error: any) {
      shopifyLog.debug('SIZE_METAOBJECT_CREATE_ERROR', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return null;
    }
  }

private async createVariantWithMetafieldLinkedOptions(
    shop: string,
    accessToken: string,
    productId: string,
    optionValue: string,
    inventoryQuantity: number
  ): Promise<{id: string, title: string} | null> {
    try {
      // Étape 1: Récupérer les metafields du produit pour comprendre la structure
      const productQuery = `
        query getProduct($id: ID!) {
          product(id: $id) {
            options {
              id
              name
              optionValues {
                id
                name
                linkedMetafieldValue
              }
            }
            metafields(first: 10) {
              edges {
                node {
                  id
                  namespace
                  key
                  type
                  value
                  references(first: 20) {
                    edges {
                      node {
                        ... on Metaobject {
                          id
                          handle
                          fields {
                            key
                            value
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const productResponse = await axios.post(
        `https://${shop}/admin/api/2024-10/graphql.json`,
        {
          query: productQuery,
          variables: { id: `gid://shopify/Product/${productId}` }
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const product = productResponse.data?.data?.product;
      if (!product) {
        shopifyLog.debug('PRODUCT_METAFIELDS_NOT_FOUND', { productId });
        return null;
      }

      // Étape 2: Chercher un metaobject correspondant à la valeur souhaitée
      let targetMetaobjectId = null;
      
      // Chercher dans les metafields du produit
      for (const metafieldEdge of product.metafields.edges) {
        const metafield = metafieldEdge.node;
        if (metafield.references?.edges) {
          for (const refEdge of metafield.references.edges) {
            const metaobject = refEdge.node;
            if (metaobject.fields) {
              // Chercher si un field contient notre valeur (45)
              const matchingField = metaobject.fields.find(field => 
                field.value === optionValue || 
                field.value === optionValue.toString()
              );
              if (matchingField) {
                targetMetaobjectId = metaobject.id;
                shopifyLog.debug('FOUND_MATCHING_METAOBJECT', {
                  metaobjectId: targetMetaobjectId,
                  optionValue,
                  matchingField
                });
                break;
              }
            }
          }
          if (targetMetaobjectId) break;
        }
      }

      // Si pas trouvé, essayer de créer un nouveau metaobject
      if (!targetMetaobjectId) {
        shopifyLog.debug('METAOBJECT_NOT_FOUND', {
          optionValue,
          message: 'Tentative de création d\'un nouveau metaobject'
        });
        
        // Créer un nouveau metaobject pour cette pointure/taille
        const newMetaobject = await this.createSizeMetaobject(
          shop, accessToken, optionValue
        );
        
        if (newMetaobject) {
          targetMetaobjectId = newMetaobject.id;
          shopifyLog.debug('METAOBJECT_CREATED', {
            metaobjectId: targetMetaobjectId,
            optionValue
          });
        } else {
          return null;
        }
      }

      // Étape 3: Créer le variant avec linkedMetafieldValue
      const createVariantQuery = `
        mutation productUpdate($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
              variants(last: 1) {
                edges {
                  node {
                    id
                    title
                    inventoryQuantity
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const updateResponse = await axios.post(
        `https://${shop}/admin/api/2024-10/graphql.json`,
        {
          query: createVariantQuery,
          variables: {
            input: {
              id: `gid://shopify/Product/${productId}`,
              options: [
                {
                  optionValues: [
                    {
                      linkedMetafieldValue: targetMetaobjectId
                    }
                  ]
                }
              ]
            }
          }
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      const result = updateResponse.data;
      if (result.errors || result.data?.productUpdate?.userErrors?.length > 0) {
        shopifyLog.debug('METAFIELD_VARIANT_CREATE_FAILED', {
          errors: result.errors,
          userErrors: result.data?.productUpdate?.userErrors
        });
        return null;
      }

      const newVariant = result.data?.productUpdate?.product?.variants?.edges?.[0]?.node;
      if (newVariant) {
        shopifyLog.debug('METAFIELD_VARIANT_CREATED', {
          variantId: newVariant.id,
          title: newVariant.title,
          method: 'Metafield-linked GraphQL'
        });
        
        // Mettre à jour l'inventaire séparément
        const variantNumericId = newVariant.id.replace('gid://shopify/ProductVariant/', '');
        await shopifyApiService.updateInventoryLevelModern(
          shop, accessToken, variantNumericId, inventoryQuantity
        );
        
        return {
          id: variantNumericId,
          title: newVariant.title
        };
      }

      return null;
    } catch (error: any) {
      shopifyLog.debug('METAFIELD_VARIANT_ERROR', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return null;
    }
  }
private async updateShopifyInventory(
  shop: string,
  accessToken: string,
  shopifyProductId: string,
  kimlandProduct: KimlandProduct
): Promise<UpdateResult | null> {
  let updates = 0, creates = 0, errors = 0;
  try {
    const shopifyProduct = await shopifyApiService.getProduct(shop, accessToken, shopifyProductId);
    if (!shopifyProduct || !shopifyProduct.variants) {
      shopifyLog.syncError('updateShopify', 'Produit Shopify introuvable');
      return null;
    }

    shopifyLog.shopifyProduct(shopifyProductId, shopifyProduct.title, shopifyProduct.variants.length);

    // 🎯 NOUVELLE LOGIQUE DE MAPPING AMÉLIORÉE
    const sizeMapping: Record<string, string> = {
      // Vêtements
      '2XL':'XXL','XS':'XS','S':'S','M':'M','L':'L','XL':'XL','XXL':'XXL','3XL':'XXXL',
      // Pointures exactes
      '37':'37','37.5':'37.5','38':'38','38.5':'38.5','39':'39','39.5':'39.5',
      '40':'40','40.5':'40.5','41':'41','41.5':'41.5','42':'42','42.5':'42.5',
      '43':'43','43.5':'43.5','44':'44','44.5':'44.5','45':'45','45.5':'45.5','46':'46'
    };
    
    const mapSize = (kimlandSize: string) => {
      const mapped = sizeMapping[kimlandSize] || kimlandSize;
      shopifyLog.debug('SIZE_MAPPING', {
        kimlandOriginal: kimlandSize,
        mappedSize: mapped,
        isMapped: sizeMapping[kimlandSize] !== undefined
      });
      return mapped;
    };
    const normalize = (str: string) => str.trim().toLowerCase();

    // 🔍 Analyser les options Shopify pour identifier le type de variante
    const shopifyOptions = {
      option1Values: [...new Set(shopifyProduct.variants.map(v => v.option1).filter(Boolean))],
      option2Values: [...new Set(shopifyProduct.variants.map(v => v.option2).filter(Boolean))],
      option3Values: [...new Set(shopifyProduct.variants.map(v => v.option3).filter(Boolean))]
    };

    shopifyLog.debug('SHOPIFY_OPTIONS_ANALYSIS', {
      productId: shopifyProductId,
      option1Values: shopifyOptions.option1Values,
      option2Values: shopifyOptions.option2Values,
      option3Values: shopifyOptions.option3Values
    });

    // 🎨 Identifier les options de couleur
    const colorKeywords = ['couleur', 'color', 'couleur du bracelet', 'bracelet', 'teinte'];
    const isColorOption = (values: string[]) => {
      return values.some(value => 
        colorKeywords.some(keyword => 
          normalize(value).includes(keyword) || 
          value.match(/^(rouge|bleu|vert|noir|blanc|jaune|rose|violet|orange|gris|marron|beige)$/i)
        )
      );
    };

    let colorOptionIndex = 0; // Par défaut option1
    if (isColorOption(shopifyOptions.option2Values)) colorOptionIndex = 1;
    if (isColorOption(shopifyOptions.option3Values)) colorOptionIndex = 2;

    shopifyLog.debug('COLOR_OPTION_DETECTED', {
      colorOptionIndex,
      detectedColorValues: shopifyOptions[`option${colorOptionIndex + 1}Values` as keyof typeof shopifyOptions]
    });

    for (const kimlandVariant of kimlandProduct.variants) {
      try {
        const mappedSize = mapSize(kimlandVariant.size.toString());
        let shopifyVariant;

        // 🎯 CAS SPÉCIAL: "Standard" ou "Dimension" -> Prendre la première variante disponible
        if (['standard', 'dimensions', 'dimension'].includes(normalize(mappedSize))) {
          shopifyLog.debug('STANDARD_DIMENSION_DETECTED', {
            kimlandSize: mappedSize,
            shopifyVariantsCount: shopifyProduct.variants.length
          });
          
          // Prendre la première variante OU celle avec le plus de stock si disponible
          shopifyVariant = shopifyProduct.variants[0];
          
          // Si plusieurs variantes, prendre celle avec le moins de stock (pour équilibrer)
          if (shopifyProduct.variants.length > 1) {
            shopifyVariant = shopifyProduct.variants.reduce((min, current) => 
              (current.inventory_quantity || 0) < (min.inventory_quantity || 0) ? current : min
            );
          }
          
          shopifyLog.debug('STANDARD_VARIANT_SELECTED', {
            kimlandSize: mappedSize,
            selectedVariantId: shopifyVariant?.id,
            selectedVariantOption: shopifyVariant?.option1,
            currentStock: shopifyVariant?.inventory_quantity
          });
        } else {
          // 🔍 MATCHING NORMAL: Chercher par couleur ou taille
          shopifyVariant = shopifyProduct.variants.find(v => {
            const options = [v.option1, v.option2, v.option3].map(opt => (opt || '').toString());
            
            shopifyLog.debug('VARIANT_MATCHING_ATTEMPT', {
              shopifyVariantId: v.id,
              shopifyOptions: options,
              kimlandSize: mappedSize,
              exactMatch: options.some(opt => opt === mappedSize),
              partialMatch: options.some(opt => 
                normalize(opt).includes(normalize(mappedSize)) || 
                normalize(mappedSize).includes(normalize(opt))
              )
            });
            
            // Tentative 1: Match exact
            if (options.some(opt => opt === mappedSize)) {
              shopifyLog.debug('EXACT_MATCH_FOUND', {
                shopifyVariantId: v.id,
                matchedOption: options.find(opt => opt === mappedSize),
                kimlandSize: mappedSize
              });
              return true;
            }
            
            // Tentative 2: Match partiel (pour les couleurs composées) - CORRIGÉ
            const partialMatchOption = options.find(opt => 
              opt && opt.trim() && // Vérifier que l'option n'est pas vide
              (normalize(opt).includes(normalize(mappedSize)) || 
               normalize(mappedSize).includes(normalize(opt)))
            );
            
            if (partialMatchOption) {
              shopifyLog.debug('PARTIAL_MATCH_FOUND', {
                shopifyVariantId: v.id,
                partialMatchOption: partialMatchOption,
                kimlandSize: mappedSize
              });
              return true;
            }
            
            // Tentative 3: Match par mots-clés couleur
            const colorMatches = ['rouge', 'bleu', 'vert', 'noir', 'blanc', 'jaune', 'rose', 'violet', 'orange', 'gris', 'marron', 'beige'];
            const kimlandColor = colorMatches.find(color => normalize(mappedSize).includes(color));
            if (kimlandColor) {
              const colorMatch = options.some(opt => normalize(opt).includes(kimlandColor));
              if (colorMatch) {
                shopifyLog.debug('COLOR_MATCH_FOUND', {
                  shopifyVariantId: v.id,
                  colorKeyword: kimlandColor,
                  kimlandSize: mappedSize
                });
                return true;
              }
            }
            
            return false;
          });
          
          if (!shopifyVariant) {
            shopifyLog.debug('NO_VARIANT_MATCH', {
              kimlandSize: mappedSize,
              availableShopifyOptions: shopifyProduct.variants.map(v => ({
                id: v.id,
                options: [v.option1, v.option2, v.option3]
              }))
            });
          }
        }

        if (shopifyVariant) {
          // ✅ MISE À JOUR DU STOCK (jamais créer de variante, jamais remettre à zéro)
          const previousStock = shopifyVariant.inventory_quantity || 0;
          
          shopifyLog.debug('STOCK_UPDATE_PREPARATION', {
            variantId: shopifyVariant.id,
            kimlandStock: kimlandVariant.stock,
            previousStock,
            willUpdate: kimlandVariant.stock !== previousStock
          });
          
          if (kimlandVariant.stock !== previousStock) {
            const inventoryUpdateResult = await shopifyApiService.updateInventoryLevelModern(
              shop,
              accessToken,
              shopifyVariant.id.toString(),
              kimlandVariant.stock
            );
            
            shopifyLog.debug('INVENTORY_UPDATE_RESULT', {
              variantId: shopifyVariant.id,
              targetStock: kimlandVariant.stock,
              previousStock,
              updateSuccess: inventoryUpdateResult?.success || false,
              updateMethod: inventoryUpdateResult?.method || 'unknown',
              updateError: inventoryUpdateResult?.error || null
            });
            
            if (inventoryUpdateResult?.success) {
              shopifyLog.inventorySuccess(shopifyVariant.id.toString(), kimlandVariant.stock);
              updates++;
              
              shopifyLog.debug('STOCK_UPDATED', {
                variantId: shopifyVariant.id,
                from: previousStock,
                to: kimlandVariant.stock,
                kimlandSize: mappedSize,
                method: inventoryUpdateResult.method
              });
            } else {
              errors++;
              shopifyLog.inventoryError(
                shopifyVariant.id.toString(), 
                inventoryUpdateResult?.message || 'Erreur de mise à jour inconnue'
              );
              
              shopifyLog.debug('STOCK_UPDATE_FAILED', {
                variantId: shopifyVariant.id,
                targetStock: kimlandVariant.stock,
                previousStock,
                error: inventoryUpdateResult?.message || 'Inconnue',
                kimlandSize: mappedSize
              });
            }
          } else {
            shopifyLog.debug('STOCK_UNCHANGED', {
              variantId: shopifyVariant.id,
              stock: kimlandVariant.stock,
              kimlandSize: mappedSize
            });
          }
        } else {
          // ⚠️ PAS DE CRÉATION AUTOMATIQUE POUR ÉVITER LES ERREURS
          shopifyLog.variantSkip(mappedSize, 'Variante non trouvée - pas de création auto pour les produits couleur/dimension');
          
          shopifyLog.debug('VARIANT_NOT_FOUND', {
            kimlandSize: mappedSize,
            availableOptions: {
              option1Values: shopifyOptions.option1Values,
              option2Values: shopifyOptions.option2Values,
              option3Values: shopifyOptions.option3Values
            },
            recommendation: 'Créer manuellement la variante dans Shopify si nécessaire'
          });
        }
      } catch (error) {
        errors++;
        shopifyLog.inventoryError('variant-processing', error instanceof Error ? error.message : 'Erreur inconnue');
      }
    }

    return { updates, creates, errors };
  } catch (error) {
    shopifyLog.syncError('updateShopify', error instanceof Error ? error.message : 'Erreur inconnue');
    return null;
  }
}




  logout(): void {
    this.authService.logout();
  }
}

export const kimlandService = new KimlandService();
