import { JSDOM } from 'jsdom';
import { KimlandProduct, KimlandVariant, CandidateProduct } from '../types/kimland.types';
import { HtmlAnalyzer } from '../utils/html-analyzer';
import { KimlandAuthenticator } from '../utils/kimland-authenticator';
import { logger } from '../../../utils/logger';

export class KimlandProductSearcher {
  constructor(private authenticator: KimlandAuthenticator) {}

  /**
   * Rechercher un produit par SKU avec nom produit pour plus de précision
   */
  async searchProductBySku(sku: string, productName?: string): Promise<KimlandProduct | null> {
    try {
      if (!this.authenticator.isLoggedIn()) {
        throw new Error('Non authentifié sur Kimland');
      }

      logger.info('🔍 Recherche produit Kimland', { sku, productName });

      // 🎯 URLs de recherche améliorées
      const searchUrls = this.getSearchUrls(sku);
      
      let searchResponse;
      let workingUrl;
      let attemptCount = 0;
      
      // Tenter chaque URL de recherche avec retry automatique pour les produits VIP
      for (const searchUrl of searchUrls) {
        logger.info('📡 Tentative URL de recherche Kimland', { searchUrl, sku, attempt: attemptCount + 1 });
        
        try {
          const response = await this.authenticator.httpClient.get(searchUrl, {
            headers: {
              'Cookie': `PHPSESSID=${this.authenticator.sessionId}`,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Referer': 'https://kimland.dz/app/client/index.php'
            }
          });
          
          logger.info('📥 Réponse reçue', { 
            url: searchUrl,
            status: response.status, 
            contentLength: response.data.length,
            sku 
          });
          
          // Analyser la pertinence de la réponse
          const pageScore = this.analyzePageRelevance(response.data, sku);
          
          if (pageScore >= 3 || (pageScore >= 2 && response.data.length > 5000)) {
            searchResponse = response;
            workingUrl = searchUrl;
            logger.info('✅ URL de recherche valide trouvée', { 
              workingUrl, 
              sku,
              pageScore,
              contentLength: response.data.length,
              attempt: attemptCount + 1
            });
            break;
          }
        } catch (error) {
          logger.warn('❌ URL échouée', { searchUrl, error: error instanceof Error ? error.message : error, attempt: attemptCount + 1 });
          continue;
        }
        attemptCount++;
      }
      
      // Fallback vers les pages générales si aucune recherche spécifique ne fonctionne
      if (!searchResponse) {
        searchResponse = await this.tryFallbackUrls(sku);
      }
      
      // Dernière tentative : recherche directe sans authentification
      if (!searchResponse) {
        searchResponse = await this.tryPublicSearch(sku);
      }
      
      if (!searchResponse) {
        logger.error('❌ Aucune URL de recherche fonctionnelle', { sku });
        throw new Error('Impossible d\'accéder à la recherche Kimland');
      }
      
      logger.info('📥 Réponse recherche reçue', { 
        status: searchResponse.status, 
        contentLength: searchResponse.data.length,
        sku
      });
      
      // Analyser le HTML et trouver le produit
      const searchDom = new JSDOM(searchResponse.data);
      const searchDoc = searchDom.window.document;

      logger.info('🔍 Structure HTML reçue (extrait)', {
        sku,
        htmlStart: searchResponse.data.substring(0, 800),
        title: searchDoc.title,
        containsProducts: searchResponse.data.includes('product'),
        containsItems: searchResponse.data.includes('item'),
        containsCols: searchResponse.data.includes('col-')
      });

      // Rechercher et scorer les candidats
      const bestProductElement = this.findBestProductElement(searchDoc, sku, productName);
      
      if (!bestProductElement) {
        // Vérifier les messages d'erreur dans la page
        const pageText = searchDoc.body?.textContent || '';
        const errorAnalysis = HtmlAnalyzer.checkErrorIndicators(pageText, sku);
        
        logger.warn('⚠️ Aucun élément produit trouvé', { 
          sku,
          productName,
          ...errorAnalysis
        });
        
        if (errorAnalysis.hasErrorMessage) {
          logger.info('❌ Kimland confirme que le produit n\'existe pas', { sku });
        } else if (errorAnalysis.containsSkuInText) {
          logger.info('🔍 SKU trouvé dans le texte, mais structure non reconnue', { sku });
        }
        
        return null;
      }

      logger.info('✅ Élément produit trouvé', { 
        sku,
        elementClass: bestProductElement.className,
        innerHTML: bestProductElement.innerHTML.substring(0, 200)
      });

      // Extraire les informations du produit avec retry si produit VIP
      const extractedProduct = await this.extractProductInfo(bestProductElement, sku);
      
      // Si on obtient un produit VIP, essayer une recherche alternative
      if (!extractedProduct && attemptCount < 3) {
        logger.warn('🔄 Produit VIP détecté, tentative de recherche alternative', { sku, attempt: attemptCount + 1 });
        
        // Attendre un peu avant de réessayer
        await this.delay(2000);
        
        // Essayer avec d'autres URLs de recherche
        return this.tryAlternativeSearch(sku, productName);
      }
      
      return extractedProduct;

    } catch (error) {
      logger.error('❌ Erreur recherche produit', { sku, error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  /**
   * Obtenir les URLs de recherche
   */
  private getSearchUrls(sku: string): string[] {
    return [
      // URLs publiques (interface client) - priorité haute
      `/index.php?page=products&pages=0&keyword=${encodeURIComponent(sku)}`,
      `/index.php?page=products&keyword=${encodeURIComponent(sku)}`,
      `/products.php?search=${encodeURIComponent(sku)}`,
      `/search.php?keyword=${encodeURIComponent(sku)}`,
      `/catalogue.php?search=${encodeURIComponent(sku)}`,
      `/index.php?search=${encodeURIComponent(sku)}`,
      // URLs authentifiées (admin area) - priorité basse car pas de produits visibles
      `/app/client/index.php?page=products&keyword=${encodeURIComponent(sku)}`,
      `/app/client/products.php?search=${encodeURIComponent(sku)}`,
      `/app/client/search.php?keyword=${encodeURIComponent(sku)}`,
    ];
  }

  /**
   * Analyser la pertinence d'une page
   */
  private analyzePageRelevance(data: string, sku: string): number {
    const hasProductStructure = data.includes('product-item') || 
                              data.includes('product-name') ||
                              data.includes('class="product') ||
                              data.includes('item-name') ||
                              data.includes('card-product') ||
                              (data.includes('product') && data.includes('price')) ||
                              data.includes('col-6') ||
                              data.includes('row');
    
    const containsSku = data.toLowerCase().includes(sku.toLowerCase());
    const hasMinimalContent = data.length > 2000;
    const notErrorPage = !data.includes('Erreur 404') && 
                        !data.includes('Page non trouvée') &&
                        !data.includes('Not Found');
    
    let pageScore = 0;
    if (containsSku) pageScore += 3;
    if (hasProductStructure) pageScore += 2;
    if (hasMinimalContent) pageScore += 1;
    if (notErrorPage) pageScore += 1;
    
    return pageScore;
  }

  /**
   * Essayer les URLs de fallback
   */
  private async tryFallbackUrls(sku: string): Promise<any> {
    logger.info('🔄 Tentative accès pages produits générales', { sku });
    const fallbackUrls = [
      '/app/client/index.php?page=products',
      '/app/client/products.php',
      '/index.php?page=products',
      '/products.php',
      '/catalogue.php',
      '/index.php'
    ];
    
    for (const fallbackUrl of fallbackUrls) {
      try {
        const productsPage = await this.authenticator.httpClient.get(fallbackUrl, {
          headers: {
            'Cookie': `PHPSESSID=${this.authenticator.sessionId}`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': 'https://kimland.dz/app/client/index.php'
          }
        });
        
        logger.info('🔍 Page de fallback', {
          url: fallbackUrl,
          status: productsPage.status,
          contentLength: productsPage.data.length
        });
        
        const hasKimlandStructure = productsPage.data.includes('KIMLAND') || 
                                   productsPage.data.includes('kimland') ||
                                   productsPage.data.includes('product') ||
                                   productsPage.data.includes('catalogue');
        
        if (productsPage.data.length > 1000 && hasKimlandStructure) {
          logger.info('✅ Page de fallback accessible', { sku, fallbackUrl });
          return productsPage;
        }
      } catch (error) {
        logger.warn('⚠️ Échec page de fallback', { fallbackUrl, error: error instanceof Error ? error.message : error });
      }
    }
    
    return null;
  }

  /**
   * Recherche publique sans authentification
   */
  private async tryPublicSearch(sku: string): Promise<any> {
    logger.info('🌐 Tentative recherche publique sans authentification', { sku });
    
    // Créer un client temporaire sans authentification
    const axios = require('axios');
    const publicClient = axios.create({
      baseURL: 'https://kimland.dz',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3'
      }
    });
    
    const publicUrls = [
      `/index.php?page=products&keyword=${encodeURIComponent(sku)}`,
      `/index.php?page=products&pages=0&keyword=${encodeURIComponent(sku)}`,
      `/products.php?search=${encodeURIComponent(sku)}`,
      `/search.php?q=${encodeURIComponent(sku)}`,
      `/index.php?search=${encodeURIComponent(sku)}`,
      `/catalogue.php?keyword=${encodeURIComponent(sku)}`
    ];
    
    for (const url of publicUrls) {
      try {
        logger.info('🌐 Test URL publique', { url, sku });
        const response = await publicClient.get(url);
        
        logger.info('📊 Réponse publique', {
          url,
          status: response.status,
          contentLength: response.data.length,
          sku
        });
        
        // Vérifier si la page contient des produits
        const hasProductStructure = response.data.includes('product-item') ||
                                   response.data.includes('product-card') ||
                                   response.data.includes('item-card') ||
                                   (response.data.includes('product') && response.data.includes('price')) ||
                                   response.data.includes('col-6');
        
        const containsSku = response.data.toLowerCase().includes(sku.toLowerCase());
        const hasMinimalContent = response.data.length > 3000;
        const notErrorPage = !response.data.includes('Erreur 404');
        
        if ((hasProductStructure || containsSku) && hasMinimalContent && notErrorPage) {
          logger.info('✅ Page publique valide trouvée', { url, sku, hasProductStructure, containsSku });
          return response;
        }
        
      } catch (error) {
        logger.warn('⚠️ Échec URL publique', { url, error: error instanceof Error ? error.message : error });
      }
    }
    
    return null;
  }

  /**
   * Trouver le meilleur élément produit avec filtrage des produits VIP
   */
  private findBestProductElement(searchDoc: Document, sku: string, productName?: string): Element | null {
    const productSelectors = HtmlAnalyzer.getProductSelectors();
    const candidateProducts: CandidateProduct[] = [];
    
    for (const selector of productSelectors) {
      try {
        const elements = searchDoc.querySelectorAll(selector);
        
        logger.info(`🔍 Test sélecteur: ${selector}`, {
          sku,
          selector,
          found: elements.length
        });
        
        if (elements.length > 0) {
          for (const element of Array.from(elements)) {
            if (HtmlAnalyzer.isFilterElement(element)) {
              continue;
            }
            
            // Vérification préliminaire pour exclure les produits VIP
            const elementText = element.textContent?.toLowerCase() || '';
            const hasVipInText = elementText.includes('produit vip') || 
                               elementText.includes('produit - vip') ||
                               element.innerHTML.toLowerCase().includes('vipprod');
            
            if (hasVipInText) {
              logger.warn('⚠️ Élément VIP ignoré lors du scoring', {
                sku,
                selector,
                elementClass: element.className,
                vipText: elementText.substring(0, 100)
              });
              continue; // Ignorer complètement cet élément
            }
            
            const score = HtmlAnalyzer.calculateProductScore(element, sku, productName);
            
            if (score.total >= 3) {
              candidateProducts.push({
                element,
                selector,
                score: score.total,
                scoreDetails: score
              });
              
              logger.info(`🏅 Candidat trouvé (non-VIP)`, {
                sku,
                selector,
                score: score.total,
                scoreDetails: score,
                elementClass: element.className,
                elementText: element.textContent?.substring(0, 100)
              });
            }
          }
        }
      } catch (error) {
        logger.warn('⚠️ Erreur avec sélecteur', { selector, error: error instanceof Error ? error.message : error });
        continue;
      }
    }
    
    // Si aucun candidat non-VIP trouvé, essayer avec tous les éléments mais en privilégiant les non-VIP
    if (candidateProducts.length === 0) {
      logger.warn('⚠️ Aucun candidat non-VIP trouvé, recherche élargie', { sku });
      
      for (const selector of productSelectors) {
        try {
          const elements = searchDoc.querySelectorAll(selector);
          
          if (elements.length > 0) {
            for (const element of Array.from(elements)) {
              if (HtmlAnalyzer.isFilterElement(element)) {
                continue;
              }
              
              const score = HtmlAnalyzer.calculateProductScore(element, sku, productName);
              
              if (score.total >= 3) {
                // Pénaliser fortement les éléments VIP mais les garder comme dernier recours
                const elementText = element.textContent?.toLowerCase() || '';
                const hasVipInText = elementText.includes('produit vip') || 
                                   elementText.includes('produit - vip');
                
                const finalScore = hasVipInText ? Math.max(1, score.total - 10) : score.total;
                
                candidateProducts.push({
                  element,
                  selector,
                  score: finalScore,
                  scoreDetails: score
                });
                
                logger.info(`🏅 Candidat trouvé (avec pénalité VIP)`, {
                  sku,
                  selector,
                  originalScore: score.total,
                  finalScore,
                  isVip: hasVipInText,
                  elementClass: element.className
                });
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    logger.info('📈 Candidats produits trouvés', {
      sku,
      candidateCount: candidateProducts.length,
      topCandidates: candidateProducts
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(c => ({ score: c.score, selector: c.selector, class: c.element.className }))
    });
    
    // Diagnostic de la page pour debug
    HtmlAnalyzer.logPageDiagnostics(searchDoc, sku);
    
    // Sélectionner le meilleur candidat
    if (candidateProducts.length > 0) {
      candidateProducts.sort((a, b) => b.score - a.score);
      const bestCandidate = candidateProducts[0];
      
      logger.info('🏆 Meilleur candidat sélectionné', {
        sku,
        score: bestCandidate.score,
        selector: bestCandidate.selector,
        scoreDetails: bestCandidate.scoreDetails
      });
      
      return bestCandidate.element;
    }
    
    return null;
  }

  /**
   * Recherche alternative quand le produit principal retourne un VIP
   */
  private async tryAlternativeSearch(sku: string, productName?: string): Promise<KimlandProduct | null> {
    logger.info('🔍 Recherche alternative pour éviter le produit VIP', { sku });
    
    // URLs alternatives avec des paramètres différents
    const alternativeUrls = [
      `/index.php?page=products&search=${encodeURIComponent(sku)}`,
      `/index.php?keyword=${encodeURIComponent(sku)}`,
      `/catalogue.php?q=${encodeURIComponent(sku)}`,
      // Essayer avec des parties du SKU
      `/index.php?page=products&keyword=${encodeURIComponent(sku.split('-')[0])}`,
    ];
    
    for (const altUrl of alternativeUrls) {
      try {
        logger.info('🔄 Tentative URL alternative', { altUrl, sku });
        
        const response = await this.authenticator.httpClient.get(altUrl, {
          headers: {
            'Cookie': `PHPSESSID=${this.authenticator.sessionId}`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        
        if (response.data.length > 10000) { // Page avec du contenu
          const altDom = new JSDOM(response.data);
          const altDoc = altDom.window.document;
          
          const altElement = this.findBestProductElement(altDoc, sku, productName);
          if (altElement) {
            const altProduct = await this.extractProductInfo(altElement, sku);
            if (altProduct && this.isValidProduct(altProduct.name, sku)) {
              logger.info('✅ Produit trouvé via recherche alternative', { sku, productName: altProduct.name });
              return altProduct;
            }
          }
        }
      } catch (error) {
        logger.warn('⚠️ URL alternative échouée', { altUrl, error: error instanceof Error ? error.message : error });
        continue;
      }
    }
    
    logger.warn('❌ Aucune alternative trouvée', { sku });
    return null;
  }

  /**
   * Valider que le produit trouvé correspond vraiment au SKU recherché
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isValidProduct(productName: string, sku: string): boolean {
    const normalizedName = productName.toLowerCase().trim();
    const normalizedSku = sku.toLowerCase().trim();
    
    // Liste des noms de produits génériques à rejeter
    const genericNames = [
      'produit vip',
      'produit - vip', 
      'vipprod',
      'tous',
      'standard',
      'générique',
      'placeholder',
      'test'
    ];
    
    // Vérifier si le nom du produit est générique
    const isGeneric = genericNames.some(generic => {
      return normalizedName.includes(generic) || normalizedName === generic;
    });
    
    if (isGeneric) {
      logger.warn('🚫 Produit générique détecté', { 
        sku, 
        foundName: productName,
        reason: 'Nom générique détecté'
      });
      return false;
    }
    
    // Validation moins stricte - accepter les noms courts mais pas vides
    const hasValidLength = productName.trim().length > 2;
    
    if (!hasValidLength) {
      logger.warn('🚫 Produit avec nom trop court rejeté', { 
        sku, 
        foundName: productName,
        reason: 'Nom trop court'
      });
      return false;
    }
    
    // 🎯 NOUVELLE VALIDATION : Vérifier la correspondance avec le SKU
    const skuParts = normalizedSku.split(/[-_\s]+/).filter(part => part.length > 1);
    const nameParts = normalizedName.split(/[-_\s]+/).filter(part => part.length > 1);
    
    // Chercher des correspondances entre les parties du SKU et le nom du produit
    const skuMatches = skuParts.some(skuPart => {
      return nameParts.some(namePart => {
        // Match exact
        if (namePart === skuPart) return true;
        // Match partiel pour les codes longs
        if (skuPart.length >= 4 && namePart.includes(skuPart)) return true;
        if (namePart.length >= 4 && skuPart.includes(namePart)) return true;
        return false;
      });
    });
    
    // Vérifier si le nom contient le SKU complet ou des parties significatives
    const containsFullSku = normalizedName.includes(normalizedSku);
    const containsSignificantPart = skuMatches;
    
    // Pour des SKUs comme "CD6109-200", chercher "CD6109" ou "200" dans le nom
    // "CORE SLIDE HI-TEC" ne contient ni "cd6109" ni "200" donc sera rejeté
    if (!containsFullSku && !containsSignificantPart) {
      logger.warn('🚫 Produit ne correspond pas au SKU recherché', { 
        sku, 
        foundName: productName,
        reason: 'Aucun élément du SKU trouvé dans le nom du produit',
        skuParts,
        nameParts,
        checkedMatches: {
          fullSku: containsFullSku,
          significantPart: containsSignificantPart
        }
      });
      return false;
    }
    
    logger.info('✅ Produit validé comme correspondant au SKU', { 
      sku, 
      foundName: productName,
      matchType: containsFullSku ? 'SKU complet' : 'Partie du SKU'
    });
    return true;
  }

  /**
   * Extraire les informations du produit
   */
  private async extractProductInfo(element: Element, sku: string, searchResponse?: any, workingUrl?: string): Promise<KimlandProduct | null> {
    try {
      // Regrouper les logs de debug
      const debugInfo = {
        sku,
        elementContent: element.textContent?.substring(0, 100),
        currentUrl: searchResponse?.config?.url || workingUrl,  // Ajout de la virgule ici
        timestamp: new Date().toISOString()
      };
      logger.debug('Début extraction produit', debugInfo);

      // Extraire le lien du produit
      const linkSelectors = [
        'a[href*="product"]',
        'a[href*="item"]', 
        'a[href*="article"]',
        'a[href*="detail"]',
        'a[onclick]',
        'a'
      ];
      
      let productLink = null;
      for (const selector of linkSelectors) {
        productLink = element.querySelector(selector) as HTMLAnchorElement;
        if (productLink && (productLink.href || productLink.onclick)) {
          break;
        }
      }
      
      // Extraire le nom du produit
      const nameSelectors = [
        '.product-item-name a',
        '.product-name a',
        '.item-name a',
        '.title a',
        'a[title]',
        'h1 a', 'h2 a', 'h3 a', 'h4 a',
        '.name',
        '.title',
        'a'
      ];
      
      let productNameElement = null;
      for (const selector of nameSelectors) {
        productNameElement = element.querySelector(selector) as HTMLAnchorElement;
        if (productNameElement && productNameElement.textContent?.trim()) {
          logger.info('📝 Nom produit trouvé', {
            sku,
            selector,
            name: productNameElement.textContent?.substring(0, 50)
          });
          break;
        }
      }
      
      // Extraire l'image
      const imageSelectors = [
        '.product-item-img img',
        '.product-img img',
        '.item-img img',
        'img'
      ];
      
      let productImage = null;
      for (const selector of imageSelectors) {
        productImage = element.querySelector(selector) as HTMLImageElement;
        if (productImage && productImage.src) {
          logger.info('🖼️ Image produit trouvée', {
            sku,
            selector,
            src: productImage.src.substring(0, 100)
          });
          break;
        }
      }
      
      const priceElement = element.querySelector('.price, [class*="price"], .cost, [class*="cost"]') as HTMLElement;
      const oldPriceElement = element.querySelector('.old-price, [class*="old"], .was-price') as HTMLElement;

      logger.info('🔍 Infos produit extraites', {
        sku,
        hasLink: !!productLink,
        hasName: !!productNameElement,
        hasImage: !!productImage,
        linkHref: productLink?.href || 'N/A',
        nameText: productNameElement?.textContent || 'N/A'
      });

      if (!productLink || !productNameElement) {
        logger.error('❌ Impossible d\'extraire les infos produit', {
          sku,
          hasLink: !!productLink,
          hasName: !!productNameElement,
          elementHTML: element.innerHTML
        });
        throw new Error('Impossible d\'extraire les infos produit');
      }

      // Construire l'URL du produit
      let productUrl: string;
      try {
        if (productLink?.href) {
          productUrl = new URL(productLink.href, baseUrl).href;
        } else if (workingUrl) {
          productUrl = new URL(workingUrl, baseUrl).href;
        } else {
          throw new Error('Impossible de construire l\'URL du produit');
        }
      } catch (error) {
        logger.error('❌ Erreur construction URL produit', {
          sku,
          linkHref: productLink?.href,
          workingUrl,
          baseUrl,
          error: error instanceof Error ? error.message : error
        });
        throw error;
      }
      
      logger.info('🌐 URL produit construite', { sku, productUrl });
      
      // Récupérer les variants depuis la page produit
      const variants = await this.extractProductVariants(productUrl, sku);
      
      const productName = productNameElement.textContent?.trim() || '';
      
      // 🚫 VALIDATION : Rejeter les produits génériques mais permettre retry
      if (!this.isValidProduct(productName, sku)) {
        logger.warn('❌ Produit générique détecté - sera retenté', {
          sku,
          foundName: productName,
          url: productUrl
        });
        return null; // Retourner null pour déclencher le retry
      }
      
      const product: KimlandProduct = {
        id: productUrl.split('/').slice(-2, -1)[0] || 'unknown',
        name: productName,
        url: productUrl,
        price: priceElement?.textContent?.trim() || '',
        oldPrice: oldPriceElement?.textContent?.trim(),
        variants,
        imageUrl: productImage?.src ? new URL(productImage.src, 'https://kimland.dz').href : ''
      };

      const totalStock = variants.reduce((total, v) => total + v.stock, 0);

      logger.info('✅ Produit Kimland trouvé avec succès', {
        sku,
        name: product.name,
        price: product.price,
        variantsCount: variants.length,
        totalStock,
        variants: variants.map(v => `${v.size}: ${v.stock}`)
      });

      return product;

    } catch (error) {
      logger.error('❌ Erreur extraction infos produit', { 
        sku, 
        error: error instanceof Error ? error.message : error,
        elementHTML: element.innerHTML.substring(0, 200)
      });
      return null;
    }
  }

  /**
   * Extraire les variants depuis la page produit
   */
  private async extractProductVariants(productUrl: string, sku: string): Promise<KimlandVariant[]> {
    try {
      logger.info('📥 Récupération page produit', { sku, productUrl });
      const productResponse = await this.authenticator.httpClient.get(productUrl, {
        headers: {
          'Cookie': `PHPSESSID=${this.authenticator.sessionId}`,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });
      
      logger.info('✅ Page produit récupérée', { 
        sku, 
        status: productResponse.status, 
        contentLength: productResponse.data.length 
      });
      
      const productDom = new JSDOM(productResponse.data);
      const productDoc = productDom.window.document;
      
      logger.info('🔍 Structure page produit', {
        sku,
        title: productDoc.title,
        htmlStart: productResponse.data.substring(0, 300)
      });

      const variants: KimlandVariant[] = [];
      
      // Chercher les sélecteurs de pointure/taille
      const selectSelectors = [
        'select[name="pointure"]',
        'select[name="taille"]', 
        'select[name="size"]',
        'select[name="variant"]',
        'select[name="option"]'
      ];
      
      let sizeSelect = null;
      for (const selector of selectSelectors) {
        const select = productDoc.querySelector(selector);
        if (select) {
          sizeSelect = select;
          logger.info('🔢 Sélecteur de taille spécifique trouvé', { sku, selector, name: select.getAttribute('name') });
          break;
        }
      }
      
      // Si pas trouvé, chercher d'autres select
      if (!sizeSelect) {
        const allSelects = productDoc.querySelectorAll('select');
        for (const select of allSelects) {
          const name = select.getAttribute('name') || '';
          const id = select.getAttribute('id') || '';
          
          if (name.includes('categor') || id.includes('categor') || name.includes('search')) {
            continue;
          }
          
          const options = select.querySelectorAll('option');
          const hasNumericSizes = Array.from(options).some(opt => {
            const text = opt.textContent?.trim() || '';
            return /\b\d+(\.\d+)?\b/.test(text) && !text.toLowerCase().includes('catégorie');
          });
          
          if (hasNumericSizes) {
            sizeSelect = select;
            logger.info('🔢 Sélecteur de taille trouvé par analyse du contenu', { sku, name, id });
            break;
          }
        }
      }
      
      if (sizeSelect) {
        const options = sizeSelect.querySelectorAll('option');
        logger.info('🔢 Options trouvées', {
          sku,
          optionCount: options.length,
          optionTexts: Array.from(options).map(o => (o as HTMLOptionElement).textContent?.trim()).slice(0, 5)
        });
        
        options.forEach((option, index) => {
          const text = option.textContent?.trim();
          if (text && text.length > 0) {
            // Patterns pour extraire taille et stock
            const patterns = [
              /^(.+?)\s*-\s*(\d+)\s*piéce\(s\)$/i,
              /^(.+?)\s*:\s*(\d+)\s*piéce\(s\)$/i,
              /^Dimension\s*:\s*(.+?)\s*-\s*(\d+)\s*piéce\(s\)$/i,
              /^(.+?)\s*-\s*(\d+)\s*piéces?$/i,
              /^(.+?)\s*\(\s*(\d+)\s*\)$/i,
              /^(.+?)\s*-\s*(\d+)\s*disp/i,
              /^(.+?)\s*\[\s*(\d+)\s*\]/,
              /^(.+?)\s*:\s*(\d+)$/,
              /^(.+?)\s*(\d+)\s*pièces?$/i,
              /^([\d\.]+)\s*-\s*(\d+)\s*piéce\(s\)$/i
            ];
            
            let matched = false;
            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (match) {
                const size = match[1].trim();
                const stock = parseInt(match[2]) || 0;
                
                if (size && size.length > 0 && !size.toLowerCase().includes('catégorie') && !size.toLowerCase().includes('toutes')) {
                  const variant = {
                    size: size.replace(/[éèê]/g, 'e'),
                    stock: stock
                  };
                  variants.push(variant);
                  logger.info(`✅ Variant ${index + 1} extrait avec stock`, { sku, variant, originalText: text });
                  matched = true;
                  break;
                }
              }
            }
            
            if (!matched) {
              const sizeOnly = text.replace(/[^\w\s\.]/g, '').trim();
              if (sizeOnly.length > 0) {
                variants.push({
                  size: sizeOnly,
                  stock: 0
                });
                logger.info(`⚠️ Variant ${index + 1} extrait sans stock`, { sku, size: sizeOnly, originalText: text });
              }
            }
          }
        });
      } else {
        logger.warn('⚠️ Aucun sélecteur de taille trouvé', { sku });
        
        // Tentative d'extraction depuis d'autres éléments
        const alternativeSelectors = [
          'button[data-size]',
          '.size-option',
          '[class*="size"]',
          '.variant',
          '[class*="variant"]'
        ];
        
        for (const altSelector of alternativeSelectors) {
          const elements = productDoc.querySelectorAll(altSelector);
          if (elements.length > 0) {
            logger.info('🔍 Tentative extraction depuis', { sku, selector: altSelector, count: elements.length });
            elements.forEach((el, i) => {
              const text = el.textContent?.trim() || el.getAttribute('data-size') || '';
              if (text) {
                variants.push({
                  size: text,
                  stock: 0
                });
                logger.info(`✅ Variant alternatif ${i + 1}`, { sku, size: text });
              }
            });
            break;
          }
        }
      }
      
      return variants;
      
    } catch (error) {
      logger.error('❌ Erreur extraction variants', { sku, error: error instanceof Error ? error.message : error });
      return [];
    }
  }
}
    }
  }
}
