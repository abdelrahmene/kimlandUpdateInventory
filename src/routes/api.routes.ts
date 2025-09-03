import { Router, Request, Response } from 'express';
import { requireAuth, validateShop } from '../middleware/auth.middleware';
import { shopifyApiService } from '../services/shopify-api.service';
import { kimlandService } from '../services/kimland/kimland.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error.middleware';
import { ShopifyProduct } from '../types/shopify.types';
import { config } from '../config';
import { firebaseService } from '../services/firebase.service';
import { ReferenceExtractor } from '../utils/reference-extractor';

const router = Router();

/**
 * Route de test simple
 */
router.get('/test', (req: Request, res: Response) => {
  res.json({ success: true, message: 'API fonctionne!', timestamp: new Date().toISOString() });
});

/**
 * Récupérer l'access token d'une boutique
 */
router.get('/get-token', asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  if (!shop) {
    return res.status(400).json({ error: 'Paramètre shop requis' });
  }
  
  try {
    const shopData = await firebaseService.getShopData(shop);
    
    if (!shopData) {
      return res.status(404).json({ error: 'Boutique non trouvée' });
    }
    
    res.json({
      success: true,
      shop: shop,
      shopName: shopData.name,
      accessToken: shopData.accessToken,
      isActive: shopData.isActive,
      installedAt: shopData.installedAt
    });
    
  } catch (error) {
    logger.error('Erreur récupération token', { error, shop });
    res.status(500).json({ error: 'Erreur serveur' });
  }
}));

/**
 * Met à jour le SKU d'un produit avec sa référence extraite
 */
router.put('/products/:productId/update-sku', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const productId = req.params.productId;
  
  if (!shop) {
    return res.status(400).json({ success: false, error: 'Shop parameter required' });
  }
  
  try {
    const accessToken = req.accessToken!;
    
    // Récupérer le produit
    const product = await shopifyApiService.getProduct(shop, accessToken, productId);
    if (!product) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    // Extraire la référence depuis description OU titre
    let reference = ReferenceExtractor.extractFromDescription(product.body_html || '');
    if (!reference) {
      reference = ReferenceExtractor.extractFromDescription(product.title || '');
    }
    if (!reference) {
      return res.status(400).json({ 
        error: 'Aucune référence trouvée', 
        title: product.title,
        description: product.body_html?.substring(0, 200) + '...' 
      });
    }
    
    // Mettre à jour chaque variante avec la référence comme SKU
    const updatedVariants = [];
    for (const variant of product.variants) {
      const updatedVariant = await shopifyApiService.updateVariantSku(
        shop, 
        accessToken, 
        variant.id.toString(), 
        reference
      );
      if (updatedVariant) updatedVariants.push(updatedVariant);
    }
    
    res.json({
      success: true,
      productId,
      reference,
      updatedVariants: updatedVariants.length,
      message: `SKU mis à jour avec la référence: ${reference}`
    });
    
  } catch (error) {
    logger.error('Erreur mise à jour SKU', { error, shop, productId });
    res.status(500).json({ error: 'Erreur lors de la mise à jour du SKU' });
  }
}));

/**
 * Met à jour les SKU de tous les produits avec leurs références - VERSION CORRIGÉE
 */
