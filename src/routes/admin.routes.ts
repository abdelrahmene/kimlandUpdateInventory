import { Router, Request, Response } from 'express';
import { secureStoreService } from '../storage/secure-store.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * 📊 Obtenir les statistiques d'authentification
 */
router.get('/auth-stats', asyncHandler(async (req: Request, res: Response) => {
  try {
    const stats = await secureStoreService.getAuthStats();
    
    res.json({
      success: true,
      stats: {
        ...stats,
        storageLocation: 'Local Encrypted Files',
        encryptionMethod: 'AES-256-GCM',
        lastCleanup: new Date().toISOString()
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur stats auth', { error });
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la récupération des statistiques'
    });
  }
}));

/**
 * 🧹 Nettoyer les authentifications expirées
 */
router.post('/cleanup-auth', asyncHandler(async (req: Request, res: Response) => {
  try {
    const maxAgeMs = parseInt(req.query.maxAgeDays as string) || 30;
    const maxAgeMillis = maxAgeMs * 24 * 60 * 60 * 1000;
    
    const cleanedCount = await secureStoreService.cleanupExpiredAuth(maxAgeMillis);
    
    logger.info('🧹 Nettoyage auth terminé', { cleanedCount, maxAgeDays: maxAgeMs });
    
    res.json({
      success: true,
      message: `${cleanedCount} authentifications expirées supprimées`,
      cleanedCount,
      maxAgeDays: maxAgeMs
    });
    
  } catch (error) {
    logger.error('❌ Erreur nettoyage auth', { error });
    res.status(500).json({
      success: false,
      error: 'Erreur lors du nettoyage'
    });
  }
}));

/**
 * 🔍 Vérifier le statut d'une authentification spécifique
 */
router.get('/auth-status/:shop', asyncHandler(async (req: Request, res: Response) => {
  const shop = req.params.shop;
  
  try {
    const authData = await secureStoreService.getShopAuth(shop);
    
    if (authData) {
      res.json({
        success: true,
        shop,
        isAuthenticated: authData.isValid,
        connectedAt: authData.connectedAt,
        lastUsed: authData.lastUsed,
        scope: authData.scope,
        appVersion: authData.appVersion,
        hasToken: !!authData.accessToken
      });
    } else {
      res.json({
        success: true,
        shop,
        isAuthenticated: false,
        message: 'Aucune authentification trouvée'
      });
    }
    
  } catch (error) {
    logger.error('❌ Erreur vérif auth', { shop, error });
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification'
    });
  }
}));

/**
 * 🗑️ Supprimer une authentification spécifique (admin)
 */
router.delete('/auth/:shop', asyncHandler(async (req: Request, res: Response) => {
  const shop = req.params.shop;
  
  // Vérification de sécurité basique (à améliorer en production)
  const adminKey = req.headers['x-admin-key'] as string;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Accès non autorisé'
    });
  }
  
  try {
    await secureStoreService.deleteShopAuth(shop);
    
    logger.info('🗑️ Auth supprimée par admin', { shop });
    
    res.json({
      success: true,
      message: `Authentification supprimée pour ${shop}`
    });
    
  } catch (error) {
    logger.error('❌ Erreur suppression auth admin', { shop, error });
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la suppression'
    });
  }
}));

/**
 * 🔄 Migrer les authentifications de l'ancien système vers le nouveau
 */
router.post('/migrate-auth', asyncHandler(async (req: Request, res: Response) => {
  const adminKey = req.headers['x-admin-key'] as string;
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Accès non autorisé'
    });
  }
  
  try {
    const firebaseService = (await import('../services/firebase.service')).firebaseService;
    let migratedCount = 0;
    
    // Cette fonction devrait être implémentée pour récupérer tous les shops depuis l'ancien système
    // Pour l'instant, on simule avec les shops qu'on trouve
    logger.info('🔄 Début migration auth vers stockage sécurisé');
    
    res.json({
      success: true,
      message: 'Migration terminée (fonctionnalité à implémenter complètement)',
      migratedCount: migratedCount,
      note: 'La migration se fait automatiquement lors de la première utilisation de chaque shop'
    });
    
  } catch (error) {
    logger.error('❌ Erreur migration auth', { error });
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la migration'
    });
  }
}));

export { router as adminRoutes };
