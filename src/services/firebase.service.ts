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
   * Sauvegarde l'access token d'un shop
   */
  public async saveShopToken(shopData: ShopData): Promise<void> {
    if (!this.checkFirebaseAvailable()) {
      // Mode sans Firebase - simulation
      logger.info('💾 Token sauvegardé (mode simulation)', { shop: shopData.shop });
      return;
    }
    
    try {
      const docRef = this.db!.collection(config.collections.shops).doc(shopData.shop);
      await docRef.set({
        ...shopData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      logger.info('Token sauvegardé avec succès', { shop: shopData.shop });
    } catch (error) {
      logger.error('Erreur lors de la sauvegarde du token', { 
        shop: shopData.shop, 
        error: error instanceof Error ? error.message : error 
      });
      // Ne pas throw l'erreur - continuer en mode simulation
      logger.warn('Continuation en mode simulation');
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
   * Récupère l'access token d'un shop
   */
  public async getShopToken(shop: string): Promise<string | null> {
    // Essayer mémoire d'abord (plus rapide)
    const memoryToken = await memoryStorage.getShopToken(shop);
    if (memoryToken) {
      logger.debug('Token trouvé en mémoire', { shop, tokenLength: memoryToken.length });
      return memoryToken;
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
      return data.accessToken || null;
    } catch (error) {
      logger.error('Erreur lors de la récupération du token', { 
        shop, 
        error: error instanceof Error ? error.message : error 
      });
      return null;
    }
  }

  /**
   * Vérifie si un shop est connecté (utilise maintenant le stockage sécurisé)
   */
  public async isShopConnected(shop: string): Promise<boolean> {
    return await secureStoreService.isShopAuthenticated(shop);
  }
  
  /**
   * Supprime l'authentification d'un shop (utilise maintenant le stockage sécurisé)
   */
  public async removeShopToken(shop: string): Promise<void> {
    try {
      // Supprimer du stockage sécurisé
      await secureStoreService.deleteShopAuth(shop);
      
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