router.post('/products/update-all-sku', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  if (!shop) {
    return res.status(400).json({ success: false, error: 'Shop parameter required' });
  }
  
  try {
    const accessToken = req.accessToken!;
    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const results = [];
    
    for (const product of products) {
      // 🎯 CORRECTION 1 : Extraire la référence avec l'extracteur officiel
      let reference = ReferenceExtractor.extractFromDescription(product.body_html || '');
      if (!reference) {
        reference = ReferenceExtractor.extractFromDescription(product.title || '');
      }
      
      if (!reference || !ReferenceExtractor.isValidReference(reference)) {
        skipped++;
        results.push({
          productId: product.id,
          title: product.title,
          status: 'skipped',
          reason: 'Aucune référence valide trouvée'
        });
        continue;
      }
      
      // 🔧 CORRECTION 2 : Normaliser la référence
      reference = ReferenceExtractor.normalizeReference(reference);
      
      // 🔄 CORRECTION 3 : Mettre à jour TOUTES les variantes avec la même référence
      let productUpdated = 0;
      let productErrors = 0;
      
      for (const variant of product.variants) {
        try {
          // Vérifier si le SKU est déjà correct
          if (variant.sku === reference) {
            logger.info('🔄 SKU déjà correct', { productId: product.id, variantId: variant.id, sku: reference });
            continue;
          }
          
          await shopifyApiService.updateVariantSku(
            shop, 
            accessToken, 
            variant.id.toString(), 
            reference
          );
          productUpdated++;
          updated++;
          
          // Délai entre les requêtes pour éviter le rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error: any) {
          productErrors++;
          errors++;
          logger.error('❌ Erreur mise à jour variant SKU', { 
            productId: product.id, 
            variantId: variant.id, 
            reference,
            error: error.message,
            status: error.response?.status
          });
          
          // Si erreur 429 (rate limit), attendre plus longtemps
          if (error.response?.status === 429) {
            logger.warn('⏳ Rate limit detecté, pause 2s', { productId: product.id });
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      }
      
      results.push({
        productId: product.id,
        title: product.title,
        reference,
        variantsTotal: product.variants.length,
        variantsUpdated: productUpdated,
        variantsErrors: productErrors,
        status: productErrors === 0 ? 'success' : (productUpdated > 0 ? 'partial' : 'failed')
      });
    }
    
    res.json({
      success: errors === 0,
      summary: {
        totalProducts: products.length,
        updated,
        skipped,
        errors,
        successRate: products.length > 0 ? Math.round((updated / (updated + errors)) * 100) : 0
      },
      results
    });
    
  } catch (error) {
    logger.error('Erreur mise à jour globale SKU', { error, shop });
    res.status(500).json({ error: 'Erreur lors de la mise à jour globale' });
  }
}));

/**
 * Test avec données simulées si aucun produit
 */
router.get('/products-mock', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  // Produits simulés pour tester l'interface
  const mockProducts = [
    {
      id: 1,
      title: "Produit Test 1",
      handle: "produit-test-1",
      status: "active",
      vendor: "Test Vendor",
      product_type: "Test Type",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      variants: [{
        id: 1,
        title: "Default",
        sku: "TEST-001",
        inventory_quantity: 10,
        price: "29.99",
        compare_at_price: "39.99",
        weight: 100,
        barcode: "123456789"
      }],
      reference: "REF-TEST-001",
      images: [{
        id: 1,
        src: "https://via.placeholder.com/300",
        alt: "Test Image"
      }]
    },
    {
      id: 2,
      title: "Produit Test 2",
      handle: "produit-test-2", 
      status: "active",
      vendor: "Test Vendor",
      product_type: "Test Type",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      variants: [{
        id: 2,
        title: "Variant A",
        sku: "TEST-002-A",
        inventory_quantity: 5,
        price: "19.99",
        compare_at_price: null,
        weight: 75,
        barcode: "123456790"
      }],
      reference: "REF-TEST-002",
      images: []
    }
  ];
  
  res.json({
    success: true,
    products: mockProducts,
    pagination: {
      page: 1,
      limit: 50,
      total: mockProducts.length
    },
    message: "Données simulées - Ajoutez des produits dans Shopify pour des données réelles"
  });
}));

/**
 * Dashboard principal
 */
