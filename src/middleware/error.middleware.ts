import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export interface CustomError extends Error {
  statusCode?: number;
  code?: string;
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logger.error('Erreur attrapée par le middleware', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    statusCode: err.statusCode,
  });

  // Erreurs par défaut
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Erreur serveur interne';

  // Réponse d'erreur
  res.status(statusCode).json({
    success: false,
    error: message,
    code: err.code,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
    }),
  });
};

export const notFound = (req: Request, res: Response): void => {
  logger.warn('Route non trouvée', {
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  res.status(404).json({
    success: false,
    error: 'Route non trouvée',
    path: req.path,
  });
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
