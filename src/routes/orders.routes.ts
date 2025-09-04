import { Router, Request, Response } from 'express';
import { shopifyKimlandOrderSync } from '../services/kimland/orders/shopify-kimland-sync.service';
import { shopifyApiService } from '../services/shopify-api.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error.middleware';
import { broadcastToClients } from './logs.routes';

const router = Router();

/**
 * Obtenir les dernières commandes pour l'interface temps réel
 */
router.get('/recent', asyncHandler(async (req: Request, res: Response) => {
  const { limit = 10 } = req.query;
  
  try {
    // Simuler des commandes récentes (en attente de l'implémentation BDD)
    const mockOrders = [];
    
    for (let i = 0; i < Math.min(parseInt(limit as string), 10); i++) {
      mockOrders.push({
        id: `ORDER_${Date.now()}_${i}`,
        orderNumber: Math.floor(Math.random() * 9000) + 1000,
        customerEmail: `client${i}@example.com`,
        totalPrice: (Math.random() * 200 + 20).toFixed(2),
        status: ['pending', 'success', 'error'][Math.floor(Math.random() * 3)],
        createdAt: new Date(Date.now() - Math.random() * 86400000).toISOString()
      });
    }
    
    res.json({
      success: true,
      orders: mockOrders
    });
    
  } catch (error) {
    logger.error('❌ Erreur récupération commandes récentes', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
}));

/**
 * Tester la création d'un client Kimland avec des données de test
 */
router.post('/test/create-client', asyncHandler(async (req: Request, res: Response) => {
  try {
    const testClientData = {
      nom: 'TestClient',
      prenom: 'Shopify',
      email: `test_${Date.now()}@shopify-kimland.test`,
      adresse: '123 Rue de Test, Appartement 4',
      tel1: '0555123456',
      tel2: '0661987654',
      wilaya: 'Alger',
      commune: 'Bir el Djir'
    };

    logger.info('🧪 Test création client Kimland', testClientData);

    // Créer une instance du service client
    const { KimlandClientService } = await import('../services/kimland/orders/kimland-client.service');
    const { kimlandService } = await import('../services/kimland/kimland.service');
    
    // Utiliser l'authService existant
    const clientService = new KimlandClientService((kimlandService as any).authService);
    
    // Normaliser et compléter les données
    const wilayaInfo = clientService.getWilayaInfo(testClientData.wilaya);
    if (!wilayaInfo) {
      return res.status(400).json({
        success: false,
        error: `Wilaya non trouvée: ${testClientData.wilaya}`
      });
    }

    const completeClientData = {
      ...testClientData,
      wilayaId: wilayaInfo.id,
      communeId: 0, // Sera résolu par le service
      frais: wilayaInfo.frais
    };

    // Tenter de créer le client
    const result = await clientService.createClient(completeClientData);
    
    res.json({
      success: result.success,
      message: result.success ? 'Client créé avec succès' : 'Erreur lors de la création',
      clientData: completeClientData,
      kimlandResult: result,
      wilayaInfo
    });

  } catch (error) {
    logger.error('❌ Erreur test création client', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue lors du test'
    });
  }
}));

/**
 * Webhook Shopify pour les nouvelles commandes
 */
router.post('/webhook/orders/create', asyncHandler(async (req: Request, res: Response) => {
  const orderData = req.body;
  
  console.log('🔍 [DEBUG WEBHOOK] Données brutes reçues:', JSON.stringify(orderData, null, 2));
  
  const orderInfo = {
    orderId: orderData.id,
    orderNumber: orderData.order_number,
    customerEmail: orderData.customer?.email || 'Email non spécifié',
    customerName: `${orderData.customer?.first_name || ''} ${orderData.customer?.last_name || ''}`.trim() || 'Client anonyme',
    totalPrice: orderData.total_price,
    financialStatus: orderData.financial_status,
    itemsCount: orderData.line_items?.length || 0
  };
  
  console.log('📋 [DEBUG WEBHOOK] Informations extraites:', orderInfo);
  logger.info('📥 Webhook reçu - Nouvelle commande Shopify', orderInfo);
  
  // 📺 Diffuser en temps réel vers l'interface
  const broadcastData = {
    type: 'webhook',
    icon: '📦',
    message: `Commande #${orderInfo.orderNumber} reçue`,
    details: `${orderInfo.customerName} (${orderInfo.customerEmail}) - ${orderInfo.totalPrice} DA`,
    data: {
      orderNumber: orderInfo.orderNumber,
      customerEmail: orderInfo.customerEmail,
      customerName: orderInfo.customerName,
      totalPrice: orderInfo.totalPrice,
      financialStatus: orderInfo.financialStatus,
      itemsCount: orderInfo.itemsCount,
      needsProcessing: orderInfo.financialStatus === 'paid'
    },
    timestamp: new Date().toISOString()
  };
  
  console.log('📡 [DEBUG WEBHOOK] Diffusion SSE:', broadcastData);
  broadcastToClients(broadcastData);
  console.log('✅ [DEBUG WEBHOOK] Diffusion SSE envoyée');

  try {
    // Vérifier si la commande est payante
    if (orderData.financial_status !== 'paid' && orderData.financial_status !== 'partially_paid') {
      logger.info('💳 Commande non payée - En attente de paiement', {
        orderId: orderData.id,
        financialStatus: orderData.financial_status
      });
      
      broadcastToClients({
        type: 'warning',
        icon: '💳',
        message: `Commande #${orderInfo.orderNumber} en attente de paiement`,
        details: `Statut: ${orderData.financial_status}`,
        timestamp: new Date().toISOString()
      });
      
      // Retourner succès mais indiquer que c'est en attente
      return res.status(200).json({
        success: true,
        status: 'pending_payment',
        message: 'Commande reçue, en attente de paiement',
        orderNumber: orderInfo.orderNumber,
        financialStatus: orderData.financial_status
      });
    }
    
    // Commande payée - Procéder à la synchronisation
    broadcastToClients({
      type: 'processing',
      icon: '⚙️',
      message: `Traitement commande #${orderInfo.orderNumber}`,
      details: 'Création du client sur Kimland...',
      timestamp: new Date().toISOString()
    });
    
    // Traitement asynchrone de la commande
    const syncResult = await shopifyKimlandOrderSync.processShopifyWebhook(orderData);
    
    if (syncResult.success) {
      logger.info('✅ Commande synchronisée avec succès via webhook', {
        shopifyOrderId: syncResult.shopifyOrderId,
        kimlandOrderId: syncResult.kimlandOrderId
      });
      
      broadcastToClients({
        type: 'success',
        icon: '✓',
        message: `Commande #${orderInfo.orderNumber} synchronisée !`,
        details: 'Client créé et commande ajoutée sur Kimland',
        timestamp: new Date().toISOString()
      });
      
      res.status(200).json({
        success: true,
        message: 'Commande synchronisée avec Kimland',
        kimlandOrderId: syncResult.kimlandOrderId,
        orderNumber: orderInfo.orderNumber,
        customerEmail: orderInfo.customerEmail
      });
    } else {
      logger.warn('⚠️ Échec synchronisation commande webhook', {
        shopifyOrderId: syncResult.shopifyOrderId,
        error: syncResult.error
      });
      
      broadcastToClients({
        type: 'error',
        icon: '❌',
        message: `Échec synchronisation #${orderInfo.orderNumber}`,
        details: syncResult.error || 'Erreur inconnue',
        timestamp: new Date().toISOString()
      });
      
      // Retourner succès pour éviter les re-tentatives de Shopify
      res.status(200).json({
        success: false,
        message: syncResult.error,
        shopifyOrderId: syncResult.shopifyOrderId,
        orderNumber: orderInfo.orderNumber
      });
    }
    
  } catch (error) {
    logger.error('❌ Erreur traitement webhook commande', {
      orderId: orderData.id,
      error: error instanceof Error ? error.message : String(error)
    });
    
    broadcastToClients({
      type: 'error',
      icon: '❌',
      message: `Erreur critique commande #${orderInfo.orderNumber}`,
      details: error instanceof Error ? error.message : 'Erreur inconnue',
      timestamp: new Date().toISOString()
    });
    
    // Retourner succès pour éviter les re-tentatives
    res.status(200).json({
      success: false,
      message: 'Erreur de traitement',
      error: error instanceof Error ? error.message : 'Erreur inconnue',
      orderNumber: orderInfo.orderNumber
    });
  }
}));

/**
 * Synchroniser manuellement une commande spécifique
 */
router.post('/sync/:orderId', asyncHandler(async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const shop = req.query.shop as string;

  if (!shop) {
    return res.status(400).json({
      success: false,
      error: 'Paramètre shop requis'
    });
  }

  try {
    // TODO: Récupérer l'accessToken depuis le stockage de session/auth
    // Pour l'instant, on simule avec une erreur explicite
    return res.status(501).json({
      success: false,
      error: 'Synchronisation manuelle non implémentée - utiliser les webhooks'
    });

    /*
    // Code pour plus tard quand on aura l'accessToken
    const shopifyOrder = await shopifyApiService.getOrder(shop, orderId, accessToken);
    if (!shopifyOrder) {
      return res.status(404).json({
        success: false,
        error: 'Commande Shopify non trouvée'
      });
    }

    // Synchroniser avec Kimland
    const syncResult = await shopifyKimlandOrderSync.syncSingleOrder(shopifyOrder);
    
    res.json({
      success: syncResult.success,
      shopifyOrderId: syncResult.shopifyOrderId,
      kimlandOrderId: syncResult.kimlandOrderId,
      error: syncResult.error,
      timestamp: syncResult.timestamp
    });
    */

  } catch (error) {
    logger.error('❌ Erreur sync commande manuelle', {
      orderId,
      shop,
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur de synchronisation'
    });
  }
}));