router.get('/dashboard', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  try {
    const accessToken = req.accessToken!;
    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    
    res.json({
      success: true,
      shop: { shop, isConnected: true },
      products: products.map(product => ({
        id: product.id,
        title: product.title,
        handle: product.handle,
        status: product.status,
        vendor: product.vendor,
        product_type: product.product_type,
        variants: product.variants?.map(variant => ({
          id: variant.id,
          title: variant.title,
          sku: variant.sku,
          inventory_quantity: variant.inventory_quantity,
          price: variant.price,
          compare_at_price: variant.compare_at_price
        })) || [],
        reference: ReferenceExtractor.extractFromDescription(product.body_html || ''),
        image: product.images?.[0]?.src || null
      }))
    });
    
  } catch (error) {
    logger.error('Erreur dashboard', { error, shop });
    res.status(500).json({ error: 'Erreur lors du chargement du dashboard' });
  }
}));

/**
 * Recherche de produits par nom ou SKU
 */
router.get('/products/search', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const searchTerm = req.query.q as string;
  
  if (!searchTerm) {
    return res.status(400).json({
      success: false,
      error: 'Paramètre de recherche (q) requis'
    });
  }
  
  if (searchTerm.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Le terme de recherche doit contenir au moins 2 caractères'
    });
  }
  
  try {
    const accessToken = req.accessToken!;
    
    // 🔍 Rechercher via l'API Shopify avec tous les produits
    const allProducts = await shopifyApiService.getAllProducts(shop, accessToken);
    
    const searchLower = searchTerm.toLowerCase();
    
    // Filtrer les produits par nom ET SKU simultanément
    const filteredProducts = allProducts.filter(product => {
      // Recherche par titre du produit
      const matchesTitle = product.title.toLowerCase().includes(searchLower);
      
      // Recherche par SKU de n'importe quelle variante
      const matchesSku = product.variants && product.variants.some(variant => 
        variant.sku && variant.sku.toLowerCase().includes(searchLower)
      );
      
      return matchesTitle || matchesSku;
    });
    
    // Transformer au format standardisé
    const processedProducts = filteredProducts.map(product => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      vendor: product.vendor,
      product_type: product.product_type,
      created_at: product.created_at,
      updated_at: product.updated_at,
      variants: product.variants?.map(variant => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        inventory_quantity: variant.inventory_quantity,
        price: variant.price,
        compare_at_price: variant.compare_at_price,
        weight: variant.weight,
        barcode: variant.barcode
      })) || [],
      reference: product.variants?.[0]?.sku || ReferenceExtractor.extractFromDescription(product.body_html || ''),
      images: product.images?.map(img => ({
        id: img.id,
        src: img.src,
        alt: img.alt
      })) || []
    }));
    
    logger.info(`🔍 Recherche terminée: ${processedProducts.length} produits trouvés pour "${searchTerm}"`);
    
    res.json({
      success: true,
      products: processedProducts,
      searchTerm: searchTerm,
      totalFound: processedProducts.length,
      searchedIn: allProducts.length
    });
    
  } catch (error) {
    logger.error('❌ Erreur recherche produits', { error, shop, searchTerm });
    res.status(500).json({
      success: false,
      error: 'Erreur lors de la recherche',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

/**
 * Récupérer tous les produits
 */
router.get('/products', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  
  try {
    const accessToken = req.accessToken!;
    const products = await shopifyApiService.getProducts(shop, accessToken, { page, limit });
    
    const processedProducts = products.map(product => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      status: product.status,
      vendor: product.vendor,
      product_type: product.product_type,
      created_at: product.created_at,
      updated_at: product.updated_at,
      variants: product.variants?.map(variant => ({
        id: variant.id,
        title: variant.title,
        sku: variant.sku,
        inventory_quantity: variant.inventory_quantity,
        price: variant.price,
        compare_at_price: variant.compare_at_price,
        weight: variant.weight,
        barcode: variant.barcode
      })) || [],
      reference: ReferenceExtractor.extractFromDescription(product.body_html || ''),
      images: product.images?.map(img => ({
        id: img.id,
        src: img.src,
        alt: img.alt
      })) || []
    }));
    
    res.json({
      success: true,
      products: processedProducts,
      pagination: {
        page,
        limit,
        total: processedProducts.length
      }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = {
      name: error instanceof Error ? error.name : 'Unknown',
      message: errorMessage,
      stack: errorStack,
      shop,
      accessTokenExists: !!req.accessToken,
      accessTokenLength: req.accessToken?.length || 0,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
    };
    
    logger.error('Erreur récupération produits - DÉTAILS COMPLETS', errorDetails);
    res.status(500).json({ 
      success: false,
      error: 'Erreur lors de la récupération des produits',
      details: errorMessage
    });
  }
}));

/**
 * Récupérer un produit spécifique
 */
router.get('/products/:productId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const productId = req.params.productId;
  
  try {
    const accessToken = req.accessToken!;
    const product = await shopifyApiService.getProduct(shop, accessToken, productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    res.json({
      success: true,
      product: {
        ...product,
        reference: ReferenceExtractor.extractFromDescription(product.body_html || '')
      }
    });
    
  } catch (error) {
    logger.error('Erreur récupération produit', { error, shop, productId });
    res.status(500).json({ error: 'Erreur lors de la récupération du produit' });
  }
}));

