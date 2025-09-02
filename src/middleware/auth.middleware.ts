// import { Request, Response, NextFunction } from 'express';
// import rateLimit from 'express-rate-limit';
// import { config } from '../config';
// import { ValidationUtils } from '../utils/helpers';
// import { firebaseService } from '../services/firebase.service';
// import { logger } from '../utils/logger';

// /**
//  * Middleware de limitation de taux
//  */
// export const rateLimiter = rateLimit({
//   windowMs: config.rateLimit.windowMs,
//   max: config.rateLimit.maxRequests,
//   message: {
//     success: false,
//     error: 'Trop de requêtes, veuillez réessayer plus tard',
//     retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
//   },
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// /**
//  * Middleware de validation du shop
//  */
// export const validateShop = (req: Request, res: Response, next: NextFunction): void => {
//   const shop = req.query.shop as string || req.body.shop;

//   if (!shop) {
//     res.status(400).json({
//       success: false,
//       error: 'Paramètre shop manquant',
//     });
//     return;
//   }

//   const normalizedShop = ValidationUtils.normalizeShopDomain(shop);

//   if (!ValidationUtils.validateShopDomain(normalizedShop)) {
//     res.status(400).json({
//       success: false,
//       error: 'Format de shop invalide',
//       expected: 'boutique.myshopify.com',
//     });
//     return;
//   }

//   // Ajouter le shop normalisé à la requête
//   req.shop = normalizedShop;
//   next();
// };

// /**
//  * Middleware d'authentification Shopify
//  */
// export const requireAuth = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ): Promise<void> => {
//   try {
//     const shop = req.shop;
    
//     if (!shop) {
//       res.status(400).json({
//         success: false,
//         error: 'Shop non spécifié',
//       });
//       return;
//     }

//     // Vérifier si le shop est connecté (Firebase + mémoire fallback)
//     let accessToken: string | null = null;
    
//     try {
//       accessToken = await firebaseService.getShopToken(shop);
//     } catch (error) {
//       logger.error('Erreur lors de la récupération du token', { shop, error: error instanceof Error ? error.message : error });
//       // Pas de fallback ici - getShopToken gère déjà la mémoire
//     }
    
//     if (!accessToken) {
//       logger.debug('Shop non authentifié', { shop });
//       res.status(401).json({
//         success: false,
//         error: 'AUTH_REQUIRED',
//         message: 'Installation requise',
//         install_url: `${config.appUrl}/auth/login?shop=${encodeURIComponent(shop)}`,
//       });
//       return;
//     }

//     // Ajouter les données du shop à la requête
//     req.accessToken = accessToken;
//     req.shopData = {
//       shop,
//       accessToken,
//       isConnected: true
//     };
//     next();
//   } catch (error) {
//     logger.error('Erreur dans requireAuth middleware', {
//       error: error instanceof Error ? error.message : error,
//       shop: req.shop,
//     });
    
//     res.status(500).json({
//       success: false,
//       error: 'Erreur lors de la vérification de l\'authentification',
//     });
//   }
// };

// /**
//  * Middleware de logging des requêtes
//  */
// export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
//   const start = Date.now();
  
//   res.on('finish', () => {
//     const duration = Date.now() - start;
//     logger.info('Requête HTTP', {
//       method: req.method,
//       url: req.url,
//       status: res.statusCode,
//       duration: `${duration}ms`,
//       ip: req.ip,
//       userAgent: req.get('User-Agent'),
//       shop: req.shop,
//     });
//   });

//   next();
// };

// /**
//  * Middleware de validation des paramètres OAuth
//  */
// export const validateOAuth = (req: Request, res: Response, next: NextFunction): void => {
//   const params = {
//     code: req.query.code as string,
//     shop: req.query.shop as string,
//     state: req.query.state as string,
//     hmac: req.query.hmac as string,
//   };

//   const validation = ValidationUtils.validateOAuthParams(params);

//   if (!validation.isValid) {
//     logger.warn('Paramètres OAuth invalides', {
//       errors: validation.errors,
//       params: Object.keys(params),
//     });

//     res.status(400).json({
//       success: false,
//       error: 'Paramètres OAuth invalides',
//       details: validation.errors,
//     });
//     return;
//   }

//   // Ajouter les paramètres validés à la requête
//   req.oauth = params;
//   next();
// };

// // Étendre l'interface Request pour nos propriétés personnalisées
// declare global {
//   namespace Express {
//     interface Request {
//       shop?: string;
//       accessToken?: string;
//       shopData?: {
//         shop: string;
//         accessToken: string;
//         isConnected: boolean;
//       };
//       oauth?: {
//         code: string;
//         shop: string;
//         state: string;
//         hmac: string;
//       };
//     }
//   }
// }
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { ValidationUtils } from '../utils/helpers';
import { firebaseService } from '../services/firebase.service';
import { secureStoreService } from '../storage/secure-store.service';
import { logger } from '../utils/logger';

