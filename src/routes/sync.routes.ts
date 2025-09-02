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
 * Synchronisation d'inventaire en streaming pour tous les produits avec possibilité d'arrêt
 */
router.post('/inventory/all', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  let isCancelled = false;
  let currentIndex = 0;
  
  try {
    const accessToken = req.accessToken!;
    
    // 🎬 Configuration du streaming avec headers corrects
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'X-Accel-Buffering': 'no', // Nginx
      'Transfer-Encoding': 'chunked'
    });
    
    // 📡 Fonction helper pour envoyer des messages
    const sendMessage = (data: any) => {
      if (isCancelled) return; // Ne plus envoyer si annulé
      const message = JSON.stringify(data) + '\n';
      res.write(message);
      // Forcer l'envoi immédiat avec cast pour éviter l'erreur TS
      (res as any).flush?.();
    };
    
    // 📴 Gérer l'arrêt de la synchronisation
    const handleCancellation = () => {
      isCancelled = true;
      logger.info('🚫 Synchronisation annulée par l\'utilisateur', { shop, stoppedAt: currentIndex });
      
      sendMessage({
        type: 'cancelled',
        message: `🚫 Synchronisation arrêtée à l'étape ${currentIndex}`,
        stoppedAt: currentIndex,
        timestamp: new Date().toISOString()
      });
      
      // Fermer proprement la connexion
      setTimeout(() => {
        if (!res.destroyed) {
          res.end();
        }
      }, 100);
    };
    
    // 🎧 Écouter la fermeture de connexion (bouton arrêt côté client)
    res.on('close', () => {
      if (!isCancelled) {
        logger.info('📁 Connexion fermée par le client', { shop, stoppedAt: currentIndex });
        isCancelled = true;
      }
    });
    
    req.on('aborted', () => {
      if (!isCancelled) {
        logger.info('🚫 Requête annulée par le client', { shop, stoppedAt: currentIndex });
        handleCancellation();
      }
    });
    
    // 📋 Récupérer tous les produits avec SKU
    sendMessage({
      type: 'progress',
      message: 'Chargement des produits...',
      current: 0,
      total: 0,
      timestamp: new Date().toISOString()
    });

    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    const productsWithSku = products.filter(p => p.variants?.[0]?.sku);
    
    if (isCancelled) return;
    
    if (productsWithSku.length === 0) {
      sendMessage({
        type: 'complete',
        message: 'Aucun produit avec SKU trouvé',
        successful: 0,
        failed: 0,
        total: 0,
        results: []
      });
      res.end();
      return;
    }
    
    // 📊 Informations initiales
    sendMessage({
      type: 'info',
      message: `${productsWithSku.length} produits trouvés avec SKU`,
      total: productsWithSku.length,
      canCancel: true, // Indiquer que l'annulation est possible
      timestamp: new Date().toISOString()
    });
    
    const syncResults = [];
    let successful = 0;
    let failed = 0;
    const startTime = Date.now();
    
    // 🔄 Synchroniser chaque produit avec feedback détaillé
    for (let i = 0; i < productsWithSku.length; i++) {
      // ⚡ Vérifier l'annulation avant chaque produit
      if (isCancelled) {
        logger.info('🚫 Synchronisation interrompue', { shop, processedProducts: i, totalProducts: productsWithSku.length });
        break;
      }
      
      currentIndex = i;
      const product = productsWithSku[i];
      const sku = product.variants[0].sku!;
      const progress = Math.round(((i + 1) / productsWithSku.length) * 100);
      
      try {
        // 📈 Envoyer le progrès avant traitement
        sendMessage({
          type: 'progress',
          message: `Synchronisation ${sku}...`,
          current: i + 1,
          total: productsWithSku.length,
          percentage: progress,
          sku: sku,
          productName: product.title,
          canCancel: true,
          timestamp: new Date().toISOString()
        });
        
        // 🔄 Synchroniser avec Kimland ET mettre à jour Shopify
        const syncResult = await kimlandService.syncProductInventory(sku, product.id.toString(), shop, accessToken);
        
        // Vérifier l'annulation après l'opération
        if (isCancelled) break;
        
        syncResults.push(syncResult);
        
        if (syncResult.syncStatus === 'success') {
          successful++;
          const kimlandStock = syncResult.kimlandProduct ? 
            syncResult.kimlandProduct.variants.reduce((total, v) => total + v.stock, 0) : 0;
          
          sendMessage({
            type: 'result',
            success: true,
            sku: sku,
            productName: product.title,
            message: `✅ Stock synchronisé: ${kimlandStock} unités`,
            kimlandStock: kimlandStock,
            variantsCount: syncResult.kimlandProduct?.variants.length || 0,
            timestamp: new Date().toISOString()
          });
        } else if (syncResult.syncStatus === 'not_found') {
          failed++;
          sendMessage({
            type: 'result',
            success: false,
            sku: sku,
            productName: product.title,
            message: `⚠️ Produit non trouvé sur Kimland`,
            error: 'not_found',
            timestamp: new Date().toISOString()
          });
        } else {
          failed++;
          sendMessage({
            type: 'result',
            success: false,
            sku: sku,
            productName: product.title,
            message: `❌ ${syncResult.errorMessage || 'Erreur inconnue'}`,
            error: syncResult.errorMessage,
            timestamp: new Date().toISOString()
          });
        }
        
        // ⏱️ Pause entre les produits pour éviter la surcharge ET permettre l'annulation
        if (i < productsWithSku.length - 1 && !isCancelled) {
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        
      } catch (error) {
        if (isCancelled) break;
        
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
        
        sendMessage({
          type: 'result',
          success: false,
          sku: sku,
          productName: product.title,
          message: `💥 Erreur système: ${errorMessage}`,
          error: errorMessage,
          timestamp: new Date().toISOString()
        });
        
        logger.error('Erreur sync produit individuel', { sku, error, shop });
      }
    }
    
    // 📊 Résultat final avec statistiques (si pas annulé)
    if (!isCancelled) {
      const duration = Date.now() - startTime;
      sendMessage({
        type: 'complete',
        message: `🏁 Synchronisation terminée en ${Math.round(duration / 1000)}s`,
        successful,
        failed,
        total: productsWithSku.length,
        duration,
        successRate: Math.round((successful / productsWithSku.length) * 100),
        results: syncResults,
        timestamp: new Date().toISOString()
      });
      
      // 💾 Sauvegarder l'historique
      await saveSyncHistory(shop, {
        date: new Date(),
        successful,
        failed,
        total: productsWithSku.length,
        status: failed === 0 ? 'completed' : 'partial',
        duration,
        results: syncResults
      });
    } else {
      // Sauvegarder comme annulé
      const duration = Date.now() - startTime;
      await saveSyncHistory(shop, {
        date: new Date(),
        successful,
        failed,
        total: currentIndex,
        status: 'cancelled',
        duration,
        results: syncResults
      });
      
      logger.info('🚫 Synchronisation annulée sauvegardée', {
        shop,
        processedProducts: currentIndex,
        successful,
        failed,
        duration: Math.round(duration / 1000)
      });
    }
    
    res.end();
    
  } catch (error) {
    if (!isCancelled) {
      logger.error('Erreur sync streaming', { error, shop });
      
      res.write(JSON.stringify({
        type: 'error',
        message: 'Erreur critique lors de la synchronisation',
        error: error instanceof Error ? error.message : 'Erreur inconnue',
        timestamp: new Date().toISOString()
      }) + '\n');
    }
    
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
  status: 'completed' | 'partial' | 'failed' | 'cancelled'; // Ajout du statut 'cancelled'
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