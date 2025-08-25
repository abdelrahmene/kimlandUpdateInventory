import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import session from 'express-session';
import path from 'path';
import { config } from './config';
import { authRoutes } from './routes/auth.routes';
import { apiRoutes } from './routes/api.routes';
import { debugRoutes } from './routes/debug.routes';
import { errorHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';
import { firebaseService } from './services/firebase.service';

const app: Application = express();

// Configuration des middlewares
app.use(cors({
  origin: config.app.allowedOrigins,
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Configuration des sessions
app.use(session({
  secret: config.app.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.app.env === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24h
  }
}));

// Servir les fichiers statiques
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../public/assets')));

// Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/debug', debugRoutes);

// Route d'installation principale
app.get('/install', (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  if (!shop) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erreur - Installation</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          .error { color: #d32f2f; }
        </style>
      </head>
      <body>
        <h1 class="error">Paramètre manquant</h1>
        <p>Le paramètre 'shop' est requis pour l'installation.</p>
      </body>
      </html>
    `);
  }

  const installUrl = `https://${shop}/admin/oauth/authorize?client_id=${config.shopify.apiKey}&scope=${config.shopify.scopes}&redirect_uri=${encodeURIComponent(config.shopify.redirectUri)}&state=${Date.now()}`;
  
  res.redirect(`/auth/install?shop=${encodeURIComponent(shop)}`);
});

// Route principale - Dashboard
app.get('/', (req: Request, res: Response) => {
  const shop = req.query.shop as string;
  
  if (!shop) {
    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Kimland App</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
      </head>
      <body class="bg-gray-100">
        <div class="min-h-screen flex items-center justify-center">
          <div class="bg-white p-8 rounded-lg shadow-md">
            <h1 class="text-2xl font-bold text-center mb-6">Kimland App</h1>
            <p class="text-gray-600 text-center mb-4">Veuillez spécifier votre boutique Shopify</p>
            <div class="flex">
              <input type="text" id="shopInput" placeholder="votre-boutique" 
                     class="flex-1 px-3 py-2 border border-gray-300 rounded-l-md">
              <span class="px-3 py-2 bg-gray-50 border-t border-b border-r border-gray-300 rounded-r-md text-gray-500">
                .myshopify.com
              </span>
            </div>
            <button onclick="install()" 
                    class="w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
              Installer l'app
            </button>
          </div>
        </div>
        <script>
          function install() {
            const shop = document.getElementById('shopInput').value.trim();
            if (shop) {
              window.location.href = '/install?shop=' + encodeURIComponent(shop + '.myshopify.com');
            }
          }
        </script>
      </body>
      </html>
    `);
  }

  // Redirect to dashboard with shop parameter
  res.redirect(`/dashboard.html?shop=${encodeURIComponent(shop)}`);
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route non trouvée' });
});

// Error handler (doit être en dernier)
app.use(errorHandler);

// Démarrage du serveur
const port = config.app.port;

const startServer = async () => {
  try {
    // Firebase s'initialise automatiquement lors de l'instanciation
    logger.info('🚀 Services initialisés');

    app.listen(port, '0.0.0.0', () => {
      logger.info(`Serveur démarré sur le port ${port}`);
      logger.info(`Environment: ${config.app.env}`);
      logger.info(`Dashboard: http://localhost:${port}`);
    });
  } catch (error) {
    logger.error('Erreur lors du démarrage du serveur', error);
    process.exit(1);
  }
};

// Gestion des erreurs non capturées
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

if (require.main === module) {
  startServer();
}

export { app };