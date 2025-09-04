import { logger } from '../../../utils/logger';
import { KimlandAuthService } from '../kimland-auth.service';
import { KimlandOrderService } from './kimland-order.service';

export interface OrderSyncResult {
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  success: boolean;
  kimlandOrderId?: string;
  error?: string;
  timestamp: Date;
}

export interface OrderSyncStats {
  total: number;
  successful: number;
  failed: number;
  results: OrderSyncResult[];
}

export class ShopifyKimlandOrderSync {
  private kimlandOrderService: KimlandOrderService;
  private authService: KimlandAuthService;

  constructor() {
    this.authService = new KimlandAuthService();
    this.kimlandOrderService = new KimlandOrderService(this.authService);
  }

  /**
   * Synchroniser une commande Shopify vers Kimland
   */
  async syncSingleOrder(shopifyOrder: any): Promise<OrderSyncResult> {
    const result: OrderSyncResult = {
      shopifyOrderId: shopifyOrder.id.toString(),
      shopifyOrderNumber: shopifyOrder.order_number?.toString() || shopifyOrder.name || 'Unknown',
      success: false,
      timestamp: new Date()
    };

    try {
      logger.info('🔄 Début sync commande individuelle', {
        orderId: result.shopifyOrderId,
        orderNumber: result.shopifyOrderNumber,
        customerEmail: shopifyOrder.customer?.email
      });

      // Vérifications préalables
      if (!shopifyOrder.customer?.email) {
        result.error = 'Email client manquant dans la commande Shopify';
        return result;
      }

      if (!shopifyOrder.line_items || shopifyOrder.line_items.length === 0) {
        result.error = 'Aucun article dans la commande';
        return result;
      }

      if (!shopifyOrder.shipping_address && !shopifyOrder.billing_address) {
        result.error = 'Aucune adresse de livraison trouvée';
        return result;
      }

      // Créer la commande sur Kimland
      const kimlandResult = await this.kimlandOrderService.createOrderFromShopify(shopifyOrder);
      
      if (kimlandResult.success) {
        result.success = true;
        result.kimlandOrderId = kimlandResult.kimlandOrderId;
        
        logger.info('✅ Commande synchronisée avec succès', {
          shopifyOrderId: result.shopifyOrderId,
          kimlandOrderId: result.kimlandOrderId
        });
      } else {
        result.error = kimlandResult.error;
        
        logger.error('❌ Échec sync commande', {
          shopifyOrderId: result.shopifyOrderId,
          error: result.error
        });
      }

      return result;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Erreur inconnue';
      
      logger.error('💥 Erreur critique sync commande', {
        shopifyOrderId: result.shopifyOrderId,
        error: result.error
      });

      return result;
    }
  }

  /**
   * Synchroniser plusieurs commandes en lot
   */
  async syncMultipleOrders(shopifyOrders: any[]): Promise<OrderSyncStats> {
    const stats: OrderSyncStats = {
      total: shopifyOrders.length,
      successful: 0,
      failed: 0,
      results: []
    };

    logger.info('🔄 Début sync batch commandes', {
      totalOrders: stats.total
    });

    // S'assurer d'être authentifié une seule fois
    if (!this.authService.isLoggedIn()) {
      const authResult = await this.authService.authenticate({
        email: 'bousetta88@gmail.com',
        username: 'Boumediene Bousetta',
        password: 'Abraj@Injaz'
      });

      if (!authResult) {
        // Créer des résultats d'échec pour toutes les commandes
        stats.results = shopifyOrders.map(order => ({
          shopifyOrderId: order.id.toString(),
          shopifyOrderNumber: order.order_number?.toString() || 'Unknown',
          success: false,
          error: 'Échec authentification Kimland',
          timestamp: new Date()
        }));
        stats.failed = stats.total;
        return stats;
      }
    }

    // Traiter chaque commande avec un délai entre les requêtes
    for (let i = 0; i < shopifyOrders.length; i++) {
      const order = shopifyOrders[i];
      
      logger.info(`📦 Traitement commande ${i + 1}/${stats.total}`, {
        orderId: order.id,
        orderNumber: order.order_number
      });

      const result = await this.syncSingleOrder(order);
      stats.results.push(result);

      if (result.success) {
        stats.successful++;
      } else {
        stats.failed++;
      }

      // Attendre entre les requêtes pour éviter de surcharger Kimland
      if (i < shopifyOrders.length - 1) {
        await this.delay(2000);
      }
    }

    logger.info('📊 Sync batch terminé', {
      total: stats.total,
      successful: stats.successful,
      failed: stats.failed,
      successRate: `${Math.round((stats.successful / stats.total) * 100)}%`
    });

    return stats;
  }

