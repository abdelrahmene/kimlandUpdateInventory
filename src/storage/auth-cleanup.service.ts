import { secureStoreService } from './secure-store.service';
import { logger } from '../utils/logger';

export class AuthCleanupService {
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 heures
  private readonly MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

  /**
   * Démarrer le service de nettoyage automatique
   */
  public startAutoCleanup(): void {
    if (this.cleanupInterval) {
      logger.warn('⚠️ Service de nettoyage déjà démarré');
      return;
    }

    logger.info('🧹 Démarrage du service de nettoyage automatique des authentifications', {
      intervalHours: this.CLEANUP_INTERVAL_MS / (60 * 60 * 1000),
      maxAgeDays: this.MAX_AGE_MS / (24 * 60 * 60 * 1000)
    });

    // Nettoyage immédiat au démarrage
    this.performCleanup();

    // Programmer le nettoyage périodique
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.CLEANUP_INTERVAL_MS);
  }

  /**
   * Arrêter le service de nettoyage automatique
   */
  public stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('🛑 Service de nettoyage automatique arrêté');
    }
  }

  /**
   * Effectuer le nettoyage
   */
  private async performCleanup(): Promise<void> {
    try {
      logger.info('🧹 Début du nettoyage automatique des authentifications');
      
      const cleanedCount = await secureStoreService.cleanupExpiredAuth(this.MAX_AGE_MS);
      const stats = await secureStoreService.getAuthStats();
      
      logger.info('✅ Nettoyage automatique terminé', {
        cleanedCount,
        remainingValid: stats.validAuth,
        remainingInvalid: stats.invalidAuth,
        totalRemaining: stats.totalStored
      });
      
      // Si beaucoup d'authentifications ont été nettoyées, log plus de détails
      if (cleanedCount > 10) {
        logger.warn('🚨 Beaucoup d\'authentifications nettoyées', {
          cleanedCount,
          recommendation: 'Vérifier si les utilisateurs se reconnectent correctement'
        });
      }
      
    } catch (error) {
      logger.error('❌ Erreur lors du nettoyage automatique', { error });
    }
  }

  /**
   * Forcer un nettoyage manuel
   */
  public async forceCleanup(): Promise<number> {
    logger.info('🔧 Nettoyage manuel déclenché');
    const cleanedCount = await secureStoreService.cleanupExpiredAuth(this.MAX_AGE_MS);
    logger.info('✅ Nettoyage manuel terminé', { cleanedCount });
    return cleanedCount;
  }

  /**
   * Obtenir le statut du service
   */
  public getStatus(): {
    isRunning: boolean;
    intervalMs: number;
    maxAgeMs: number;
    nextCleanupEstimate?: string;
  } {
    const isRunning = this.cleanupInterval !== null;
    
    let nextCleanupEstimate: string | undefined;
    if (isRunning) {
      const nextCleanup = new Date(Date.now() + this.CLEANUP_INTERVAL_MS);
      nextCleanupEstimate = nextCleanup.toISOString();
    }
    
    return {
      isRunning,
      intervalMs: this.CLEANUP_INTERVAL_MS,
      maxAgeMs: this.MAX_AGE_MS,
      nextCleanupEstimate
    };
  }
}

// Instance singleton
export const authCleanupService = new AuthCleanupService();

// Démarrage automatique du service
process.nextTick(() => {
  authCleanupService.startAutoCleanup();
});

// Arrêt propre du service lors de l'extinction du processus
process.on('SIGTERM', () => {
  authCleanupService.stopAutoCleanup();
});

process.on('SIGINT', () => {
  authCleanupService.stopAutoCleanup();
});
