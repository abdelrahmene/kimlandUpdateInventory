import dotenv from 'dotenv';

dotenv.config();

interface Config {
  app: {
    port: number;
    env: string;
    sessionSecret: string;
    allowedOrigins: string[];
  };
  shopify: {
    apiKey: string;
    apiSecret: string;
    scopes: string;
    redirectUri: string;
    apiVersion: string;
  };
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
  collections: {
    shops: string;
    products: string;
    analytics: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  appUrl: string;
}

const config: Config = {
  app: {
    port: parseInt(process.env.PORT || '5000', 10),
    env: process.env.NODE_ENV || 'development',
    sessionSecret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
    allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5000']
  },
  shopify: {
    apiKey: process.env.SHOPIFY_API_KEY || '',
    apiSecret: process.env.SHOPIFY_API_SECRET || '',
    scopes: process.env.SHOPIFY_SCOPES || 'read_products,write_products,read_inventory,write_inventory,read_locations,write_themes,write_themes',
    redirectUri: process.env.SHOPIFY_REDIRECT_URI || 'http://localhost:5000/auth/callback',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-10'
  },
  firebase: {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  },
  collections: {
    shops: process.env.COLLECTION_SHOPS || 'shops',
    products: process.env.COLLECTION_PRODUCTS || 'products',
    analytics: process.env.COLLECTION_ANALYTICS || 'analytics'
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10)
  },
  appUrl: process.env.APP_URL || 'http://localhost:5000'
};

// Validation des variables critiques (seulement en production)
if (config.app.env === 'production') {
  const requiredVars = [
    'SHOPIFY_API_KEY',
    'SHOPIFY_API_SECRET'
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      console.warn(`⚠️  Variable d'environnement manquante: ${varName}`);
    }
  }
}

// Affichage de la configuration en mode développement
if (config.app.env === 'development') {
  console.log('🔧 Configuration chargée:');
  console.log(`   Port: ${config.app.port}`);
  console.log(`   Environment: ${config.app.env}`);
  console.log(`   Shopify API Key: ${config.shopify.apiKey ? '✓ Configurée' : '❌ Manquante'}`);
  console.log(`   Firebase: ${config.firebase.projectId ? '✓ Configuré' : '❌ Non configuré'}`);
}

export { config };