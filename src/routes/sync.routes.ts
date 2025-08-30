import { Router, Request, Response } from 'express';
import { requireAuth, validateShop } from '../middleware/auth.middleware';
import { shopifyApiService } from '../services/shopify-api.service';
import { kimlandService } from '../services/kimland/kimland.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * Synchronisation d'inventaire pour un produit individuel
 */
router.post('/product/:id', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const productId = req.params.id;
  
  // 🐛 DEBUG: Vérifier les paramètres de la route
  logger.info('🔍 DEBUG route sync produit', {
    shop,
    productId,
    hasAccessToken: !!req.accessToken,
    accessTokenLength: req.accessToken?.length,
    queryParams: req.query
  });
  
  try {
    const accessToken = req.accessToken!;
    
    // 🐛 DEBUG: Afficher l'access token
    console.log('AccessToken pour', shop + ':', accessToken);
    logger.info('🔑 Access Token Debug', { shop, accessToken });
    
    // Récupérer le produit Shopify pour obtenir le SKU
    logger.info('📦 Récupération produit Shopify', { productId });
    const shopifyProduct = await shopifyApiService.getProduct(shop, accessToken, productId);
    
    if (!shopifyProduct || !shopifyProduct.variants?.[0]?.sku) {
      return res.status(400).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND',
        message: 'Produit non trouvé ou SKU manquant'
      });
    }
    
    const sku = shopifyProduct.variants[0].sku;
    logger.info('🔍 SKU trouvé', { productId, sku });
    
    // 🐛 DEBUG: Avant appel syncProductInventory
    logger.info('🐛 DEBUG avant syncProductInventory', {
      sku,
      productId,
      shop,
      accessTokenLength: accessToken?.length
    });
    
    // Synchroniser avec Kimland ET mettre à jour Shopify
    const syncResult = await kimlandService.syncProductInventory(sku, productId, shop, accessToken);
    
    if (syncResult.syncStatus === 'success') {
      const kimlandStock = syncResult.kimlandProduct ? 
        syncResult.kimlandProduct.variants.reduce((total, v) => total + v.stock, 0) : 0;
      
      logger.info('✅ Sync produit réussie', {
        productId,
        sku,
        kimlandStock,
        variantsCount: syncResult.kimlandProduct?.variants.length || 0
      });
      
      res.json({
        success: true,
        productId,
        sku,
        syncResult: {
          kimlandProduct: syncResult.kimlandProduct,
          totalStock: kimlandStock,
          variantsUpdated: syncResult.kimlandProduct?.variants.length || 0
        }
      });
      
    } else if (syncResult.syncStatus === 'not_found') {
      logger.warn('⚠️ Produit non trouvé sur Kimland', { productId, sku });
      
      res.status(404).json({
        success: false,
        error: 'PRODUCT_NOT_FOUND_KIMLAND',
        message: `Produit ${sku} non trouvé sur Kimland`,
        productId,
        sku
      });
      
    } else {
      logger.error('❌ Erreur sync produit', { productId, sku, error: syncResult.errorMessage });
      
      res.status(500).json({
        success: false,
        error: 'SYNC_ERROR',
        message: syncResult.errorMessage || 'Erreur de synchronisation',
        productId,
        sku
      });
    }
    
  } catch (error) {
    logger.error('❌ Erreur route sync produit', { productId, error });
    
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: 'Erreur interne du serveur'
    });
  }
}));

/**
 * Synchronisation d'inventaire en streaming pour tous les produits
 */
router.post('/inventory/all', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  try {
    const accessToken = req.accessToken!;
    
    // Configuration du streaming
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    // Récupérer tous les produits avec SKU
    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    const productsWithSku = products.filter(p => p.variants?.[0]?.sku);
    
    if (productsWithSku.length === 0) {
      res.write(JSON.stringify({
        type: 'complete',
        message: 'Aucun produit avec SKU trouvé',
        successful: 0,
        failed: 0,
        results: []
      }) + '\n');
      res.end();
      return;
    }
    
    // Envoyer le progrès initial
    res.write(JSON.stringify({
      type: 'progress',
      message: 'Initialisation...',
      current: 0,
      total: productsWithSku.length
    }) + '\n');
    
    const syncResults = [];
    let successful = 0;
    let failed = 0;
    
    // Synchroniser chaque produit
    for (let i = 0; i < productsWithSku.length; i++) {
      const product = productsWithSku[i];
      const sku = product.variants[0].sku!;
      
      try {
        // Envoyer le progrès
        res.write(JSON.stringify({
          type: 'progress',
          message: `Synchronisation ${sku}...`,
          current: i + 1,
          total: productsWithSku.length
        }) + '\n');
        
        // Synchroniser avec Kimland ET mettre à jour Shopify
        const syncResult = await kimlandService.syncProductInventory(sku, product.id.toString(), shop, accessToken);
        syncResults.push(syncResult);
        
        if (syncResult.syncStatus === 'success') {
          successful++;
          const kimlandStock = syncResult.kimlandProduct ? 
            syncResult.kimlandProduct.variants.reduce((total, v) => total + v.stock, 0) : 0;
          res.write(JSON.stringify({
            type: 'result',
            success: true,
            sku: sku,
            message: `Stock trouvé sur Kimland: ${kimlandStock}`,
            kimlandStock: kimlandStock
          }) + '\n');
        } else {
          failed++;
          res.write(JSON.stringify({
            type: 'result',
            success: false,
            sku: sku,
            message: syncResult.errorMessage || 'Erreur de synchronisation'
          }) + '\n');
        }
        
        // Pause pour éviter la surcharge
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        
        res.write(JSON.stringify({
          type: 'result',
          success: false,
          sku: sku,
          message: errorMessage
        }) + '\n');
        
        logger.error('Erreur sync produit individuel', { sku, error, shop });
      }
    }
    
    // Envoyer le résultat final
    res.write(JSON.stringify({
      type: 'complete',
      message: `Synchronisation terminée: ${successful} réussies, ${failed} échecs`,
      successful,
      failed,
      results: syncResults
    }) + '\n');
    
    // Sauvegarder l'historique
    await saveSyncHistory(shop, {
      date: new Date(),
      successful,
      failed,
      total: productsWithSku.length,
      status: failed === 0 ? 'completed' : 'partial',
      results: syncResults
    });
    
    res.end();
    
  } catch (error) {
    logger.error('Erreur sync streaming', { error, shop });
    
    res.write(JSON.stringify({
      type: 'error',
      message: 'Erreur lors de la synchronisation'
    }) + '\n');
    res.end();
  }
}));

