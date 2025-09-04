import axios from 'axios';
import { config } from '../config';
import { ShopifyProduct, ProcessedProduct, ProcessedVariant } from '../types';
import { logger } from '../utils/logger';
import { UrlUtils } from '../utils/helpers';
import { ReferenceExtractor } from '../utils/reference-extractor';
import { shopifyLog } from '../utils/shopify-logger';

export class ShopifyApiService {
  findOrCreateMetaobject(shop: string, accessToken: string, size: string) {
    throw new Error('Method not implemented.');
  }
  graphql(shop: string, accessToken: string, mutation: string, variables: { input: { id: string; variants: { inventoryQuantity: number; inventoryManagement: string; inventoryPolicy: string; options: { name: string; optionValues: { linkedMetafieldValue: any; }[]; }[]; }[]; }; }) {
    throw new Error('Method not implemented.');
  }
  /**
   * Met à jour le SKU d'une variante
   */
  public async updateVariantSku(shop: string, accessToken: string, variantId: string, sku: string): Promise<any> {
    const url = UrlUtils.buildApiUrl(shop, `variants/${variantId}.json`);
    const payload = {
      variant: {
        id: variantId,
        sku: sku
      }
    };
    
    shopifyLog.apiRequest('PUT', url, payload);
    
    try {
      const response = await axios.put(url, payload, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      shopifyLog.apiResponse('PUT', url, response.status, true, response.data?.variant);
      shopifyLog.skuUpdate(variantId, 'previous', sku, true);
      
      logger.info('✅ SKU mis à jour', { shop, variantId, sku });
      return response.data?.variant || null;
    } catch (error: any) {
      shopifyLog.apiError('PUT', url, error);
      shopifyLog.skuUpdate(variantId, 'previous', sku, false);
      
      logger.error('❌ Erreur updateVariantSku', { shop, variantId, sku, error });
      throw error;
    }
  }
  /**
   * Échange le code OAuth contre un access token
   */
  public async exchangeCodeForToken(shop: string, code: string): Promise<string> {
    // URL directe sans version API pour OAuth
    const url = `https://${shop}/admin/oauth/access_token`;
    
    logger.info('🔄 Début échange code OAuth', { shop, code: code.substring(0, 10) + '...', url });
    
    try {
      // Utiliser URLSearchParams pour form-urlencoded
      const params = new URLSearchParams({
        client_id: config.shopify.apiKey,
        client_secret: config.shopify.apiSecret,
        code: code,
      });
      
      logger.info('📤 Données de requête OAuth', { 
        url, 
        client_id: config.shopify.apiKey,
        client_secret: config.shopify.apiSecret.substring(0, 8) + '...',
        codeLength: code.length
      });
      
      const response = await axios.post(url, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      logger.info('✅ Réponse OAuth reçue', { 
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        hasAccessToken: !!response.data?.access_token,
        responseData: response.data
      });

      if (!response.data?.access_token) {
        logger.error('❌ Access token manquant dans la réponse', {
          responseData: response.data,
          responseType: typeof response.data,
          keys: response.data ? Object.keys(response.data) : []
        });
        throw new Error('Access token non reçu dans la réponse');
      }

      logger.info('✅ Access token obtenu avec succès', { 
        shop, 
        tokenLength: response.data.access_token.length 
      });

      return response.data.access_token;
    } catch (error: any) {
      logger.error('❌ Erreur lors de l\'échange du code OAuth', {
        shop,
        url,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        responseHeaders: error.response?.headers,
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Échec de l'échange du code OAuth: ${error.response?.data?.error || error.response?.statusText || error.message}`);
    }
  }

  /**
   * Récupère les informations du shop
   */
  public async getShopInfo(shop: string, accessToken: string): Promise<any> {
    const url = UrlUtils.buildApiUrl(shop, 'shop.json');
    
    logger.info('🏪 Récupération infos boutique', { shop, url, tokenLength: accessToken.length });
    
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      logger.info('✅ Infos boutique récupérées', { 
        status: response.status,
        shopData: response.data?.shop ? {
          id: response.data.shop.id,
          name: response.data.shop.name,
          domain: response.data.shop.domain
        } : null
      });

      return response.data?.shop || null;
    } catch (error: any) {
      logger.error('❌ Erreur lors de la récupération des infos shop', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        shop,
      });
      return null;
    }
  }

  /**
   * Teste la validité d'un access token
   */
  public async testConnection(shop: string, accessToken: string): Promise<boolean> {
    try {
      const shopInfo = await this.getShopInfo(shop, accessToken);
      return shopInfo !== null;
    } catch (error) {
      logger.error('Erreur lors du test de connexion', { shop, error });
      return false;
    }
  }

  /**
   * Récupère une page de produits avec pagination cursor-based
   */
  public async getProductsPage(
    shop: string, 
    accessToken: string, 
    options: {
      limit?: number;
      search?: string;
      pageInfo?: string;
    } = {}
  ): Promise<{ products: ShopifyProduct[]; nextPageInfo?: string } | null> {
    const { limit = 50, search, pageInfo } = options;
    
    const params = new URLSearchParams({
      limit: limit.toString()
    });
    
    if (search) {
      params.append('title', search);
    }
    
    if (pageInfo) {
      params.append('page_info', pageInfo);
    }

    const url = UrlUtils.buildApiUrl(shop, `products.json?${params.toString()}`);
    
    logger.info('🌐 getProductsPage appel API', {
      shop,
      url,
      accessTokenLength: accessToken?.length || 0,
      params: params.toString()
    });
    
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
          'User-Agent': 'KimlandApp/1.0',
        },
        timeout: 50000,
      });