/**
 * Synchroniser l'inventaire d'un produit avec Kimland - VERSION AMÉLIORÉE
 */
router.post('/products/:productId/sync-inventory', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const productId = req.params.productId;
  
  try {
    const accessToken = req.accessToken!;
    const product = await shopifyApiService.getProduct(shop, accessToken, productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Produit non trouvé' });
    }
    
    // 🎯 AMÉLIORATION 1 : Utiliser la référence extraite plutôt que le SKU de la première variante
    let reference = ReferenceExtractor.extractFromDescription(product.body_html || '');
    if (!reference) {
      reference = ReferenceExtractor.extractFromDescription(product.title || '');
    }
    if (!reference) {
      reference = product.variants[0]?.sku;
    }
    
    if (!reference || !ReferenceExtractor.isValidReference(reference)) {
      return res.status(400).json({ 
        error: 'Référence manquante ou invalide', 
        message: 'Le produit doit avoir une référence valide pour la synchronisation',
        extractedReference: reference,
        productTitle: product.title
      });
    }
    
    // 🎯 AMÉLIORATION 2 : Passer le nom du produit pour une recherche plus précise
    const syncResult = await kimlandService.syncProductInventory(
      reference, 
      productId, 
      shop, 
      accessToken, 
      product.title // Ajout du nom du produit
    );
    
    res.json({
      success: syncResult.syncStatus === 'success',
      productId,
      reference,
      productTitle: product.title,
      syncResult
    });
    
  } catch (error) {
    logger.error('Erreur sync inventaire', { error, shop, productId });
    res.status(500).json({ error: 'Erreur lors de la synchronisation inventaire' });
  }
}));

/**
 * Synchroniser l'inventaire de tous les produits avec Kimland - VERSION AMÉLIORÉE
 */
