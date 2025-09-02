import admin from 'firebase-admin';
import { config } from '../config';
import { ShopData } from '../types';
import { logger } from '../utils/logger';
import { memoryStorage } from '../storage/memory-storage.service';

export class FirebaseService {
  private static instance: FirebaseService;
  private db: admin.firestore.Firestore | null = null;
  private isInitialized = false;

  private constructor() {
    this.initializeFirebase();
  }

  private initializeFirebase() {
    try {
      if (!config.firebase.projectId) {
        logger.warn('⚠️ Firebase non configuré - mode simulation activé');
        this.isInitialized = false;
        return;
      }

      if (!admin.apps.length) {
        admin.initializeApp({
          projectId: config.firebase.projectId,
        });
      }
      
      this.db = admin.firestore();
      this.isInitialized = true;
      logger.info('🔥 Firebase initialisé avec succès');
    } catch (error) {
      logger.error('❌ Erreur lors de l\'initialisation Firebase:', error);
      logger.warn('Mode simulation Firebase activé');
      this.isInitialized = false;
    }
  }

  public static getInstance(): FirebaseService {
    if (!FirebaseService.instance) {
      FirebaseService.instance = new FirebaseService();
    }
    return FirebaseService.instance;
  }

  /**
   * Récupère les données d'une boutique
   */
  public async getShopData(shop: string): Promise<ShopData | null> {
    // Essayer mémoire d'abord (plus rapide)
    const memoryData = await memoryStorage.getShopData(shop);
    if (memoryData) {
      logger.debug('ShopData trouvé en mémoire', { shop });
      return memoryData;
    }
    
    // Fallback Firebase si disponible
    if (!this.checkFirebaseAvailable()) return null;
    
    try {
      const docRef = this.db!.collection(config.collections.shops).doc(shop);
      const doc = await docRef.get();

      if (!doc.exists) {
        logger.debug('Shop non trouvé dans Firebase', { shop });
        return null;
      }

      const data = doc.data() as ShopData;
      return data;
    } catch (error) {
      logger.error('Erreur lors de la récupération des données shop', { 
        shop, 
        error: error instanceof Error ? error.message : error 
      });
      return null;
    }
  }

  /**
   * Vérifie si Firebase est disponible
   */
  private checkFirebaseAvailable(): boolean {
    if (!this.isInitialized || !this.db) {
      logger.warn('⚠️ Firebase non disponible - opération ignorée');
      return false;
    }
    return true;
  }