/**
 * Synchroniser toutes les commandes récentes
 */
router.post('/sync/recent', asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const { days = 7 } = req.body;

  if (!shop) {
    return res.status(400).json({
      success: false,
      error: 'Paramètre shop requis'
    });
  }

  try {
    // Date de début (x jours en arrière)
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);

    logger.info('🔄 Début sync commandes récentes', {
      shop,
      days,
      sinceDate: sinceDate.toISOString()
    });

    // TODO: Récupérer l'accessToken depuis le stockage de session/auth
    // Pour l'instant, on simule avec une erreur explicite
    return res.status(501).json({
      success: false,
      error: 'Synchronisation en lot non implémentée - utiliser les webhooks'
    });

    /*
    // Code pour plus tard quand on aura l'accessToken
    const shopifyOrders = await shopifyApiService.getOrders(shop, {
      status: 'any',
      created_at_min: sinceDate.toISOString(),
      limit: 250
    }, accessToken);

    if (!shopifyOrders || shopifyOrders.length === 0) {
      return res.json({
        success: true,
        message: 'Aucune commande récente trouvée',
        stats: {
          total: 0,
          successful: 0,
          failed: 0,
          results: []
        }
      });
    }

    // Filtrer les commandes éligibles
    const eligibleOrders = shopifyKimlandOrderSync.filterEligibleOrders(shopifyOrders);
    
    logger.info('📊 Commandes filtrées', {
      totalOrders: shopifyOrders.length,
      eligibleOrders: eligibleOrders.length
    });

    // Synchroniser en lot
    const syncStats = await shopifyKimlandOrderSync.syncMultipleOrders(eligibleOrders);

    res.json({
      success: true,
      message: `Synchronisation terminée: ${syncStats.successful}/${syncStats.total} commandes`,
      stats: syncStats
    });
    */

  } catch (error) {
    logger.error('❌ Erreur sync commandes récentes', {
      shop,
      days,
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur de synchronisation'
    });
  }
}));

