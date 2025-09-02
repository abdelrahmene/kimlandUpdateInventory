import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';

interface ShopAuth {
  shop: string;
  accessToken: string;
  scope: string;
  connectedAt: string;
  lastUsed: string;
  appVersion: string;
  isValid: boolean;
}

interface EncryptedData {
  iv: string;
  encryptedData: string;
  tag: string;
}

export class SecureStoreService {
  private readonly STORAGE_DIR = path.join(process.cwd(), 'storage', 'auth');
  private readonly ENCRYPTION_KEY: Buffer;
  private readonly memoryCache = new Map<string, ShopAuth>();

  constructor() {
    // Générer une clé de chiffrement basée sur les variables d'environnement
    const keyMaterial = process.env.SHOPIFY_API_SECRET + process.env.SHOPIFY_API_KEY + 'KIMLAND_SECURE_STORE';
    this.ENCRYPTION_KEY = crypto.scryptSync(keyMaterial, 'salt', 32);
    this.ensureStorageDir();
  }

  /**
   * S'assurer que le répertoire de stockage existe
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.STORAGE_DIR, { recursive: true });
    } catch (error) {
      logger.error('❌ Erreur création répertoire storage', { error });
    }
  }

  /**
   * Chiffrer des données sensibles
   */
  private encrypt(text: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      iv: iv.toString('hex'),
      encryptedData: encrypted,
      tag: tag.toString('hex')
    };
  }

  /**
   * Déchiffrer des données
   */
  private decrypt(encryptedData: EncryptedData): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.ENCRYPTION_KEY, Buffer.from(encryptedData.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encryptedData.tag, 'hex'));
    
    let decrypted = decipher.update(encryptedData.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  /**
   * Générer un nom de fichier sécurisé pour le shop
   */
  private getShopFileName(shop: string): string {
    // Hash du nom du shop pour éviter les problèmes de noms de fichiers
    const hash = crypto.createHash('sha256').update(shop).digest('hex');
    return `shop_${hash.substring(0, 16)}.enc`;
  }

  /**
   * Sauvegarder l'authentification d'un shop
   */
  async saveShopAuth(shop: string, accessToken: string, scope: string = 'read_products,write_products,read_inventory,write_inventory'): Promise<void> {
    try {
      const authData: ShopAuth = {
        shop,
        accessToken,
        scope,
        connectedAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        appVersion: '1.0.0',
        isValid: true
      };

      // 1. Chiffrer les données
      const encrypted = this.encrypt(JSON.stringify(authData));
      
      // 2. Sauvegarder sur disque
      const fileName = this.getShopFileName(shop);
      const filePath = path.join(this.STORAGE_DIR, fileName);
      
      await fs.writeFile(filePath, JSON.stringify(encrypted), 'utf8');
      
      // 3. Mettre en cache mémoire (non chiffré pour la performance)
      this.memoryCache.set(shop, authData);
      
      logger.info('✅ Authentification shop sauvegardée', { 
        shop, 
        file: fileName,
        hasToken: !!accessToken,
        scope
      });
      
    } catch (error) {
      logger.error('❌ Erreur sauvegarde auth shop', { shop, error });
      throw new Error('Impossible de sauvegarder l\'authentification');
    }
  }

  /**
   * Récupérer l'authentification d'un shop
   */
  async getShopAuth(shop: string): Promise<ShopAuth | null> {
    try {
      // 1. Vérifier le cache mémoire d'abord
      if (this.memoryCache.has(shop)) {
        const cachedAuth = this.memoryCache.get(shop)!;
        
        // Mettre à jour lastUsed
        cachedAuth.lastUsed = new Date().toISOString();
        this.memoryCache.set(shop, cachedAuth);
        
        logger.debug('🚀 Auth trouvée en cache mémoire', { shop });
        return cachedAuth;
      }

      // 2. Charger depuis le disque
      const fileName = this.getShopFileName(shop);
      const filePath = path.join(this.STORAGE_DIR, fileName);
      
      try {
        const fileContent = await fs.readFile(filePath, 'utf8');
        const encrypted: EncryptedData = JSON.parse(fileContent);
        
        // 3. Déchiffrer
        const decryptedData = this.decrypt(encrypted);
        const authData: ShopAuth = JSON.parse(decryptedData);
        
        // 4. Vérifier la validité
        if (!authData.isValid || !authData.accessToken) {
          logger.warn('⚠️ Auth invalide trouvée', { shop });
          return null;
        }
        
        // 5. Mettre à jour lastUsed et remettre en cache
        authData.lastUsed = new Date().toISOString();
        this.memoryCache.set(shop, authData);
        
        // 6. Sauvegarder la mise à jour de lastUsed
        const updatedEncrypted = this.encrypt(JSON.stringify(authData));
        await fs.writeFile(filePath, JSON.stringify(updatedEncrypted), 'utf8');
        
        logger.info('✅ Auth récupérée depuis disque', { shop, connectedAt: authData.connectedAt });
        return authData;
        
      } catch (fileError) {
        // Fichier n'existe pas ou est corrompu
        logger.debug('📁 Aucun fichier auth trouvé', { shop, fileName });
        return null;
      }
      
    } catch (error) {
      logger.error('❌ Erreur récupération auth shop', { shop, error });
      return null;
    }
  }

  /**
   * Récupérer juste le token d'accès
   */
  async getShopToken(shop: string): Promise<string | null> {
    const authData = await this.getShopAuth(shop);
    return authData?.accessToken || null;
  }

  /**
   * Vérifier si un shop est authentifié
   */
  async isShopAuthenticated(shop: string): Promise<boolean> {
    const authData = await this.getShopAuth(shop);
    return authData?.isValid && !!authData.accessToken;
  }

  /**
   * Invalider l'authentification d'un shop (soft delete)
   */
  async invalidateShopAuth(shop: string): Promise<void> {
    try {
      const authData = await this.getShopAuth(shop);
      if (authData) {
        authData.isValid = false;
        authData.lastUsed = new Date().toISOString();
        
        // Sauvegarder l'état invalidé
        const encrypted = this.encrypt(JSON.stringify(authData));
        const fileName = this.getShopFileName(shop);
        const filePath = path.join(this.STORAGE_DIR, fileName);
        
        await fs.writeFile(filePath, JSON.stringify(encrypted), 'utf8');
      }
      
      // Supprimer du cache
      this.memoryCache.delete(shop);
      
      logger.info('🚫 Auth shop invalidée', { shop });
    } catch (error) {
      logger.error('❌ Erreur invalidation auth shop', { shop, error });
    }
  }

  /**
   * Supprimer complètement l'authentification d'un shop
   */
  async deleteShopAuth(shop: string): Promise<void> {
    try {
      const fileName = this.getShopFileName(shop);
      const filePath = path.join(this.STORAGE_DIR, fileName);
      
      // Supprimer le fichier
      try {
        await fs.unlink(filePath);
      } catch (error) {
        // Fichier n'existe peut-être pas
        logger.debug('📁 Fichier auth non trouvé lors de la suppression', { shop, fileName });
      }
      
      // Supprimer du cache
      this.memoryCache.delete(shop);
      
      logger.info('🗑️ Auth shop supprimée', { shop });
    } catch (error) {
      logger.error('❌ Erreur suppression auth shop', { shop, error });
    }
  }

  /**
   * Nettoyer les authentifications expirées (à exécuter périodiquement)
   */
  async cleanupExpiredAuth(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    let cleanedCount = 0;
    
    try {
      const files = await fs.readdir(this.STORAGE_DIR);
      const authFiles = files.filter(f => f.startsWith('shop_') && f.endsWith('.enc'));
      
      for (const fileName of authFiles) {
        try {
          const filePath = path.join(this.STORAGE_DIR, fileName);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const encrypted: EncryptedData = JSON.parse(fileContent);
          const decryptedData = this.decrypt(encrypted);
          const authData: ShopAuth = JSON.parse(decryptedData);
          
          const lastUsedDate = new Date(authData.lastUsed);
          const isExpired = (Date.now() - lastUsedDate.getTime()) > maxAgeMs;
          
          if (isExpired || !authData.isValid) {
            await fs.unlink(filePath);
            this.memoryCache.delete(authData.shop);
            cleanedCount++;
            logger.info('🧹 Auth expirée supprimée', { shop: authData.shop, lastUsed: authData.lastUsed });
          }
          
        } catch (error) {
          // Fichier corrompu, le supprimer
          const filePath = path.join(this.STORAGE_DIR, fileName);
          await fs.unlink(filePath);
          cleanedCount++;
          logger.warn('🗑️ Fichier auth corrompu supprimé', { fileName });
        }
      }
      
      if (cleanedCount > 0) {
        logger.info(`🧹 Nettoyage terminé: ${cleanedCount} auth supprimées`);
      }
      
    } catch (error) {
      logger.error('❌ Erreur nettoyage auth', { error });
    }
    
    return cleanedCount;
  }

  /**
   * Obtenir des statistiques sur les authentifications
   */
  async getAuthStats(): Promise<{
    totalStored: number;
    validAuth: number;
    invalidAuth: number;
    inCache: number;
  }> {
    try {
      const files = await fs.readdir(this.STORAGE_DIR);
      const authFiles = files.filter(f => f.startsWith('shop_') && f.endsWith('.enc'));
      
      let validCount = 0;
      let invalidCount = 0;
      
      for (const fileName of authFiles) {
        try {
          const filePath = path.join(this.STORAGE_DIR, fileName);
          const fileContent = await fs.readFile(filePath, 'utf8');
          const encrypted: EncryptedData = JSON.parse(fileContent);
          const decryptedData = this.decrypt(encrypted);
          const authData: ShopAuth = JSON.parse(decryptedData);
          
          if (authData.isValid && authData.accessToken) {
            validCount++;
          } else {
            invalidCount++;
          }
          
        } catch (error) {
          invalidCount++;
        }
      }
      
      return {
        totalStored: authFiles.length,
        validAuth: validCount,
        invalidAuth: invalidCount,
        inCache: this.memoryCache.size
      };
      
    } catch (error) {
      logger.error('❌ Erreur stats auth', { error });
      return { totalStored: 0, validAuth: 0, invalidAuth: 0, inCache: 0 };
    }
  }
}

export const secureStoreService = new SecureStoreService();