  /**
   * Sauvegarde l'access token d'un shop (utilise maintenant le stockage sécurisé)
   */
  public async saveShopToken(shopData: ShopData): Promise<void> {
    try {
      // 1. Sauvegarder avec le nouveau service sécurisé (priorité)
      try {
        const { secureStoreService } = await import('../storage/secure-store.service');
        await secureStoreService.saveShopAuth(
          shopData.shop, 
          shopData.accessToken, 
          'read_products,write_products,read_inventory,write_inventory'
        );
        logger.debug('Token sauvé dans le stockage sécurisé', { shop: shopData.shop });
      } catch (secureError) {
        logger.warn('⚠️ Stockage sécurisé non disponible, utilise mémoire', { shop: shopData.shop });
      }
      
      // 2. Maintenir la compatibilité avec le stockage mémoire legacy
      await memoryStorage.saveShopData(shopData);
      
      // 3. Optionnel: sauvegarder aussi dans Firebase pour backup
      if (this.checkFirebaseAvailable()) {
        try {
          const docRef = this.db!.collection(config.collections.shops).doc(shopData.shop);
          await docRef.set({
            ...shopData,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        } catch (fbError) {
          logger.warn('⚠️ Backup Firebase échoué (pas critique)', { shop: shopData.shop, fbError });
        }
      }

      logger.info('✅ Token sauvegardé avec stockage sécurisé', { shop: shopData.shop });
    } catch (error) {
      logger.error('❌ Erreur sauvegarde token', { shop: shopData.shop, error });
      throw error;
    }
  }

  /**
   * Sauvegarde les données d'une boutique (ALIAS pour saveShopToken)
   */
  public async saveShopData(shopData: ShopData): Promise<void> {
    // Toujours sauver en mémoire comme fallback
    await memoryStorage.saveShopData(shopData);
    
    // Tenter Firebase si disponible
    if (this.checkFirebaseAvailable()) {
      try {
        const docRef = this.db!.collection(config.collections.shops).doc(shopData.shop);
        await docRef.set({
          ...shopData,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        logger.info('📊 Sauvé Firebase + Mémoire', { shop: shopData.shop });
      } catch (error) {
        logger.warn('⚠️ Firebase échec, mémoire OK', { shop: shopData.shop });
      }
    } else {
      logger.info('💾 Sauvé en mémoire uniquement', { shop: shopData.shop });
    }
  }

  /**
   * Récupère l'access token d'un shop (utilise maintenant le stockage sécurisé)
   */
  public async getShopToken(shop: string): Promise<string | null> {
    try {
      // 1. Utiliser le service de stockage sécurisé local (priorité)
      try {
        const { secureStoreService } = await import('../storage/secure-store.service');
        const accessToken = await secureStoreService.getShopToken(shop);
        
        if (accessToken) {
          logger.debug('✅ Token récupéré depuis stockage sécurisé', { shop, hasToken: !!accessToken });
          return accessToken;
        }
      } catch (secureError) {
        logger.debug('⚠️ Stockage sécurisé non disponible pour récupération', { shop });
      }
      
      // 2. Fallback: vérifier l'ancien système mémoire
      const memoryToken = await memoryStorage.getShopToken(shop);
      if (memoryToken) {
        // Migrer vers le nouveau système
        try {
          const { secureStoreService } = await import('../storage/secure-store.service');
          await secureStoreService.saveShopAuth(shop, memoryToken, 'read_products,write_products,read_inventory,write_inventory');
          logger.info('🔄 Token migré depuis mémoire vers stockage sécurisé', { shop });
        } catch (migrateError) {
          logger.debug('⚠️ Migration vers stockage sécurisé échouée', { shop });
        }
        return memoryToken;
      }
      
      // 3. Fallback Firebase
      if (this.checkFirebaseAvailable()) {
        try {
          const docRef = this.db!.collection(config.collections.shops).doc(shop);
          const doc = await docRef.get();
          
          if (doc.exists) {
            const data = doc.data() as ShopData;
            const firebaseToken = data.accessToken;
            
            if (firebaseToken) {
              // Migrer vers le nouveau système
              try {
                const { secureStoreService } = await import('../storage/secure-store.service');
                await secureStoreService.saveShopAuth(shop, firebaseToken, 'read_products,write_products,read_inventory,write_inventory');
                logger.info('🔄 Token migré depuis Firebase vers stockage sécurisé', { shop });
              } catch (migrateError) {
                logger.debug('⚠️ Migration Firebase vers stockage sécurisé échouée', { shop });
              }
              return firebaseToken;
            }
          }
        } catch (fbError) {
          logger.debug('⚠️ Fallback Firebase échoué', { shop, fbError });
        }
      }

      return null;
    } catch (error) {
      logger.error('❌ Erreur récupération token', { shop, error });
      return null;
    }
  }

  /**
   * Vérifie si un shop est connecté (utilise maintenant le stockage sécurisé)
   */
  public async isShopConnected(shop: string): Promise<boolean> {
    try {
      const { secureStoreService } = await import('../storage/secure-store.service');
      return await secureStoreService.isShopAuthenticated(shop);
    } catch (error) {
      logger.debug('⚠️ Fallback sur mémoire pour vérification connexion', { shop });
      const token = await memoryStorage.getShopToken(shop);
      return !!token;
    }
  }
  
  /**
   * Supprime l'authentification d'un shop (utilise maintenant le stockage sécurisé)
   */
  public async removeShopToken(shop: string): Promise<void> {
    try {
      // Supprimer du stockage sécurisé
      try {
        const { secureStoreService } = await import('../storage/secure-store.service');
        await secureStoreService.deleteShopAuth(shop);
        logger.debug('Token supprimé du stockage sécurisé', { shop });
      } catch (secureError) {
        logger.debug('Stockage sécurisé non disponible pour suppression', { shop });
      }
      
      // Supprimer du cache mémoire legacy
      await memoryStorage.deleteShopData(shop);
      
      // Supprimer de Firebase aussi
      if (this.checkFirebaseAvailable()) {
        try {
          await this.deleteShopData(shop);
        } catch (fbError) {
          logger.debug('🔄 Suppression Firebase échouée (pas critique)', { shop });
        }
      }

      logger.info('🗑️ Token supprimé avec stockage sécurisé', { shop });
    } catch (error) {
      logger.error('❌ Erreur suppression token', { shop, error });
    }
  }

  /**
   * Désactive une boutique (pour déconnexion)
   */
  public async deactivateShop(shop: string): Promise<void> {
    if (!this.checkFirebaseAvailable()) return;
    
    try {
      const docRef = this.db!.collection(config.collections.shops).doc(shop);
      await docRef.update({
        isActive: false,
        deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      logger.info('Boutique désactivée', { shop });
    } catch (error) {
      logger.error('Erreur lors de la désactivation', { 
        shop, 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  /**
   * Supprime les données d'un shop (pour déconnexion)
   */
  public async deleteShopData(shop: string): Promise<void> {
    if (!this.checkFirebaseAvailable()) return;
    
    try {
      const docRef = this.db!.collection(config.collections.shops).doc(shop);
      await docRef.delete();
      logger.info('Données shop supprimées', { shop });
    } catch (error) {
      logger.error('Erreur lors de la suppression des données shop', { 
        shop, 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  /**
   * Sauvegarde les statistiques d'extraction
   */
  public async saveExtractionStats(shop: string, stats: {
    totalProducts: number;
    withReferences: number;
    extractionRate: number;
    timestamp: Date;
  }): Promise<void> {
    if (!this.checkFirebaseAvailable()) return;
    
    try {
      const docRef = this.db!.collection(config.collections.analytics).doc();
      await docRef.set({
        shop,
        ...stats,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.debug('Statistiques d\'extraction sauvegardées', { shop, stats });
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde des statistiques', { 
        shop, 
        error: error instanceof Error ? error.message : error 
      });
    }
  }
}

export const firebaseService = FirebaseService.getInstance();
