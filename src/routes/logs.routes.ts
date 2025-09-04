import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { asyncHandler } from '../middleware/error.middleware';

const router = Router();

// Store for real-time connections (in production, use Redis or WebSocket)
const sseConnections = new Set<Response>();

/**
 * Server-Sent Events endpoint for real-time logs
 */
router.get('/stream', (req: Request, res: Response) => {
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Connexion établie au stream temps réel'
  })}\n\n`);

  // Add connection to active connections
  sseConnections.add(res);

  // Handle client disconnect
  req.on('close', () => {
    sseConnections.delete(res);
  });

  req.on('aborted', () => {
    sseConnections.delete(res);
  });
});

/**
 * Send message to all connected clients
 */
export function broadcastToClients(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  sseConnections.forEach(res => {
    try {
      res.write(message);
    } catch (error) {
      // Remove broken connections
      sseConnections.delete(res);
    }
  });
}

/**
 * Get recent log entries
 */
router.get('/recent', asyncHandler(async (req: Request, res: Response) => {
  try {
    const logPath = path.join(process.cwd(), 'logs', 'app.log');
    
    if (!fs.existsSync(logPath)) {
      return res.json({
        success: true,
        logs: []
      });
    }

    const logContent = fs.readFileSync(logPath, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    
    // Parse recent log entries (last 50)
    const recentLogs = lines.slice(-50).map(line => {
      try {
        // Parse log format: [timestamp] [level] message - data
        const match = line.match(/\[([^\]]+)\] \[([^\]]+)\] (.*?) - (.+)/);
        if (match) {
          const [, timestamp, level, message, dataStr] = match;
          let data = null;
          try {
            data = JSON.parse(dataStr);
          } catch (e) {
            data = { raw: dataStr };
          }
          
          return {
            timestamp,
            level: level.toLowerCase(),
            message: message.replace(/[📡🌐📦📥🎯💳⚠️❌✅]/g, '').trim(),
            data,
            icon: getIconForMessage(message)
          };
        }
        return null;
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    res.json({
      success: true,
      logs: recentLogs.reverse() // Most recent first
    });

  } catch (error) {
    logger.error('❌ Erreur lecture logs', {
      error: error instanceof Error ? error.message : String(error)
    });
    
    res.status(500).json({
      success: false,
      error: 'Erreur lecture des logs'
    });
  }
}));

/**
 * Get icon based on log message content
 */
function getIconForMessage(message: string): string {
  if (message.includes('Webhook reçu')) return '📦';
  if (message.includes('Traitement webhook')) return '⚙️';
  if (message.includes('synchronisée avec succès')) return '✅';
  if (message.includes('Échec') || message.includes('Erreur')) return '❌';
  if (message.includes('ignorée') || message.includes('non payée')) return '⚠️';
  if (message.includes('getProducts')) return '🔍';
  if (message.includes('API')) return '🌐';
  return '📝';
}

export { router as logsRoutes };