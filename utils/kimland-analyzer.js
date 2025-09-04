// Script d'analyse des requêtes Kimland pour debugging
class KimlandRequestAnalyzer {
  constructor() {
    this.requests = [];
    this.originalFetch = global.fetch;
    this.originalAxios = null;
    
    this.setupInterception();
  }

  setupInterception() {
    // Intercepter les requêtes axios vers Kimland
    const axios = require('axios');
    
    // Sauvegarder l'interceptor original
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        if (config.url && config.url.includes('kimland.dz')) {
          this.captureRequest('REQUEST', config);
        }
        return config;
      },
      (error) => {
        this.captureError('REQUEST_ERROR', error);
        return Promise.reject(error);
      }
    );

    const responseInterceptor = axios.interceptors.response.use(
      (response) => {
        if (response.config.url && response.config.url.includes('kimland.dz')) {
          this.captureResponse('RESPONSE', response);
        }
        return response;
      },
      (error) => {
        if (error.config && error.config.url && error.config.url.includes('kimland.dz')) {
          this.captureError('RESPONSE_ERROR', error);
        }
        return Promise.reject(error);
      }
    );

    console.log('🔍 Kimland Request Analyzer activé');
  }

  captureRequest(type, config) {
    const requestData = {
      timestamp: new Date().toISOString(),
      type,
      method: config.method.toUpperCase(),
      url: config.url,
      headers: this.sanitizeHeaders(config.headers),
      data: this.sanitizeData(config.data),
      params: config.params
    };

    this.requests.push(requestData);
    console.log(`📤 [KIMLAND_REQUEST] ${requestData.method} ${requestData.url}`, {
      data: requestData.data,
      headers: requestData.headers
    });
  }

  captureResponse(type, response) {
    const responseData = {
      timestamp: new Date().toISOString(),
      type,
      status: response.status,
      statusText: response.statusText,
      url: response.config.url,
      headers: this.sanitizeHeaders(response.headers),
      data: this.sanitizeResponseData(response.data)
    };

    this.requests.push(responseData);
    console.log(`📥 [KIMLAND_RESPONSE] ${responseData.status} ${responseData.url}`, {
      status: responseData.status,
      dataType: typeof responseData.data,
      dataLength: typeof responseData.data === 'string' ? responseData.data.length : 'N/A'
    });
  }

  captureError(type, error) {
    const errorData = {
      timestamp: new Date().toISOString(),
      type,
      message: error.message,
      url: error.config ? error.config.url : 'Unknown',
      status: error.response ? error.response.status : 'No response',
      responseData: error.response ? this.sanitizeResponseData(error.response.data) : null
    };

    this.requests.push(errorData);
    console.log(`❌ [KIMLAND_ERROR] ${errorData.url}`, {
      message: errorData.message,
      status: errorData.status
    });
  }

  sanitizeHeaders(headers) {
    if (!headers) return {};
    
    const sanitized = {};
    for (const [key, value] of Object.entries(headers)) {
      // Masquer les informations sensibles
      if (key.toLowerCase().includes('cookie') || 
          key.toLowerCase().includes('authorization')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  sanitizeData(data) {
    if (!data) return null;

    if (typeof data === 'string') {
      // Si c'est du form data, essayer de le parser
      if (data.includes('=') && data.includes('&')) {
        const parsed = {};
        const pairs = data.split('&');
        for (const pair of pairs) {
          const [key, value] = pair.split('=');
          if (key && value) {
            parsed[decodeURIComponent(key)] = decodeURIComponent(value);
          }
        }
        return parsed;
      }
      return data.length > 1000 ? data.substring(0, 1000) + '...[TRUNCATED]' : data;
    }

    if (typeof data === 'object') {
      return JSON.stringify(data, null, 2);
    }

    return data;
  }

  sanitizeResponseData(data) {
    if (!data) return null;
    
    if (typeof data === 'string') {
      // Tronquer les réponses HTML trop longues
      if (data.includes('<html>') || data.includes('<!DOCTYPE')) {
        return `[HTML Response - ${data.length} chars] ${data.substring(0, 200)}...`;
      }
      return data.length > 500 ? data.substring(0, 500) + '...[TRUNCATED]' : data;
    }

    return data;
  }

  // Analyser les requêtes capturées
  analyzeRequests() {
    console.log('\n🔍 === ANALYSE DES REQUÊTES KIMLAND ===\n');
    
    const analysis = {
      total: this.requests.length,
      byType: {},
      byUrl: {},
      errors: [],
      timeline: []
    };

    for (const req of this.requests) {
      // Grouper par type
      analysis.byType[req.type] = (analysis.byType[req.type] || 0) + 1;
      
      // Grouper par URL
      if (req.url) {
        const urlPath = req.url.replace('https://kimland.dz', '');
        analysis.byUrl[urlPath] = (analysis.byUrl[urlPath] || 0) + 1;
      }
      
      // Collecter les erreurs
      if (req.type.includes('ERROR')) {
        analysis.errors.push(req);
      }
      
      // Timeline
      analysis.timeline.push({
        time: req.timestamp,
        type: req.type,
        url: req.url,
        status: req.status || req.message
      });
    }

    console.log('📊 Statistiques générales:');
    console.log(`- Total des requêtes: ${analysis.total}`);
    console.log('- Par type:', analysis.byType);
    console.log('- Par endpoint:', analysis.byUrl);
    console.log(`- Erreurs: ${analysis.errors.length}`);

    if (analysis.errors.length > 0) {
      console.log('\n❌ Erreurs détectées:');
      analysis.errors.forEach((error, index) => {
        console.log(`${index + 1}. ${error.url} - ${error.message} (${error.status})`);
      });
    }

    console.log('\n⏰ Timeline des requêtes:');
    analysis.timeline.slice(-10).forEach((item, index) => {
      console.log(`${index + 1}. ${item.time} | ${item.type} | ${item.url} | ${item.status}`);
    });

    return analysis;
  }

  // Obtenir les requêtes par type
  getRequestsByType(type) {
    return this.requests.filter(req => req.type === type);
  }

  // Obtenir les requêtes vers un endpoint spécifique
  getRequestsByUrl(urlPattern) {
    return this.requests.filter(req => req.url && req.url.includes(urlPattern));
  }

  // Exporter les données pour analyse
  exportData() {
    return {
      capturedAt: new Date().toISOString(),
      totalRequests: this.requests.length,
      requests: this.requests,
      analysis: this.analyzeRequests()
    };
  }

  // Sauvegarder dans un fichier
  saveToFile(filename = 'kimland-requests.json') {
    const fs = require('fs');
    const data = this.exportData();
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`💾 Données sauvegardées dans ${filename}`);
  }

  // Nettoyer les requêtes capturées
  clear() {
    this.requests = [];
    console.log('🧹 Historique des requêtes effacé');
  }
}

// Export pour utilisation
module.exports = KimlandRequestAnalyzer;

// Si exécuté directement, démarrer l'analyse
if (require.main === module) {
  const analyzer = new KimlandRequestAnalyzer();
  
  // Fonction helper pour les tests
  global.kimlandAnalyzer = analyzer;
  
  console.log(`
🔍 Kimland Request Analyzer démarré !

Commandes disponibles:
- kimlandAnalyzer.analyzeRequests() : Analyser les requêtes capturées
- kimlandAnalyzer.getRequestsByType('REQUEST') : Filtrer par type
- kimlandAnalyzer.getRequestsByUrl('/app/client') : Filtrer par URL
- kimlandAnalyzer.exportData() : Exporter toutes les données
- kimlandAnalyzer.saveToFile() : Sauvegarder dans un fichier
- kimlandAnalyzer.clear() : Effacer l'historique

Maintenant, lancez vos tests de création de client !
  `);
}