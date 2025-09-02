import { Router, Request, Response } from 'express';
import { requireAuth, validateShop } from '../middleware/auth.middleware';
import { shopifyApiService } from '../services/shopify-api.service';
import { kimlandService } from '../services/kimland/kimland.service';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error.middleware';
import { ShopifyProduct } from '../types/shopify.types';
import { config } from '../config';
import { firebaseService } from '../services/firebase.service';

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
    let reference = extractReferenceFromDescription(product.body_html || '');
    if (!reference) {
      reference = extractReferenceFromDescription(product.title || '');
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
 * Met à jour les SKU de tous les produits avec leurs références
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
    const results = [];
    
    for (const product of products) {
      let reference = extractReferenceFromDescription(product.body_html || '');
      if (!reference) {
        reference = extractReferenceFromDescription(product.title || '');
      }
      
      if (!reference) {
        skipped++;
        continue;
      }
      
      // Mettre à jour chaque variante
      for (const variant of product.variants) {
        try {
          await shopifyApiService.updateVariantSku(
            shop, 
            accessToken, 
            variant.id.toString(), 
            reference
          );
          updated++;
        } catch (error) {
          logger.warn('Erreur variante', { productId: product.id, variantId: variant.id });
        }
      }
      
      results.push({
        productId: product.id,
        title: product.title,
        reference,
        variantsUpdated: product.variants.length
      });
    }
    
    res.json({
      success: true,
      totalProducts: products.length,
      updated,
      skipped,
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
        reference: extractReferenceFromDescription(product.body_html || ''),
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
      reference: product.variants?.[0]?.sku || extractReferenceFromDescription(product.body_html || ''),
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
      reference: extractReferenceFromDescription(product.body_html || ''),
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
        reference: extractReferenceFromDescription(product.body_html || '')
      }
    });
    
  } catch (error) {
    logger.error('Erreur récupération produit', { error, shop, productId });
    res.status(500).json({ error: 'Erreur lors de la récupération du produit' });
  }
}));

/**
 * Synchroniser l'inventaire d'un produit avec Kimland
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
    
    // Récupérer le SKU (référence) du produit
    const sku = product.variants[0]?.sku;
    if (!sku) {
      return res.status(400).json({ 
        error: 'SKU manquant', 
        message: 'Le produit doit avoir un SKU pour la synchronisation' 
      });
    }
    
    // Synchroniser avec Kimland
    const syncResult = await kimlandService.syncProductInventory(sku, productId);
    
    res.json({
      success: syncResult.syncStatus === 'success',
      productId,
      sku,
      syncResult
    });
    
  } catch (error) {
    logger.error('Erreur sync inventaire', { error, shop, productId });
    res.status(500).json({ error: 'Erreur lors de la synchronisation inventaire' });
  }
}));

/**
 * Synchroniser l'inventaire de tous les produits avec Kimland
 */
router.post('/products/sync-all-inventory', validateShop, requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  try {
    const accessToken = req.accessToken!;
    const products = await shopifyApiService.getAllProducts(shop, accessToken);
    
    // Préparer la liste des produits avec SKU
    const productsToSync = products
      .filter(p => p.variants?.[0]?.sku)
      .map(p => ({
        sku: p.variants[0].sku!,
        shopifyProductId: p.id.toString()
      }));
    
    if (productsToSync.length === 0) {
      return res.json({
        success: false,
        message: 'Aucun produit avec SKU trouvé'
      });
    }
    
    // Synchroniser avec Kimland
    const syncResults = await kimlandService.syncMultipleProducts(productsToSync);
    
    const summary = {
      total: syncResults.length,
      success: syncResults.filter(r => r.syncStatus === 'success').length,
      notFound: syncResults.filter(r => r.syncStatus === 'not_found').length,
      errors: syncResults.filter(r => r.syncStatus === 'error').length
    };
    
    res.json({
      success: summary.success > 0,
      summary,
      results: syncResults
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
 * Extraire la référence depuis la description HTML
 */
function extractReferenceFromDescription(html: string): string | null {
  if (!html) return null;
  
  // Nettoyer le HTML
  const cleanText = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
  // Patterns de recherche pour différents formats de référence
  const patterns = [
    /ref[erence]*\s*:?\s*([a-zA-Z0-9\-_]+)/i,
    /référence\s*:?\s*([a-zA-Z0-9\-_]+)/i,
    /sku\s*:?\s*([a-zA-Z0-9\-_]+)/i,
    /code\s*:?\s*([a-zA-Z0-9\-_]+)/i,
    /model\s*:?\s*([a-zA-Z0-9\-_]+)/i,
    /modèle\s*:?\s*([a-zA-Z0-9\-_]+)/i,
    // Patterns spécifiques pour vos formats
    /\b(DP-[A-Z0-9]+)\b/i,
    /\b([0-9]+F-[0-9]+)\b/i,
    /\b([A-Z]{2,3}-[A-Z0-9]{2,5})\b/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

export { router as apiRoutes };