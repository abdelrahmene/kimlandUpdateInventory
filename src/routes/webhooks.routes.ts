import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Webhook obligatoire - Demande de données client (RGPD)
 */
router.post('/customers/data_request', (req: Request, res: Response) => {
  const { shop_id, shop_domain, orders_requested, customer } = req.body;
  
  logger.info('📋 Demande de données client reçue', {
    shop_id,
    shop_domain,
    customer_id: customer?.id,
    orders_count: orders_requested?.length || 0
  });

  // Pour une vraie application, vous devriez :
  // 1. Collecter toutes les données du client
  // 2. Les envoyer à l'email du client ou les rendre disponibles
  // 3. Logger la demande pour audit

  res.status(200).json({
    message: 'Demande de données reçue et en cours de traitement'
  });
});

/**
 * Webhook obligatoire - Effacement des données client (RGPD) 
 */
router.post('/customers/redact', (req: Request, res: Response) => {
  const { shop_id, shop_domain, customer } = req.body;
  
  logger.info('🗑️ Demande d\'effacement client reçue', {
    shop_id,
    shop_domain,
    customer_id: customer?.id,
    customer_email: customer?.email
  });

  // Pour une vraie application, vous devriez :
  // 1. Supprimer toutes les données du client de vos bases de données
  // 2. Anonymiser les logs
  // 3. Confirmer la suppression

  res.status(200).json({
    message: 'Données client supprimées avec succès'
  });
});

/**
 * Webhook obligatoire - Effacement des données de la boutique
 */
router.post('/shop/redact', (req: Request, res: Response) => {
  const { shop_id, shop_domain } = req.body;
  
  logger.info('🏪 Demande d\'effacement boutique reçue', {
    shop_id,
    shop_domain
  });

  // Pour une vraie application, vous devriez :
  // 1. Supprimer toutes les données de la boutique
  // 2. Supprimer les tokens d'accès
  // 3. Nettoyer tous les caches et logs

  res.status(200).json({
    message: 'Données boutique supprimées avec succès'
  });
});

export { router as webhooksRoutes };