/**
 * Récupérer l'historique des synchronisations
 */
router.get('/history', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const limit = parseInt(req.query.limit as string) || 10;
  
  try {
    const history = await getSyncHistory(shop, limit);
    
    res.json({
      success: true,
      history: history.map(entry => ({
        date: entry.date,
        successful: entry.successful,
        failed: entry.failed,
        total: entry.total,
        status: entry.status,
        duration: entry.duration || 0
      }))
    });
    
  } catch (error) {
    logger.error('Erreur récupération historique', { error, shop });
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'historique' });
  }
}));

/**
 * Vider l'historique des synchronisations
 */
router.delete('/history', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  try {
    await clearSyncHistory(shop);
    
    res.json({
      success: true,
      message: 'Historique vidé avec succès'
    });
    
  } catch (error) {
    logger.error('Erreur vidage historique', { error, shop });
    res.status(500).json({ error: 'Erreur lors du vidage de l\'historique' });
  }
}));

/**
 * Obtenir les statistiques de synchronisation
 */
router.get('/stats', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  try {
    const history = await getSyncHistory(shop, 50);
    
    const stats = {
      totalSyncs: history.length,
      totalSuccessful: history.reduce((sum, entry) => sum + entry.successful, 0),
      totalFailed: history.reduce((sum, entry) => sum + entry.failed, 0),
      lastSync: history.length > 0 ? history[0].date : null,
      averageSuccessRate: history.length > 0 
        ? Math.round((history.reduce((sum, entry) => sum + (entry.successful / entry.total), 0) / history.length) * 100)
        : 0
    };
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    logger.error('Erreur stats sync', { error, shop });
    res.status(500).json({ error: 'Erreur lors de la récupération des statistiques' });
  }
}));

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

interface SyncHistoryEntry {
  date: Date;
  successful: number;
  failed: number;
  total: number;
  status: 'completed' | 'partial' | 'failed';
  duration?: number;
  results: any[];
}

const syncHistoryStore = new Map<string, SyncHistoryEntry[]>();

/**
 * Sauvegarder une entrée d'historique
 */
async function saveSyncHistory(shop: string, entry: SyncHistoryEntry): Promise<void> {
  try {
    if (!syncHistoryStore.has(shop)) {
      syncHistoryStore.set(shop, []);
    }
    
    const shopHistory = syncHistoryStore.get(shop)!;
    shopHistory.unshift(entry); // Ajouter au début
    
    // Garder seulement les 50 dernières entrées
    if (shopHistory.length > 50) {
      shopHistory.splice(50);
    }
    
    logger.info('Historique sync sauvegardé', { 
      shop, 
      successful: entry.successful, 
      failed: entry.failed 
    });
    
  } catch (error) {
    logger.error('Erreur sauvegarde historique', { error, shop });
  }
}

/**
 * Récupérer l'historique des synchronisations
 */
async function getSyncHistory(shop: string, limit: number = 10): Promise<SyncHistoryEntry[]> {
  const shopHistory = syncHistoryStore.get(shop) || [];
  return shopHistory.slice(0, limit);
}

/**
 * Vider l'historique d'une boutique
 */
async function clearSyncHistory(shop: string): Promise<void> {
  syncHistoryStore.delete(shop);
  logger.info('Historique sync vidé', { shop });
}

/**
 * Debug: Récupérer stock d'un produit par SKU
 */
router.get('/debug/stock/:sku', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const sku = req.params.sku;
  const accessToken = req.accessToken!;
  
  logger.info('🔍 DEBUG Stock Request', { shop, sku, accessToken });
  
  try {
    // Récupérer tous les produits et chercher le SKU
    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    const product = products.find(p => p.variants?.some(v => v.sku === sku));
    
    if (!product) {
      return res.json({
        success: false,
        error: 'Produit non trouvé',
        sku,
        accessToken
      });
    }
    
    const variant = product.variants.find(v => v.sku === sku);
    
    res.json({
      success: true,
      sku,
      accessToken,
      product: {
        id: product.id,
        title: product.title,
        variants: product.variants.map(v => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          inventory_quantity: v.inventory_quantity,
          option1: v.option1
        }))
      },
      targetVariant: variant ? {
        id: variant.id,
        sku: variant.sku,
        inventory_quantity: variant.inventory_quantity,
        option1: variant.option1
      } : null
    });
    
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      sku,
      accessToken
    });
  }
}));

export { router as syncRoutes };