  /**
   * Traiter une commande Shopify en temps réel (webhook)
   */
  async processShopifyWebhook(orderData: any): Promise<OrderSyncResult> {
    logger.info('🎯 Traitement webhook commande Shopify', {
      orderId: orderData.id,
      orderNumber: orderData.order_number,
      topic: 'orders/create'
    });

    // Vérifier que la commande n'est pas un test
    if (orderData.test === true) {
      logger.info('🧪 Commande de test ignorée', {
        orderId: orderData.id
      });
      
      return {
        shopifyOrderId: orderData.id.toString(),
        shopifyOrderNumber: orderData.order_number?.toString() || 'Test',
        success: false,
        error: 'Commande de test ignorée',
        timestamp: new Date()
      };
    }

    // Vérifier que la commande est payée
    if (orderData.financial_status !== 'paid' && orderData.financial_status !== 'partially_paid') {
      logger.info('💳 Commande non payée ignorée', {
        orderId: orderData.id,
        financialStatus: orderData.financial_status
      });
      
      return {
        shopifyOrderId: orderData.id.toString(),
        shopifyOrderNumber: orderData.order_number?.toString() || 'Unpaid',
        success: false,
        error: `Commande non payée (${orderData.financial_status})`,
        timestamp: new Date()
      };
    }

    // Synchroniser la commande
    return await this.syncSingleOrder(orderData);
  }

  /**
   * Obtenir le statut de connexion Kimland
   */
  async getConnectionStatus(): Promise<{ connected: boolean; error?: string }> {
    try {
      const isConnected = this.authService.isLoggedIn();
      
      if (!isConnected) {
        // Tenter une reconnexion
        const authResult = await this.authService.authenticate({
          email: 'bousetta88@gmail.com',
          username: 'Boumediene Bousetta',
          password: 'Abraj@Injaz'
        });

        return {
          connected: authResult,
          error: authResult ? undefined : 'Échec de l\'authentification'
        };
      }

      return { connected: true };

    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * Délai entre les requêtes
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Filtrer les commandes éligibles pour la synchronisation
   */
  filterEligibleOrders(orders: any[]): any[] {
    return orders.filter(order => {
      // Ignorer les commandes de test
      if (order.test === true) return false;

      // Ignorer les commandes sans client
      if (!order.customer?.email) return false;

      // Ignorer les commandes sans articles
      if (!order.line_items || order.line_items.length === 0) return false;

      // Ignorer les commandes annulées
      if (order.cancelled_at) return false;

      // Ignorer les commandes trop anciennes (plus de 30 jours)
      const orderDate = new Date(order.created_at);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      if (orderDate < thirtyDaysAgo) return false;

      return true;
    });
  }

  /**
   * Obtenir les statistiques de synchronisation
   */
  getStats(): { 
    connected: boolean; 
    lastSync?: Date; 
    totalSynced: number; 
    errors: number 
  } {
    return {
      connected: this.authService.isLoggedIn(),
      lastSync: new Date(), // À implémenter avec un stockage persistant
      totalSynced: 0, // À implémenter avec un stockage persistant
      errors: 0 // À implémenter avec un stockage persistant
    };
  }
}

export const shopifyKimlandOrderSync = new ShopifyKimlandOrderSync();