      const data = response.data;
      
      // Extraire l'info de pagination depuis les headers Link
      let nextPageInfo: string | undefined;
      const linkHeader = response.headers.link;
      if (linkHeader) {
        const nextMatch = linkHeader.match(/<([^>]+)>; rel="next"/);
        if (nextMatch) {
          const nextUrl = new URL(nextMatch[1]);
          nextPageInfo = nextUrl.searchParams.get('page_info') || undefined;
        }
      }

      logger.debug('Produits récupérés', {
        shop,
        count: data.products.length,
        hasNext: !!nextPageInfo,
        firstProductStatus: data.products[0]?.status,
        allStatuses: data.products.map(p => p.status)
      });

      return {
        products: data.products,
        nextPageInfo,
      };
    } catch (error: any) {
      const errorDetails = {
        shop,
        url,
        error: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        responseHeaders: error.response?.headers,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      };
      
      logger.error('❌ Erreur getProductsPage - DÉTAILS COMPLETS', errorDetails);
      throw error; // Re-throw l'erreur au lieu de retourner null
    }
  }

  /**
   * Récupère les produits avec pagination simple (pour compatibilité)
   */
  public async getProducts(
    shop: string, 
    accessToken: string, 
    options: { page?: number; limit?: number; search?: string } = {}
  ): Promise<ShopifyProduct[]> {
    const { page = 1, limit = 50, search } = options;
    
    logger.info('📡 getProducts appelé', { 
      shop, 
      accessTokenLength: accessToken?.length || 0, 
      options 
    });
    
    try {
      const result = await this.getProductsPage(shop, accessToken, { 
        limit, 
        search 
      });
      
      logger.info('📦 getProducts résultat', { 
        shop, 
        productsCount: result?.products?.length || 0,
        hasResult: !!result
      });
      
      return result?.products || [];
    } catch (error) {
      logger.error('❌ Erreur getProducts - DÉTAILS', { 
        shop, 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : 'Unknown',
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
      });
      throw error; // Re-throw pour que l'API route puisse la gérer
    }
  }

  /**
   * Récupère TOUS les produits (toutes les pages)
   */
  public async getAllProducts(shop: string, accessToken: string): Promise<ShopifyProduct[]> {
    const allProducts: ShopifyProduct[] = [];
    let pageInfo: string | undefined;
    let pageCount = 0;
    
    try {
      do {
        const result = await this.getProductsPage(shop, accessToken, { 
          limit: 250, // Max Shopify autorise
          pageInfo 
        });
        
        if (!result) break;
        
        allProducts.push(...result.products);
        pageInfo = result.nextPageInfo;
        pageCount++;
        
        // Sécurité - max 100 pages
        if (pageCount > 100) {
          logger.warn('Limite de pages atteinte', { shop, pageCount });
          break;
        }
        
      } while (pageInfo);
      
      logger.info('Tous les produits récupérés', { 
        shop, 
        total: allProducts.length, 
        pages: pageCount 
      });
      
      return allProducts;
    } catch (error) {
      logger.error('Erreur getAllProducts', { shop, error });
      return allProducts; // Retourner ce qu'on a pu récupérer
    }
  }

  /**
   * Récupère un produit spécifique
   */
  public async getProduct(shop: string, accessToken: string, productId: string): Promise<ShopifyProduct | null> {
    const url = UrlUtils.buildApiUrl(shop, `products/${productId}.json`);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      return response.data?.product || null;
    } catch (error: any) {
      logger.error('Erreur getProduct', { shop, productId, error });
      return null;
    }
  }

  /**
   * Met à jour l'inventaire avec gestion des erreurs de permissions - VERSION CORRIGÉE
   */
  public async updateInventoryLevelModern(shop: string, accessToken: string, variantId: string, quantity: number): Promise<any> {
    shopifyLog.debug('INVENTORY_UPDATE_START_MODERN', { shop, variantId, quantity });
    
    try {
      // MÉTHODE 1 : API moderne avec locations (meilleure mais nécessite permissions)
      const modernResult = await this.tryModernInventoryUpdate(shop, accessToken, variantId, quantity);
      
      shopifyLog.debug('MODERN_INVENTORY_SUCCESS', { variantId, quantity, method: 'modern' });
      logger.info('✅ Inventaire mis à jour avec API moderne', { shop, variantId, quantity });
      
      return { success: true, method: 'modern', data: modernResult };
      
    } catch (modernError: any) {
      shopifyLog.debug('MODERN_INVENTORY_FAILED', { 
        variantId, 
        error: modernError.message,
        status: modernError.response?.status 
      });
      
      if (modernError.response?.status === 403 || modernError.message?.includes('read_locations')) {
        logger.warn('⚠️ Permission read_locations manquante, basculement vers API legacy', { shop, variantId });
        
        try {
          // MÉTHODE 2 : API legacy directe (plus simple)
          const legacyResult = await this.updateVariantInventoryDirect(shop, accessToken, variantId, quantity);
          
          shopifyLog.debug('LEGACY_INVENTORY_SUCCESS', { variantId, quantity, method: 'legacy' });
          logger.info('✅ Inventaire mis à jour avec API legacy', { shop, variantId, quantity });
          
          return { success: true, method: 'legacy', data: legacyResult };
          
        } catch (legacyError: any) {
          shopifyLog.debug('LEGACY_INVENTORY_FAILED', { 
            variantId, 
            legacyError: legacyError.message,
            status: legacyError.response?.status 
          });
          
          logger.error('❌ Toutes les méthodes de mise à jour ont échoué', { 
            shop, 
            variantId, 
            quantity,
            modernError: modernError.message,
            legacyError: legacyError.message
          });
          
          // MÉTHODE 3 : Retourner une erreur informative
          return {
            success: false,
            error: 'all_methods_failed',
            message: `Impossible de mettre à jour l'inventaire. Moderne: ${modernError.message}, Legacy: ${legacyError.message}`,
            modernError: modernError.message,
            legacyError: legacyError.message,
            variantId,
            quantity
          };
        }
      } else {
        // Autre erreur que les permissions - la propager
        logger.error('❌ Erreur inattendue lors de la mise à jour moderne', { 
          shop, 
          variantId, 
          error: modernError.message 
        });
        
        return {
          success: false,
          error: 'modern_api_error',
          message: modernError.message,
          variantId,
          quantity
        };
      }
    }
  }

  /**
   * Méthode moderne avec locations API
   */
  private async tryModernInventoryUpdate(shop: string, accessToken: string, variantId: string, quantity: number): Promise<any> {
    // 1. Récupérer l'inventory_item_id depuis le variant
    const variantUrl = UrlUtils.buildApiUrl(shop, `variants/${variantId}.json`);
    
    shopifyLog.apiRequest('GET', variantUrl);
    shopifyLog.debug('INVENTORY_UPDATE_START', { variantId, quantity });
    
    const variantResponse = await axios.get(variantUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    
    shopifyLog.apiResponse('GET', variantUrl, variantResponse.status, true, variantResponse.data?.variant);
    
    const variant = variantResponse.data.variant;
    const inventoryItemId = variant.inventory_item_id;
    
    shopifyLog.debug('VARIANT_INFO', { variantId, inventoryItemId, currentStock: variant.inventory_quantity });
    
    if (!inventoryItemId) {
      throw new Error('Inventory item ID manquant');
    }
    
    // 2. Récupérer les locations (peut échouer avec 403)
    const locationsUrl = UrlUtils.buildApiUrl(shop, 'locations.json');
    
    shopifyLog.apiRequest('GET', locationsUrl);
    
    const locationsResponse = await axios.get(locationsUrl, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    
    shopifyLog.apiResponse('GET', locationsUrl, locationsResponse.status, true, {
      locationsCount: locationsResponse.data.locations?.length
    });
    
    const locations = locationsResponse.data.locations;
    const primaryLocation = locations.find(loc => loc.primary) || locations[0];
    
    shopifyLog.debug('LOCATION_INFO', { 
      totalLocations: locations.length,
      primaryLocationId: primaryLocation?.id,
      primaryLocationName: primaryLocation?.name
    });
    
    if (!primaryLocation) {
      throw new Error('Aucune location trouvée');
    }
    
    // 3. Mettre à jour l'inventaire
    const inventoryUrl = UrlUtils.buildApiUrl(shop, 'inventory_levels/set.json');
    const inventoryPayload = {
      inventory_item_id: inventoryItemId,
      location_id: primaryLocation.id,
      available: quantity
    };
    
    shopifyLog.apiRequest('POST', inventoryUrl, inventoryPayload);
    
    logger.info('🔄 Mise à jour inventaire moderne', { 
      shop, 
      variantId, 
      inventoryItemId, 
      locationId: primaryLocation.id, 
      quantity 
    });
    
    const response = await axios.post(inventoryUrl, inventoryPayload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    
    shopifyLog.apiResponse('POST', inventoryUrl, response.status, true, response.data?.inventory_level);
    shopifyLog.debug('INVENTORY_UPDATE_SUCCESS', { 
      variantId, 
      inventoryItemId,
      locationId: primaryLocation.id,
      newQuantity: quantity,
      responseData: response.data?.inventory_level
    });
    
    logger.info('✅ Inventaire mis à jour avec API moderne', { 
      shop, 
      variantId, 
      quantity 
    });
    
    return response.data?.inventory_level || null;
  }

  /**
   * Méthode directe de mise à jour variant (API legacy)
   */
  private async updateVariantInventoryDirect(shop: string, accessToken: string, variantId: string, quantity: number): Promise<any> {
    const url = UrlUtils.buildApiUrl(shop, `variants/${variantId}.json`);
    const payload = {
      variant: {
        id: variantId,
        inventory_quantity: quantity,
        inventory_management: 'shopify',
        inventory_policy: 'deny'
      }
    };
    
    shopifyLog.apiRequest('PUT', url, payload);
    shopifyLog.debug('LEGACY_INVENTORY_UPDATE', { variantId, quantity });
    
    const response = await axios.put(url, payload, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
    
    shopifyLog.apiResponse('PUT', url, response.status, true, response.data?.variant);
    logger.info('✅ Inventaire mis à jour avec API legacy', { shop, variantId, quantity });
    
    return { success: true, method: 'legacy', variant: response.data?.variant };
  }
  public async updateInventoryLevel(shop: string, accessToken: string, inventoryItemId: string, locationId: string, quantity: number): Promise<any> {
    const url = UrlUtils.buildApiUrl(shop, 'inventory_levels/set.json');
    
    logger.info('🔄 Mise à jour inventaire (nouvelle API)', { shop, inventoryItemId, locationId, quantity });
    
    try {
      const response = await axios.post(url, {
        inventory_item_id: inventoryItemId,
        location_id: locationId,
        available: quantity
      }, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      logger.info('✅ Inventaire mis à jour (nouvelle API)', { shop, inventoryItemId, quantity });
      return response.data?.inventory_level || null;
    } catch (error: any) {
      logger.error('❌ Erreur updateInventoryLevel', { shop, inventoryItemId, quantity, error: error.message });
      throw error;
    }
  }

  /**
   * Récupère les locations de la boutique
   */
  public async getLocations(shop: string, accessToken: string): Promise<any[]> {
    const url = UrlUtils.buildApiUrl(shop, 'locations.json');
    
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      logger.info('🏢 Locations récupérées', { shop, count: response.data?.locations?.length || 0 });
      return response.data?.locations || [];
    } catch (error: any) {
      logger.error('❌ Erreur getLocations', { shop, error: error.message });
      return [];
    }
  }
  public async updateVariantInventory(shop: string, accessToken: string, variantId: string, quantity: number): Promise<any> {
    // Utiliser la nouvelle méthode avec gestion d'erreurs
    return await this.updateInventoryLevelModern(shop, accessToken, variantId, quantity);
  }

  /**
   * Crée un nouveau variant pour un produit
   */
  public async createVariant(shop: string, accessToken: string, productId: string, variantData: {
    option1?: string;
    option2?: string;
    option3?: string;
    inventory_quantity?: number;
    inventory_management?: string;
    inventory_policy?: string;
  }): Promise<any> {
    const url = UrlUtils.buildApiUrl(shop, `products/${productId}/variants.json`);
    const payload = { variant: variantData };
    
    shopifyLog.apiRequest('POST', url, payload);
    shopifyLog.debug('CREATE_VARIANT_START', { productId, variantData });
    
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      shopifyLog.apiResponse('POST', url, response.status, true, response.data?.variant);
      shopifyLog.debug('CREATE_VARIANT_SUCCESS', { 
        productId, 
        newVariantId: response.data?.variant?.id,
        option1: response.data?.variant?.option1 
      });
      
      logger.info('✅ Variant créé', { shop, productId, variantId: response.data?.variant?.id });
      return response.data?.variant || null;
    } catch (error: any) {
      shopifyLog.apiError('POST', url, error);
      shopifyLog.debug('CREATE_VARIANT_FAILED', { productId, variantData, error: error.message });
      
      logger.error('❌ Erreur createVariant', { shop, productId, variantData, error: error.message });
      throw error;
    }
        return null; // on ne crée rien

  }

  /**
   * Récupère une commande spécifique
   */
  public async getOrder(shop: string, orderId: string, accessToken?: string): Promise<any | null> {
    // Si pas d'accessToken fourni, on assume que c'est un appel interne
    if (!accessToken) {
      logger.warn('getOrder appelé sans accessToken', { shop, orderId });
      return null;
    }

    const url = UrlUtils.buildApiUrl(shop, `orders/${orderId}.json`);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      return response.data?.order || null;
    } catch (error: any) {
      logger.error('Erreur getOrder', { shop, orderId, error: error.message });
      return null;
    }
  }

  /**
   * Récupère les commandes avec options de filtrage
   */
  public async getOrders(shop: string, options: {
    status?: string;
    created_at_min?: string;
    created_at_max?: string;
    limit?: number;
    page?: number;
  } = {}, accessToken?: string): Promise<any[]> {
    // Si pas d'accessToken fourni, on assume que c'est un appel interne
    if (!accessToken) {
      logger.warn('getOrders appelé sans accessToken', { shop, options });
      return [];
    }

    const { status = 'any', limit = 50, page = 1, ...otherOptions } = options;
    
    const params = new URLSearchParams({
      status,
      limit: limit.toString(),
      page: page.toString(),
      ...Object.fromEntries(
        Object.entries(otherOptions).filter(([_, value]) => value !== undefined)
      )
    });

    const url = UrlUtils.buildApiUrl(shop, `orders.json?${params.toString()}`);
    
    try {
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });
      
      logger.info('Commandes récupérées', { 
        shop, 
        count: response.data?.orders?.length || 0,
        options 
      });
      
      return response.data?.orders || [];
    } catch (error: any) {
      logger.error('Erreur getOrders', { shop, options, error: error.message });
      return [];
    }
  }

  /**
   * Traite un produit Shopify en produit avec référence extraite
   */
  public processProduct(product: ShopifyProduct): ProcessedProduct {
    // Extraire la référence depuis la description
    const reference = ReferenceExtractor.extractFromDescription(product.body_html);
    
    // Traiter les variantes
    const variants: ProcessedVariant[] = product.variants.map(variant => ({
      id: variant.id,
      title: variant.title !== 'Default Title' ? variant.title : 'Standard',
      sku: variant.sku || '',
      price: variant.price || '0.00',
      inventory_quantity: variant.inventory_quantity || 0,
    }));

    // Calculer le stock total
    const totalInventory = variants.reduce(
      (sum, variant) => sum + variant.inventory_quantity, 
      0
    );

    // Créer le résumé d'affichage
    let displaySummary = product.title;
    if (reference) {
      displaySummary += ` : ${reference}`;
    }
    displaySummary += ` : {${variants.map(v => 
      `${v.title}: ${v.inventory_quantity}`
    ).join(', ')}}`;

    return {
      id: product.id,
      title: product.title,
      reference: reference || undefined,
      body_html: product.body_html,
      vendor: product.vendor,
      product_type: product.product_type,
      variants,
      total_inventory: totalInventory,
      variants_count: variants.length,
      display_summary: displaySummary,
      has_ref: !!reference && ReferenceExtractor.isValidReference(reference),
      total_stock: totalInventory,
    };
  }
}

export const shopifyApiService = new ShopifyApiService();