router.post('/products/sync-all-inventory', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  try {
    const accessToken = req.accessToken!;
    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    
    // 🎯 AMÉLIORATION : Préparer la liste des produits avec référence ET nom
    const productsToSync = [];
    let invalidProducts = 0;
    
    for (const product of products) {
      // Extraire la référence avec la même logique que pour la sync individuelle
      let reference = ReferenceExtractor.extractFromDescription(product.body_html || '');
      if (!reference) {
        reference = ReferenceExtractor.extractFromDescription(product.title || '');
      }
      if (!reference) {
        reference = product.variants[0]?.sku;
      }
      
      if (reference && ReferenceExtractor.isValidReference(reference)) {
        productsToSync.push({
          sku: reference,
          shopifyProductId: product.id.toString(),
          productName: product.title // 🎯 Ajout du nom pour recherche précise
        });
      } else {
        invalidProducts++;
        logger.warn('🚫 Produit sans référence valide ignoré', {
          productId: product.id,
          title: product.title,
          extractedRef: reference,
          firstVariantSku: product.variants[0]?.sku
        });
      }
    }
    
    if (productsToSync.length === 0) {
      return res.json({
        success: false,
        message: `Aucun produit avec référence valide trouvé (${invalidProducts} produits invalides)`,
        totalScanned: products.length,
        invalidProducts
      });
    }
    
    logger.info('🚀 Début synchronisation batch améliorée', {
      shop,
      totalProducts: products.length,
      validProducts: productsToSync.length,
      invalidProducts
    });
    
    // 🔄 Synchroniser avec Kimland en utilisant la recherche améliorée
    const syncResults = [];
    for (let i = 0; i < productsToSync.length; i++) {
      const productData = productsToSync[i];
      
      logger.info(`📝 Sync ${i + 1}/${productsToSync.length}`, {
        sku: productData.sku,
        productName: productData.productName
      });
      
      try {
        const syncResult = await kimlandService.syncProductInventory(
          productData.sku,
          productData.shopifyProductId,
          shop,
          accessToken,
          productData.productName // 🎯 Recherche précise avec nom
        );
        
        syncResults.push({
          ...syncResult,
          productName: productData.productName
        });
        
      } catch (error) {
        logger.error('❌ Erreur sync produit individuel', {
          sku: productData.sku,
          productName: productData.productName,
          error: error instanceof Error ? error.message : String(error)
        });
        
        syncResults.push({
          sku: productData.sku,
          shopifyProductId: productData.shopifyProductId,
          kimlandProduct: null,
          syncStatus: 'error' as const,
          errorMessage: error instanceof Error ? error.message : 'Erreur inconnue',
          syncedAt: new Date(),
          productName: productData.productName
        });
      }
      
      // Délai entre les produits pour éviter la surcharge
      if (i < productsToSync.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }
    
    const summary = {
      total: syncResults.length,
      success: syncResults.filter(r => r.syncStatus === 'success').length,
      notFound: syncResults.filter(r => r.syncStatus === 'not_found').length,
      errors: syncResults.filter(r => r.syncStatus === 'error').length,
      invalidProducts
    };
    
    logger.info('✅ Synchronisation batch terminée', {
      shop,
      summary,
      successRate: summary.total > 0 ? Math.round((summary.success / summary.total) * 100) : 0
    });
    
    res.json({
      success: summary.success > 0,
      summary,
      results: syncResults.map(r => ({
        sku: r.sku,
        productName: r.productName || 'N/A',
        syncStatus: r.syncStatus,
        errorMessage: r.errorMessage,
        kimlandStock: r.kimlandProduct ? 
          r.kimlandProduct.variants.reduce((total, v) => total + v.stock, 0) : 0,
        syncedAt: r.syncedAt
      }))
    });
    
  } catch (error) {
    logger.error('Erreur sync global inventaire', { error, shop });
    res.status(500).json({ error: 'Erreur lors de la synchronisation globale' });
  }
}));

/**
 * Synchroniser les produits
 */
router.post('/products/sync', requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  try {
    const accessToken = req.accessToken!;
    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    
    logger.info('Synchronisation des produits', { 
      shop, 
      productCount: products.length 
    });
    
    res.json({
      success: true,
      message: `${products.length} produits synchronisés`,
      count: products.length
    });
    
  } catch (error) {
    logger.error('Erreur synchronisation produits', { error, shop });
    res.status(500).json({ error: 'Erreur lors de la synchronisation' });
  }
}));

/**
 * Routes pour les tests et gestion Kimland
 */

// Test de connexion Kimland
router.post('/kimland/test', asyncHandler(async (req: Request, res: Response) => {
  try {
    const testResult = await kimlandService.testConnection();
    res.json(testResult);
  } catch (error) {
    logger.error('Erreur test Kimland', { error });
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' });
  }
}));

