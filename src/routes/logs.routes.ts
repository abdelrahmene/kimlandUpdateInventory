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
  console.log('🔗 [DEBUG SSE] Protocol:', req.protocol);
  console.log('🔗 [DEBUG SSE] Host:', req.get('Host'));
  
  // Set headers for SSE with better HTTPS support
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
    'Access-Control-Allow-Credentials': 'false',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
    'Transfer-Encoding': 'chunked'
  });

  // Send initial connection message
  const welcomeMessage = {
    type: 'connected',
    timestamp: new Date().toISOString(),
    message: 'Connexion établie au stream temps réel',
    debug: {
      protocol: req.protocol,
      host: req.get('Host'),
      userAgent: req.get('User-Agent')?.substring(0, 50)
    }
  };
  
  console.log('🔗 [DEBUG SSE] Envoi message de bienvenue:', welcomeMessage);
  
  try {
    res.write(`data: ${JSON.stringify(welcomeMessage)}\n\n`);
    // Force flush if available (Node.js HTTP response)
    if ('flush' in res && typeof res.flush === 'function') {
      (res as any).flush();
    }
    console.log('🔗 [DEBUG SSE] Message de bienvenue envoyé avec succès');
  } catch (error) {
    console.error('🔗 [DEBUG SSE] Erreur envoi message bienvenue:', error);
    return;
  }

  // Add connection to active connections
  sseConnections.add(res);
  console.log('🔗 [DEBUG SSE] Connexion ajoutée, total:', sseConnections.size);
  
  // Send a heartbeat every 30 seconds to keep connection alive
  const heartbeatInterval = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
      // Force flush if available (Node.js HTTP response)
      if ('flush' in res && typeof res.flush === 'function') {
        (res as any).flush();
      }
      console.log('💓 [DEBUG SSE] Heartbeat envoyé');
    } catch (error) {
      console.error('💓 [DEBUG SSE] Erreur heartbeat:', error);
      clearInterval(heartbeatInterval);
      sseConnections.delete(res);
    }
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    console.log('🔗 [DEBUG SSE] Connexion fermée (close)');
    clearInterval(heartbeatInterval);
    sseConnections.delete(res);
    console.log('🔗 [DEBUG SSE] Connexions restantes:', sseConnections.size);
  });

  req.on('aborted', () => {
    console.log('🔗 [DEBUG SSE] Connexion abandonnée (aborted)');
    clearInterval(heartbeatInterval);
    sseConnections.delete(res);
    console.log('🔗 [DEBUG SSE] Connexions restantes:', sseConnections.size);
  });
  
  // Handle response errors
  res.on('error', (error) => {
    console.error('🔗 [DEBUG SSE] Erreur response:', error);
    clearInterval(heartbeatInterval);
    sseConnections.delete(res);
  });
  
  res.on('finish', () => {
    console.log('🔗 [DEBUG SSE] Response finished');
    clearInterval(heartbeatInterval);
    sseConnections.delete(res);
  });
});

/**
 * Send message to all connected clients
 */
export function broadcastToClients(data: any) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  
  console.log('📡 [DEBUG SSE] Diffusion vers', sseConnections.size, 'clients connectés');
  console.log('📡 [DEBUG SSE] Message à diffuser:', message.substring(0, 200) + '...');
  console.log('📡 [DEBUG SSE] Données complètes:', data);
  
  if (sseConnections.size === 0) {
    console.warn('⚠️ [DEBUG SSE] Aucun client connecté pour la diffusion !');
    return;
  }
  
  let successCount = 0;
  let errorCount = 0;
  let clientIndex = 0;
  const toDelete: Response[] = [];
  
  sseConnections.forEach((res) => {
    clientIndex++;
    try {
      console.log(`📡 [DEBUG SSE] Envoi vers client ${clientIndex}...`);
      res.write(message);
      // Force flush if available (Node.js HTTP response)
      if ('flush' in res && typeof res.flush === 'function') {
        (res as any).flush();
      }
      successCount++;
      console.log(`✅ [DEBUG SSE] Client ${clientIndex} OK`);
    } catch (error) {
      console.error(`❌ [DEBUG SSE] Erreur client ${clientIndex}:`, error);
      toDelete.push(res);
      errorCount++;
    }
  });
  
  // Clean up broken connections
  toDelete.forEach(res => sseConnections.delete(res));
  
  console.log(`📊 [DEBUG SSE] Diffusion terminée: ${successCount} succès, ${errorCount} erreurs`);
  console.log(`📊 [DEBUG SSE] Clients restants: ${sseConnections.size}`);
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