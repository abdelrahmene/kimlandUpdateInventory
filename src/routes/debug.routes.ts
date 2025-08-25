import { Router, Request, Response } from 'express';
import { memoryStorage } from '../storage/memory-storage.service';
import { firebaseService } from '../services/firebase.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Debug - Affiche les données stockées
 */
router.get('/storage', (req: Request, res: Response) => {
  const stats = memoryStorage.getStats();
  const shops = memoryStorage.getConnectedShops();
  
  res.json({
    success: true,
    storage: 'memory',
    stats,
    shops,
    timestamp: new Date().toISOString()
  });
});

/**
 * Debug - Test de connexion à une boutique
 */
router.get('/test-shop/:shop', async (req: Request, res: Response) => {
  const shop = req.params.shop;
  
  try {
    const token = await firebaseService.getShopToken(shop);
    const isConnected = await firebaseService.isShopConnected(shop);
    const shopData = await memoryStorage.getShopData(shop);
    
    res.json({
      success: true,
      shop,
      hasToken: !!token,
      tokenLength: token?.length || 0,
      isConnected,
      shopData: shopData ? {
        name: shopData.name,
        domain: shopData.domain,
        installedAt: shopData.installedAt,
        isActive: shopData.isActive
      } : null
    });
  } catch (error) {
    logger.error('Erreur test shop', { shop, error });
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
});

export { router as debugRoutes };
