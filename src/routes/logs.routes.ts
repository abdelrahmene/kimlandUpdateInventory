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
  console.log('🔗 [DEBUG SSE] Nouvelle connexion SSE démarrée');
  console.log('🔗 [DEBUG SSE] User-Agent:', req.get('User-Agent'));
  console.log('🔗 [DEBUG SSE] IP:', req.ip);
  
  // Set headers for SSE
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial connection message
  const welcomeMessage = {
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Connexion établie au stream temps réel'
  };
  
  console.log('🔗 [DEBUG SSE] Envoi message de bienvenue:', welcomeMessage);
  res.write(`data: ${JSON.stringify(welcomeMessage)}\n\n`);

  // Add connection to active connections
  sseConnections.add(res);
  console.log('🔗 [DEBUG SSE] Connexion ajoutée, total:', sseConnections.size);

  // Handle client disconnect
  req.on('close', () => {
    console.log('🔗 [DEBUG SSE] Connexion fermée (close)');
    sseConnections.delete(res);
    console.log('🔗 [DEBUG SSE] Connexions restantes:', sseConnections.size);
  });

  req.on('aborted', () => {
    console.log('🔗 [DEBUG SSE] Connexion abandonnée (aborted)');
    sseConnections.delete(res);
    console.log('🔗 [DEBUG SSE] Connexions restantes:', sseConnections.size);
  });
});

/**
 * Send message to all connected clients
 */
export function broadcastToClients(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  console.log('📡 [DEBUG SSE] Diffusion vers', sseConnections.size, 'clients connectés');
  console.log('📡 [DEBUG SSE] Message à diffuser:', message);
  console.log('📡 [DEBUG SSE] Données complètes:', data);
  
  let successCount = 0;
  let errorCount = 0;
  let clientIndex = 0;
  
  sseConnections.forEach((res) => {
    clientIndex++;
    try {
      console.log(`📡 [DEBUG SSE] Envoi vers client ${clientIndex}...`);
      res.write(message);
      successCount++;
      console.log(`✅ [DEBUG SSE] Client ${clientIndex} OK`);
    } catch (error) {
      console.error(`❌ [DEBUG SSE] Erreur client ${clientIndex}:`, error);
      // Remove broken connections
      sseConnections.delete(res);
      errorCount++;
    }
  });
  
  console.log(`📊 [DEBUG SSE] Diffusion terminée: ${successCount} succès, ${errorCount} erreurs`);
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