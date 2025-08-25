import { Router, Request, Response } from 'express';
import { config } from '../config';
import { validateOAuth } from '../middleware/auth.middleware';
import { shopifyApiService } from '../services/shopify-api.service';
import { firebaseService } from '../services/firebase.service';
import { CryptoUtils, ValidationUtils } from '../utils/helpers';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

/**
 * Route d'installation - génère l'URL OAuth
 */
router.get('/install', (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  logger.info('🎨 Route d\'installation accédée', { shop, query: req.query });
  
  if (!shop) {
    logger.warn('⚠️ Paramètre shop manquant');
    return res.status(400).json({ error: 'Paramètre shop requis' });
  }
  
  const normalizedShop = ValidationUtils.normalizeShopDomain(shop);
  const state = CryptoUtils.generateState();
  
  const authUrl = `https://${normalizedShop}/admin/oauth/authorize?` +
    `client_id=${config.shopify.apiKey}&` +
    `scope=${config.shopify.scopes}&` +
    `redirect_uri=${encodeURIComponent(config.shopify.redirectUri)}&` +
    `state=${state}&` +
    `option[]=grant_option`;
  
  logger.info('🔄 Redirection OAuth générée', { 
    shop: normalizedShop, 
    authUrl,
    clientId: config.shopify.apiKey,
    redirectUri: config.shopify.redirectUri,
    state
  });
  
  res.redirect(authUrl);
});

/**
 * Route de login (alias pour install)
 */
router.get('/login', (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  res.redirect(`/auth/install?shop=${encodeURIComponent(shop)}`);
});

/**
 * Callback OAuth Shopify
 */
router.get('/callback', validateOAuth, asyncHandler(async (req: Request, res: Response) => {
  const { code, shop, state, hmac } = req.oauth!;
  
  logger.info('📨 Callback OAuth reçu', { 
    shop, 
    state, 
    codeLength: code?.length,
    hmac: hmac?.substring(0, 10) + '...',
    allParams: req.query
  });

  const normalizedShop = ValidationUtils.normalizeShopDomain(shop);

  // Vérifier HMAC
  const params = new URLSearchParams(req.query as Record<string, string>);
  params.delete('hmac');
  params.delete('signature');
  params.sort();
  
  const hmacValid = CryptoUtils.verifyShopifyHmac(params.toString(), hmac);
  logger.info('🔐 Vérification HMAC', { 
    shop: normalizedShop,
    hmacValid,
    paramsString: params.toString()
  });
  
  if (!hmacValid) {
    logger.error('❌ Vérification HMAC échouée', { shop: normalizedShop });
    return res.status(400).json({ error: 'HMAC invalide' });
  }

  try {
    logger.info('🔄 Début du processus d\'échange de token', { shop: normalizedShop });
    
    // Échanger le code contre un access token
    const accessToken = await shopifyApiService.exchangeCodeForToken(normalizedShop, code);
    const shopInfo = await shopifyApiService.getShopInfo(normalizedShop, accessToken);
    
    if (!shopInfo) {
      logger.error('❌ Infos boutique non récupérées - token invalide?');
      throw new Error('Access token invalide');
    }

    logger.info('💾 Sauvegarde des données boutique', {
      shopId: shopInfo.id,
      shopName: shopInfo.name,
      domain: shopInfo.domain
    });

    // Sauvegarder dans Firebase
    await firebaseService.saveShopData({
      shop: normalizedShop,  // ← AJOUT de ce champ obligatoire
      id: shopInfo.id.toString(),
      name: shopInfo.name,
      domain: shopInfo.domain,
      myshopifyDomain: normalizedShop,
      accessToken,
      email: shopInfo.email || '',
      country: shopInfo.country_code || '',
      currency: shopInfo.currency || 'EUR',
      planName: shopInfo.plan_name || 'basic',
      installedAt: new Date(),
      isActive: true
    });

    logger.info('✅ App installée avec succès', { shop: normalizedShop });

    // Rediriger vers le dashboard
    const dashboardUrl = `/dashboard.html?shop=${encodeURIComponent(normalizedShop)}`;
    logger.info('🔄 Redirection vers dashboard', { dashboardUrl });
    res.redirect(dashboardUrl);
    
  } catch (error) {
    logger.error('❌ Erreur lors de l\'installation', { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      shop: normalizedShop 
    });
    res.status(500).json({ 
      error: 'Erreur lors de l\'installation',
      details: error instanceof Error ? error.message : 'Erreur inconnue'
    });
  }
}));

/**
 * Désinstallation webhook
 */
router.post('/uninstall', asyncHandler(async (req: Request, res: Response) => {
  const shop = req.body.domain;
  
  logger.info('Webhook de désinstallation reçu', { shop });
  
  try {
    await firebaseService.deactivateShop(shop);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Erreur lors de la désinstallation', { error, shop });
    res.status(500).send('Erreur');
  }
}));

/**
 * Route pour vider le token (force réauth)
 */
router.post('/clear-token', asyncHandler(async (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  if (!shop) {
    return res.status(400).json({ error: 'Shop requis' });
  }
  
  const memoryStorage = (await import('../storage/memory-storage.service')).memoryStorage;
  await memoryStorage.clearShopToken(shop);
  
  res.json({ success: true, message: 'Token vidé, réauth nécessaire' });
}));

export { router as authRoutes };