// Statut de connexion Kimland
router.get('/kimland/status', asyncHandler(async (req: Request, res: Response) => {
  try {
    const isConnected = await kimlandService.checkConnection();
    const sessionStats = await kimlandService.getSessionStats();
    
    res.json({
      connected: isConnected,
      timestamp: new Date().toISOString(),
      sessionInfo: sessionStats
    });
  } catch (error) {
    logger.error('Erreur statut Kimland', { error });
    res.json({ connected: false, error: error instanceof Error ? error.message : 'Erreur inconnue' });
  }
}));

// Forcer reconnexion Kimland
router.post('/kimland/force-login', asyncHandler(async (req: Request, res: Response) => {
  try {
    const reconnectResult = await kimlandService.forceLogin();
    res.json(reconnectResult);
  } catch (error) {
    logger.error('Erreur reconnexion forcée Kimland', { error });
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' });
  }
}));

// Vider session Kimland
router.post('/kimland/clear-session', asyncHandler(async (req: Request, res: Response) => {
  try {
    await kimlandService.clearSession();
    res.json({ success: true, message: 'Session vidée avec succès' });
  } catch (error) {
    logger.error('Erreur vidage session Kimland', { error });
    res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' });
  }
}));

/**
 * Route pour synchronisation inventaire individuelle (pour recherche)
 */
router.post('/sync/product/:productId', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  const productId = req.params.productId;
  
  try {
    const accessToken = req.accessToken!;
    const product = await shopifyApiService.getProduct(shop, accessToken, productId);
    
    if (!product) {
      return res.status(404).json({ success: false, error: 'Produit non trouvé' });
    }
    
    // Extraire la référence
    let reference = ReferenceExtractor.extractFromDescription(product.body_html || '');
    if (!reference) {
      reference = ReferenceExtractor.extractFromDescription(product.title || '');
    }
    if (!reference) {
      reference = product.variants[0]?.sku;
    }
    
    if (!reference || !ReferenceExtractor.isValidReference(reference)) {
      return res.status(400).json({ 
        success: false,
        error: 'Référence manquante ou invalide',
        extractedReference: reference,
        productTitle: product.title
      });
    }
    
    // Synchroniser avec Kimland
    const syncResult = await kimlandService.syncProductInventory(
      reference,
      productId,
      shop,
      accessToken,
      product.title
    );
    
    // Calculer les statistiques pour la réponse
    const kimlandStock = syncResult.kimlandProduct ? 
      syncResult.kimlandProduct.variants.reduce((total, v) => total + v.stock, 0) : 0;
    
    res.json({
      success: syncResult.syncStatus === 'success',
      productId,
      sku: reference,
      productName: product.title,
      syncResult,
      kimlandStock,
      updatedQuantity: kimlandStock // Pour compatibilité avec l'interface
    });
    
  } catch (error) {
    logger.error('Erreur sync produit individuel', { error, shop, productId });
    res.status(500).json({ 
      success: false, 
      error: 'Erreur lors de la synchronisation',
      details: error instanceof Error ? error.message : String(error)
    });
  }
}));

/**
 * Route pour synchronisation inventaire globale en streaming
 */