/**
 * Obtenir le statut de synchronisation des commandes
 */
router.get('/sync/status', asyncHandler(async (req: Request, res: Response) => {
  try {
    const connectionStatus = await shopifyKimlandOrderSync.getConnectionStatus();
    const stats = shopifyKimlandOrderSync.getStats();

    res.json({
      success: true,
      status: {
        kimlandConnected: connectionStatus.connected,
        connectionError: connectionStatus.error,
        lastSync: stats.lastSync,
        totalSynced: stats.totalSynced,
        errors: stats.errors
      }
    });

  } catch (error) {
    logger.error('❌ Erreur statut sync commandes', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors de la récupération du statut'
    });
  }
}));

/**
 * Tester la synchronisation avec une commande fictive
 */
router.post('/sync/test', asyncHandler(async (req: Request, res: Response) => {
  try {
    const testOrder = {
      id: 'TEST_' + Date.now(),
      order_number: 'TEST_001',
      test: false, // Forcer le traitement même si c'est un test
      customer: {
        email: 'test@kimland.test',
        first_name: 'Test',
        last_name: 'Client'
      },
      shipping_address: {
        first_name: 'Test',
        last_name: 'Client',
        address1: '123 Rue de Test',
        city: 'Alger',
        province: 'Alger',
        country: 'Algeria',
        phone: '0555123456'
      },
      line_items: [{
        id: 1,
        product_id: 123,
        variant_id: 456,
        sku: 'TEST-SKU-001',
        name: 'Produit Test',
        quantity: 1,
        price: '29.99'
      }],
      total_price: '29.99',
      financial_status: 'paid',
      created_at: new Date().toISOString()
    };

    const syncResult = await shopifyKimlandOrderSync.syncSingleOrder(testOrder);

    res.json({
      success: true,
      message: 'Test de synchronisation effectué',
      result: syncResult
    });

  } catch (error) {
    logger.error('❌ Erreur test sync commande', {
      error: error instanceof Error ? error.message : String(error)
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Erreur lors du test'
    });
  }
}));

export { router as ordersRoutes };