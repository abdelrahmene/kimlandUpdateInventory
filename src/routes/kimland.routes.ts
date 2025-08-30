import { Router, Request, Response } from 'express';
import { kimlandService } from '../services/kimland/kimland.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * Vérifier le statut de connexion Kimland
 */
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
  try {
    const isConnected = await kimlandService.checkConnection();
    
    res.json({
      connected: isConnected,
      url: 'https://kimland.dz',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Erreur vérification statut Kimland', { error });
    res.json({
      connected: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      url: 'https://kimland.dz',
      timestamp: new Date().toISOString()
    });
  }
}));

/**
 * Tester la connexion Kimland
 */
router.post('/test', asyncHandler(async (req: Request, res: Response) => {
  try {
    const testResult = await kimlandService.testConnection();
    
    if (testResult.success) {
      res.json({
        success: true,
        message: 'Connexion Kimland réussie',
        details: testResult.details
      });
    } else {
      res.json({
        success: false,
        error: testResult.error,
        details: testResult.details
      });
    }
    
  } catch (error) {
    logger.error('Erreur test connexion Kimland', { error });
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur de test de connexion'
    });
  }
}));

/**
 * Vider la session Kimland
 */
router.post('/clear-session', asyncHandler(async (req: Request, res: Response) => {
  try {
    await kimlandService.clearSession();
    
    res.json({
      success: true,
      message: 'Session Kimland vidée avec succès'
    });
    
  } catch (error) {
    logger.error('Erreur vidage session Kimland', { error });
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors du vidage de session'
    });
  }
}));

/**
 * Rechercher un produit par SKU sur Kimland
 */
router.get('/product/:sku', asyncHandler(async (req: Request, res: Response) => {
  const sku = req.params.sku;
  
  try {
    const productInfo = await kimlandService.getProductInfo(sku);
    
    if (productInfo.found) {
      res.json({
        success: true,
        product: productInfo
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Produit non trouvé sur Kimland',
        sku
      });
    }
    
  } catch (error) {
    logger.error('Erreur recherche produit Kimland', { error, sku });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la recherche'
    });
  }
}));

/**
 * Obtenir les informations de stock d'un produit
 */
router.get('/stock/:sku', asyncHandler(async (req: Request, res: Response) => {
  const sku = req.params.sku;
  
  try {
    const stockInfo = await kimlandService.getStock(sku);
    
    res.json({
      success: true,
      sku,
      stock: stockInfo.quantity,
      available: stockInfo.available,
      lastUpdate: stockInfo.lastUpdate
    });
    
  } catch (error) {
    logger.error('Erreur récupération stock Kimland', { error, sku });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la récupération du stock'
    });
  }
}));

/**
 * Synchroniser manuellement un produit spécifique
 */
router.post('/sync-product/:sku', asyncHandler(async (req: Request, res: Response) => {
  const sku = req.params.sku;
  const { shopifyProductId } = req.body;
  
  try {
    const syncResult = await kimlandService.syncProductInventory(sku, shopifyProductId);
    
    res.json({
      success: syncResult.syncStatus === 'success',
      sku,
      syncResult
    });
    
  } catch (error) {
    logger.error('Erreur sync produit manuel Kimland', { error, sku });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la synchronisation'
    });
  }
}));

/**
 * Obtenir les statistiques de la session Kimland
 */
router.get('/session-stats', asyncHandler(async (req: Request, res: Response) => {
  try {
    const stats = await kimlandService.getSessionStats();
    
    res.json({
      success: true,
      stats
    });
    
  } catch (error) {
    logger.error('Erreur stats session Kimland', { error });
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la récupération des statistiques'
    });
  }
}));

/**
 * Forcer une nouvelle authentification Kimland
 */
router.post('/force-login', asyncHandler(async (req: Request, res: Response) => {
  try {
    const loginResult = await kimlandService.forceLogin();
    
    if (loginResult.success) {
      res.json({
        success: true,
        message: 'Authentification Kimland réussie'
      });
    } else {
      res.json({
        success: false,
        error: loginResult.error
      });
    }
    
  } catch (error) {
    logger.error('Erreur force login Kimland', { error });
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de l\'authentification'
    });
  }
}));

export { router as kimlandRoutes };