router.post('/sync/inventory/all', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  try {
    const accessToken = req.accessToken!;
    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    
    // Préparer les produits avec références valides
    const productsToSync = [];
    let invalidProducts = 0;
    
    for (const product of products) {
      let reference = ReferenceExtractor.extractFromDescription(product.body_html || '');
      if (!reference) {
        reference = ReferenceExtractor.extractFromDescription(product.title || '');
      }
      if (!reference) {
        reference = product.variants[0]?.sku;
      }
      
      if (reference && ReferenceExtractor.isValidReference(reference)) {
        productsToSync.push({
          sku: reference,
          shopifyProductId: product.id.toString(),
          productName: product.title
        });
      } else {
        invalidProducts++;
      }
    }
    
    if (productsToSync.length === 0) {
      return res.json({
        type: 'complete',
        message: `Aucun produit avec référence valide trouvé (${invalidProducts} produits invalides)`,
        successful: 0,
        failed: 0,
        total: 0,
        successRate: 0,
        duration: 0
      });
    }
    
    // Configuration streaming
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const startTime = Date.now();
    let successful = 0;
    let failed = 0;
    let cancelled = false;
    
    // Envoyer message de démarrage
    res.write(JSON.stringify({
      type: 'info',
      message: `Synchronisation de ${productsToSync.length} produits`,
      canCancel: true,
      total: productsToSync.length
    }) + '\n');
    
    // Gérer l'arrêt de la connexion
    req.on('close', () => {
      cancelled = true;
      logger.info('🚫 Client disconnected, arrêt de la synchronisation');
    });
    
    req.on('aborted', () => {
      cancelled = true;
      logger.info('🚫 Request aborted, arrêt de la synchronisation');
    });
    
    // Synchroniser chaque produit
    for (let i = 0; i < productsToSync.length; i++) {
      if (cancelled) {
        res.write(JSON.stringify({
          type: 'cancelled',
          message: 'Synchronisation arrêtée par l\'utilisateur',
          stoppedAt: i
        }) + '\n');
        break;
      }
      
      const productData = productsToSync[i];
      
      try {
        // Envoyer le progrès
        res.write(JSON.stringify({
          type: 'progress',
          message: `Synchronisation en cours...`,
          current: i + 1,
          total: productsToSync.length,
          percentage: Math.round(((i + 1) / productsToSync.length) * 100),
          productName: productData.productName,
          canCancel: true
        }) + '\n');
        
        // Synchroniser le produit
        const syncResult = await kimlandService.syncProductInventory(
          productData.sku,
          productData.shopifyProductId,
          shop,
          accessToken,
          productData.productName
        );
        
        if (syncResult.syncStatus === 'success') {
          successful++;
        } else {
          failed++;
        }
        
        // Envoyer le résultat
        res.write(JSON.stringify({
          type: 'result',
          sku: productData.sku,
          productName: productData.productName,
          message: syncResult.errorMessage || 'Synchronisé avec succès',
          success: syncResult.syncStatus === 'success',
          kimlandStock: syncResult.kimlandProduct ? 
            syncResult.kimlandProduct.variants.reduce((total, v) => total + v.stock, 0) : 0,
          variantsCount: syncResult.kimlandProduct?.variants.length || 0,
          timestamp: new Date().toISOString()
        }) + '\n');
        
      } catch (error) {
        failed++;
        logger.error('❌ Erreur sync produit streaming', {
          sku: productData.sku,
          productName: productData.productName,
          error: error instanceof Error ? error.message : String(error)
        });
        
        res.write(JSON.stringify({
          type: 'result',
          sku: productData.sku,
          productName: productData.productName,
          message: error instanceof Error ? error.message : 'Erreur inconnue',
          success: false,
          timestamp: new Date().toISOString()
        }) + '\n');
      }
      
      // Délai entre les produits
      if (i < productsToSync.length - 1 && !cancelled) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!cancelled) {
      // Envoyer le résumé final
      const duration = Date.now() - startTime;
      const successRate = productsToSync.length > 0 ? Math.round((successful / productsToSync.length) * 100) : 0;
      
      res.write(JSON.stringify({
        type: 'complete',
        message: 'Synchronisation terminée',
        successful,
        failed,
        total: productsToSync.length,
        successRate,
        duration,
        invalidProducts
      }) + '\n');
    }
    
    res.end();
    
  } catch (error) {
    logger.error('Erreur sync streaming global', { error, shop });
    res.write(JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : 'Erreur inconnue'
    }) + '\n');
    res.end();
  }
}));

export { router as apiRoutes };