/**
 * Middleware de limitation de taux
 */
export const rateLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: 'Trop de requêtes, veuillez réessayer plus tard',
    retryAfter: Math.ceil(config.rateLimit.windowMs / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Middleware de validation du shop
 */
export const validateShop = (req: Request, res: Response, next: NextFunction): void => {
  const shop = req.query.shop as string || req.body.shop;

  if (!shop) {
    res.status(400).json({
      success: false,
      error: 'Paramètre shop manquant',
    });
    return;
  }

  const normalizedShop = ValidationUtils.normalizeShopDomain(shop);

  if (!ValidationUtils.validateShopDomain(normalizedShop)) {
    res.status(400).json({
      success: false,
      error: 'Format de shop invalide',
      expected: 'boutique.myshopify.com',
    });
    return;
  }

  // Ajouter le shop normalisé à la requête
  req.shop = normalizedShop;
  next();
};

/**
 * Middleware d'authentification Shopify (utilise maintenant le stockage sécurisé)
 */
export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const shop = req.shop;

    if (!shop) {
      res.status(400).json({
        success: false,
        error: 'Shop non spécifié',
      });
      return;
    }

    // 🔐 Vérifier l'authentification avec le stockage sécurisé
    let accessToken: string | null = null;

    try {
      // Utiliser directement le service sécurisé (plus rapide, plus fiable)
      accessToken = await secureStoreService.getShopToken(shop);

      // 🔹 Afficher dans la console le token récupéré
      if (accessToken) {
        console.log(`✅ AccessToken pour ${shop}: ${accessToken.substring(0, 20)}...`);
        logger.debug('✅ Token trouvé avec stockage sécurisé', { shop, tokenLength: accessToken.length });
      } else {
        console.log(`❌ Aucun AccessToken pour ${shop}`);
        logger.debug('❌ Aucun token trouvé avec stockage sécurisé', { shop });
      }

    } catch (error) {
      logger.error('Erreur lors de la récupération du token', {
        shop,
        error: error instanceof Error ? error.message : error,
      });
    }

    if (!accessToken) {
      logger.debug('Shop non authentifié', { shop });
      res.status(401).json({
        success: false,
        error: 'AUTH_REQUIRED',
        message: 'Installation requise',
        install_url: `${config.appUrl}/auth/login?shop=${encodeURIComponent(shop)}`,
      });
      return;
    }

    // ✅ Ajouter les données du shop à la requête
    req.accessToken = accessToken;
    req.shopData = {
      shop,
      accessToken,
      isConnected: true
    };
    
    logger.debug('✅ Authentification réussie', { shop, tokenLength: accessToken.length });
    next();
  } catch (error) {
    logger.error('Erreur dans requireAuth middleware', {
      error: error instanceof Error ? error.message : error,
      shop: req.shop,
    });

    res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification de l\'authentification',
    });
  }
};

/**
 * Middleware de logging des requêtes
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Requête HTTP', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      shop: req.shop,
    });
  });

  next();
};

/**
 * Middleware de validation des paramètres OAuth
 */
export const validateOAuth = (req: Request, res: Response, next: NextFunction): void => {
  // Log de tous les paramètres reçus pour debug
  logger.info('Paramètres OAuth callback reçus', {
    query: req.query,
    url: req.url,
    method: req.method,
    headers: req.headers
  });

  const params = {
    code: req.query.code as string || '',
    shop: req.query.shop as string || '',
    state: req.query.state as string || '',
    hmac: req.query.hmac as string || '',
  };

  // Log des paramètres extraits
  logger.info('Paramètres OAuth extraits', {
    code: params.code ? `${params.code.substring(0, 10)}...` : 'MANQUANT',
    shop: params.shop || 'MANQUANT',
    state: params.state || 'MANQUANT',
    hmac: params.hmac ? `${params.hmac.substring(0, 10)}...` : 'MANQUANT'
  });

  const validation = ValidationUtils.validateOAuthParams(params);

  if (!validation.isValid) {
    logger.warn('Paramètres OAuth invalides', {
      errors: validation.errors,
      params: Object.keys(params),
      receivedParams: params
    });

    res.status(400).json({
      success: false,
      error: 'Paramètres OAuth invalides',
      details: validation.errors,
    });
    return;
  }

  // Ajouter les paramètres validés à la requête
  req.oauth = params;
  next();
};

// Étendre l'interface Request pour nos propriétés personnalisées
declare global {
  namespace Express {
    interface Request {
      shop?: string;
      accessToken?: string;
      shopData?: {
        shop: string;
        accessToken: string;
        isConnected: boolean;
      };
      oauth?: {
        code: string;
        shop: string;
        state: string;
        hmac: string;
      };
    }
  }
}
