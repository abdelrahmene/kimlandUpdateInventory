import axios, { AxiosInstance } from 'axios';
import { JSDOM } from 'jsdom';
import { logger } from '../../utils/logger';

export interface KimlandCredentials {
  email: string;
  username: string;
  password: string;
}

export interface KimlandVariant {
  size: string;
  stock: number;
}

export interface KimlandProduct {
  id: string;
  name: string;
  url: string;
  price: string;
  oldPrice?: string;
  variants: KimlandVariant[];
  imageUrl: string;
}

export class KimlandAuthService {
  private client: AxiosInstance;
  private isAuthenticated: boolean = false;
  private phpsessid: string = '';

  constructor() {
    this.client = axios.create({
      baseURL: 'https://kimland.dz',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
        'Accept-Language': 'fr,fr-FR;q=0.8,en-US;q=0.5,en;q=0.3',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive'
      }
    });
  }

  /**
   * Extraire PHPSESSID depuis les headers Set-Cookie
   */
  private extractPhpSessionId(setCookieHeaders: string[] | undefined): string {
    if (!setCookieHeaders) return '';
    
    for (const cookie of setCookieHeaders) {
      const match = cookie.match(/PHPSESSID=([^;]+)/);
      if (match) {
        return match[1];
      }
    }
    return '';
  }

  /**
   * Authentification sur Kimland avec le pattern exact requis
   */
  async authenticate(credentials: KimlandCredentials): Promise<boolean> {
    try {
      logger.info('🔐 Début authentification Kimland', { email: credentials.email });

      // Étape 1: GET initial pour récupérer le premier PHPSESSID
      logger.info('📡 Étape 1: GET initial /app/client/index.php');
      const initialResponse = await this.client.get('/app/client/index.php', {
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Priority': 'u=0, i',
          'Te': 'trailers'
        }
      });

      // Extraire le PHPSESSID initial
      const setCookies = initialResponse.headers['set-cookie'];
      this.phpsessid = this.extractPhpSessionId(setCookies);
      
      logger.info('✅ Étape 1 terminée', {
        status: initialResponse.status,
        phpsessid: this.phpsessid,
        contentLength: initialResponse.data.length,
        setCookieHeaders: setCookies
      });

      if (!this.phpsessid) {
        logger.error('❌ Aucun PHPSESSID trouvé dans la réponse initiale');
        return false;
      }

      // Étape 2: POST vers /login/ avec le PHPSESSID
      logger.info('📡 Étape 2: POST /app/client/login/');
      const loginData = `user=${encodeURIComponent(credentials.email)}&password=${encodeURIComponent(credentials.password)}&username=${encodeURIComponent(credentials.username)}`;
      
      const loginResponse = await this.client.post('/app/client/login/', loginData, {
        headers: {
          'Cookie': `PHPSESSID=${this.phpsessid}`,
          'Accept': '*/*',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://kimland.dz',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'Priority': 'u=0',
          'Te': 'trailers'
        }
      });

      // Extraire le nouveau PHPSESSID
      const loginSetCookies = loginResponse.headers['set-cookie'];
      const newPhpSessionId = this.extractPhpSessionId(loginSetCookies);
      
      logger.info('✅ Étape 2 terminée', {
        status: loginResponse.status,
        oldPhpSessionId: this.phpsessid,
        newPhpSessionId: newPhpSessionId,
        responseData: loginResponse.data,
        setCookieHeaders: loginSetCookies
      });

      if (loginResponse.status !== 200) {
        logger.error('❌ Échec POST login', { status: loginResponse.status, data: loginResponse.data });
        return false;
      }
      
      // Vérifier que la réponse de login est valide (doit être '2' pour succès selon vos logs)
      const loginResponseText = String(loginResponse.data).trim();
      if (loginResponseText !== '2' && loginResponseText !== '1' && loginResponseText !== 'success') {
        logger.warn('⚠️ Réponse login inattendue', { loginResponseText, expected: '2' });
        // On continue quand même car parfois le login fonctionne même avec une réponse différente
      }

      // Mettre à jour le PHPSESSID si un nouveau a été fourni
      if (newPhpSessionId) {
        this.phpsessid = newPhpSessionId;
      }

      // Étape 3: GET final avec le PHPSESSID pour vérifier la connexion
      logger.info('📡 Étape 3: GET final /app/client/index.php avec nouveau PHPSESSID');
      const finalResponse = await this.client.get('/app/client/index.php', {
        headers: {
          'Cookie': `PHPSESSID=${this.phpsessid}`,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Priority': 'u=0, i',
          'Te': 'trailers'
        }
      });

      logger.info('✅ Étape 3 terminée', {
        status: finalResponse.status,
        contentLength: finalResponse.data.length,
        phpsessid: this.phpsessid
      });

      // Vérifier le succès de la connexion
      if (finalResponse.status === 200) {
        // Analyser le contenu pour confirmer la connexion
        const finalDom = new JSDOM(finalResponse.data);
        const finalDoc = finalDom.window.document;
        const pageTitle = finalDoc.title || '';
        const bodyText = finalDoc.body?.textContent || '';
        
        // Vérifier la réponse de l'étape 2 (POST login) pour confirmer le succès
        const loginResponseText = String(loginResponse.data).trim();
        const isLoginSuccessful = loginResponseText === '2' || loginResponseText === '1' || loginResponseText === 'success';
        
        // Indicateurs d'authentification réussie
        const hasAuthenticatedContent = finalResponse.data.includes('getSessionData') ||
                                       finalResponse.data.includes('function(') ||
                                       finalResponse.data.includes('$(document).ready') ||
                                       finalResponse.data.includes('DataTable') ||
                                       finalResponse.data.includes('dashboard') ||
                                       finalResponse.data.includes('App/Content/views') ||
                                       finalResponse.data.includes('.InitialBlock');
        
        // Indicateurs qu'on est toujours sur la page de login (non authentifié)
        const isStillOnLoginPage = finalResponse.data.includes('Connecter a votre compte') &&
                                  finalResponse.data.includes('Pour accÃ©der comme un') &&
                                  finalResponse.data.includes('veuillez saisir l\'adresse email');
        
        const seemsAuthenticated = isLoginSuccessful && hasAuthenticatedContent && !isStillOnLoginPage;
        
        logger.info('🔍 Analyse finale de la connexion', {
          pageTitle,
          loginResponseText,
          isLoginSuccessful,
          hasAuthenticatedContent,
          isStillOnLoginPage,
          seemsAuthenticated,
          bodyTextLength: bodyText.length,
          containsGetSessionData: finalResponse.data.includes('getSessionData'),
          containsDataTable: finalResponse.data.includes('DataTable'),
          containsInitialBlock: finalResponse.data.includes('.InitialBlock'),
          finalContentPreview: finalResponse.data.substring(0, 500)
        });
        
        if (seemsAuthenticated) {
          this.isAuthenticated = true;
          logger.info('✅ Authentification Kimland réussie');
          return true;
        }
      }
      
      logger.error('❌ Échec authentification Kimland');
      return false;

    } catch (error) {
      logger.error('❌ Erreur authentification Kimland', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined
      });
      return false;
    }
  }

  /**
   * Rechercher un produit par SKU
   */
  async searchProductBySku(sku: string): Promise<KimlandProduct | null> {
    try {
      if (!this.isAuthenticated) {
        throw new Error('Non authentifié sur Kimland');
      }

      logger.info('🔍 Recherche produit Kimland', { sku });

      // URL de recherche Kimland - utiliser l'interface publique (première position)
      const searchUrls = [
        `/index.php?page=products&pages=0&keyword=${encodeURIComponent(sku)}`,
        `/products.php?search=${encodeURIComponent(sku)}`,
        `/search.php?keyword=${encodeURIComponent(sku)}`
      ];
      
      let searchResponse;
      let workingUrl;
      
      for (const searchUrl of searchUrls) {
        logger.info('📡 Tentative URL de recherche Kimland', { searchUrl, sku });
        
        try {
          const response = await this.client.get(searchUrl, {
            headers: {
              'Cookie': `PHPSESSID=${this.phpsessid}`,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });
          logger.info('📥 Réponse reçue', { 
            url: searchUrl,
            status: response.status, 
            contentLength: response.data.length,
            sku 
          });
          
          // Vérifier si c'est une vraie page de produits contenant notre SKU ou des produits
          const hasProductStructure = response.data.includes('product-item') || 
                                    response.data.includes('product-name') ||
                                    response.data.includes('class="product') ||
                                    (response.data.includes('product') && response.data.includes('price'));
          
          const containsSku = response.data.toLowerCase().includes(sku.toLowerCase());
          const hasRelevantContent = response.data.length > 5000 && hasProductStructure;
          
          if (containsSku || hasRelevantContent) {
            searchResponse = response;
            workingUrl = searchUrl;
            logger.info('✅ URL de recherche valide trouvée', { 
              workingUrl, 
              sku,
              containsSku,
              hasProductStructure,
              contentLength: response.data.length
            });
            break;
          }
        } catch (error) {
          logger.warn('❌ URL échouée', { searchUrl, error: error instanceof Error ? error.message : error });
          continue;
        }
      }
      
      if (!searchResponse) {
        // Tentative alternative: accéder à la page produits générale (interface publique)
        logger.info('🔄 Tentative accès page produits générale', { sku });
        const fallbackUrls = [
          '/index.php?page=products',
          '/products.php',
          '/catalogue.php',
          '/index.php'
        ];
        
        for (const fallbackUrl of fallbackUrls) {
          try {
            const productsPage = await this.client.get(fallbackUrl, {
              headers: {
                'Cookie': `PHPSESSID=${this.phpsessid}`,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              }
            });
            logger.info('🔍 Page de fallback', {
              url: fallbackUrl,
              status: productsPage.status,
              contentLength: productsPage.data.length,
              title: new JSDOM(productsPage.data).window.document.title
            });
            
            if (productsPage.data.length > 1000 && productsPage.data.includes('KIMLAND')) {
              searchResponse = productsPage;
              workingUrl = fallbackUrl;
              logger.info('✅ Page de fallback accessible', { sku, fallbackUrl });
              break;
            }
          } catch (error) {
            logger.warn('⚠️ Échec page de fallback', { fallbackUrl, error: error instanceof Error ? error.message : error });
          }
        }
      }
      
      if (!searchResponse) {
        logger.error('❌ Aucune URL de recherche fonctionnelle', { sku, triedUrls: searchUrls });
        throw new Error('Impossible d\'accéder à la recherche Kimland');
      }
      logger.info('📥 Réponse recherche reçue', { 
        status: searchResponse.status, 
        contentLength: searchResponse.data.length,
        sku 
      });
      
      const searchDom = new JSDOM(searchResponse.data);
      const searchDoc = searchDom.window.document;

      // Debug: afficher plus d'infos sur la structure HTML
      logger.info('🔍 Structure HTML reçue (extrait)', {
        sku,
        workingUrl,
        htmlStart: searchResponse.data.substring(0, 500),
        title: searchDoc.title,
        containsProducts: searchResponse.data.includes('product'),
        containsItems: searchResponse.data.includes('item'),
        containsCards: searchResponse.data.includes('card'),
        bodyClasses: searchDoc.body?.className || 'N/A'
      });

      // 2. Essayer différents sélecteurs pour trouver les produits
      const possibleSelectors = [
        '.product-item',
        '.product',
        '.item',
        '[class*="product"]',
        '[class*="item"]',
        '.card',
        '[class*="card"]',
        '.article',
        '[data-product]',
        'article',
        '.box'
      ];
      
      let productElement;
      for (const selector of possibleSelectors) {
        productElement = searchDoc.querySelector(selector);
        if (productElement) {
          logger.info('🎯 Sélecteur produit trouvé', { sku, selector, className: productElement.className });
          break;
        }
      }
      
      // Debug: lister tous les éléments trouvés
      const allProductElements = searchDoc.querySelectorAll('[class*="product"], [class*="item"], .card, article');
      logger.info('🔍 Éléments trouvés sur la page', {
        sku,
        totalElements: allProductElements.length,
        elementClasses: Array.from(allProductElements).map(el => el.className).slice(0, 10)
      });

      if (!productElement) {
        // Tentative de recherche dans le texte de la page
        const pageText = searchDoc.body?.textContent || '';
        const containsSku = pageText.includes(sku);
        
        logger.warn('⚠️ Aucun élément produit trouvé', { 
          sku,
          containsSkuInText: containsSku,
          availableClasses: Array.from(searchDoc.querySelectorAll('*'))
            .map(el => el.className)
            .filter(c => c && c.length > 0)
            .slice(0, 20),
          textSample: pageText.substring(0, 500)
        });
        
        if (containsSku) {
          logger.info('🔍 SKU trouvé dans le texte, mais structure inconnue', { sku });
        }
        
        return null;
      }

      logger.info('✅ Élément produit trouvé', { 
        sku, 
        elementClass: productElement.className,
        innerHTML: productElement.innerHTML.substring(0, 200)
      });

      // Extraire les infos du produit avec sélecteurs flexibles
      const linkSelectors = [
        '.product-item-img',
        'a[href*="product"]',
        'a[href*="item"]', 
        'a[href*="article"]',
        'a'
      ];
      
      let productLink;
      for (const selector of linkSelectors) {
        productLink = productElement.querySelector(selector) as HTMLAnchorElement;
        if (productLink && productLink.href) break;
      }
      
      const nameSelectors = [
        '.product-item-name a',
        '.product-name a',
        '.title a',
        'a[title]',
        'h1 a', 'h2 a', 'h3 a',
        'a'
      ];
      
      let productName;
      for (const selector of nameSelectors) {
        productName = productElement.querySelector(selector) as HTMLAnchorElement;
        if (productName && productName.textContent?.trim()) break;
      }
      
      const imageSelectors = [
        '.product-item-img img',
        '.product-img img',
        '.item-img img',
        'img'
      ];
      
      let productImage;
      for (const selector of imageSelectors) {
        productImage = productElement.querySelector(selector) as HTMLImageElement;
        if (productImage && productImage.src) break;
      }
      
      const priceElement = productElement.querySelector('.price, [class*="price"], .cost, [class*="cost"]') as HTMLElement;
      const oldPriceElement = productElement.querySelector('.old-price, [class*="old"], .was-price') as HTMLElement;

      logger.info('🔍 Infos produit extraites', {
        sku,
        hasLink: !!productLink,
        hasName: !!productName,
        hasImage: !!productImage,
        linkHref: productLink?.href || 'N/A',
        nameText: productName?.textContent || 'N/A'
      });

      if (!productLink || !productName) {
        logger.error('❌ Impossible d\'extraire les infos produit', {
          sku,
          hasLink: !!productLink,
          hasName: !!productName,
          elementHTML: productElement.innerHTML
        });
        throw new Error('Impossible d\'extraire les infos produit');
      }

      let productUrl: string;
      try {
        productUrl = new URL(productLink.href, 'https://kimland.dz').href;
      } catch (error) {
        // Si l'URL est relative, la construire manuellement
        productUrl = productLink.href.startsWith('http') ? productLink.href : `https://kimland.dz${productLink.href}`;
      }
      
      logger.info('🌐 URL produit construite', { sku, productUrl });
      
      // 3. Accéder à la page produit pour récupérer les variants
      logger.info('📥 Récupération page produit', { sku, productUrl });
      const productResponse = await this.client.get(productUrl, {
        headers: {
          'Cookie': `PHPSESSID=${this.phpsessid}`,
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
      
      // Debug: afficher un extrait de la page produit
      logger.info('🔍 Structure page produit', {
        sku,
        title: productDoc.title,
        htmlStart: productResponse.data.substring(0, 300)
      });

      // Extraire les variants (pointures et stock)
      const variants: KimlandVariant[] = [];
      
      // Chercher spécifiquement les sélecteurs de pointure/taille (pas les catégories)
      const selectSelectors = [
        'select[name="pointure"]',
        'select[name="taille"]', 
        'select[name="size"]',
        'select[name="variant"]',
        'select[name="option"]'
      ];
      
      let sizeSelect;
      // Chercher d'abord les sélecteurs spécifiques aux tailles
      for (const selector of selectSelectors) {
        const select = productDoc.querySelector(selector);
        if (select) {
          sizeSelect = select;
          logger.info('🔢 Sélecteur de taille spécifique trouvé', { sku, selector, name: select.getAttribute('name') });
          break;
        }
      }
      
      // Si pas trouvé, chercher les autres select mais vérifier leur contenu
      if (!sizeSelect) {
        const allSelects = productDoc.querySelectorAll('select');
        for (const select of allSelects) {
          const name = select.getAttribute('name') || '';
          const id = select.getAttribute('id') || '';
          
          // Ignorer les sélecteurs de catégories
          if (name.includes('categor') || id.includes('categor') || name.includes('search')) {
            logger.info('🙅‍♂️ Sélecteur de catégorie ignoré', { sku, name, id });
            continue;
          }
          
          // Vérifier le contenu des options
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
      
      logger.info('🔍 Recherche variants', {
        sku,
        hasSizeSelect: !!sizeSelect,
        selectName: sizeSelect?.getAttribute('name') || 'N/A',
        allSelects: Array.from(productDoc.querySelectorAll('select')).map(s => s.getAttribute('name') || s.className)
      });
      
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
            // Patterns pour extraire taille et stock (basé sur vos logs)
            const patterns = [
              /^(.+?)\s*-\s*(\d+)\s*piéce\(s\)$/i,          // "42 - 3 piéce(s)" (standard)
              /^(.+?)\s*:\s*(\d+)\s*piéce\(s\)$/i,          // "Standard : 6 piéce(s)"
              /^Dimension\s*:\s*(.+?)\s*-\s*(\d+)\s*piéce\(s\)$/i, // "Dimension : Standard - 6 piéce(s)"
              /^(.+?)\s*-\s*(\d+)\s*piéces?$/i,                // "42 - 3 piéces"
              /^(.+?)\s*\(\s*(\d+)\s*\)$/i,                       // "Standard (6)"
              /^(.+?)\s*-\s*(\d+)\s*disp/i,                       // "42 - 3 disp"
              /^(.+?)\s*\[\s*(\d+)\s*\]/,                        // "Standard [6]"
              /^(.+?)\s*:\s*(\d+)$/,                              // "Standard:6"
              /^(.+?)\s*(\d+)\s*pièces?$/i,                     // "Standard 6 pièces"
              /^([\d\.]+)\s*-\s*(\d+)\s*piéce\(s\)$/i           // "40.5 - 1 piéce(s)"
            ];
            
            let matched = false;
            for (const pattern of patterns) {
              const match = text.match(pattern);
              if (match) {
                const size = match[1].trim();
                const stock = parseInt(match[2]) || 0;
                
                // Vérifier que la taille est valide (pas vide, pas "Toutes catégories", etc.)
                if (size && size.length > 0 && !size.toLowerCase().includes('catégorie') && !size.toLowerCase().includes('toutes')) {
                  const variant = {
                    size: size.replace(/[éèê]/g, 'e'), // Normaliser les accents
                    stock: stock
                  };
                  variants.push(variant);
                  logger.info(`✅ Variant ${index + 1} extrait avec stock`, { sku, variant, originalText: text, pattern: pattern.source });
                  matched = true;
                  break;
                } else {
                  logger.warn(`⚠️ Taille invalide ignorée`, { sku, size, originalText: text });
                }
              }
            }
            
            if (!matched) {
              // Si aucun pattern ne marche, essayer d'extraire au moins la taille
              const sizeOnly = text.replace(/[^\w\s\.]/g, '').trim();
              if (sizeOnly.length > 0) {
                const variant = {
                  size: sizeOnly,
                  stock: 0 // Stock inconnu
                };
                variants.push(variant);
                logger.info(`⚠️ Variant ${index + 1} extrait sans stock`, { sku, variant, originalText: text });
              } else {
                logger.warn(`⚠️ Option ${index + 1} non reconnue`, { sku, text });
              }
            }
          }
        });
      } else {
        logger.warn('⚠️ Aucun sélecteur de taille trouvé', { sku });
        
        // Tentative d'extraction depuis les boutons ou divs
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

      const totalStock = variants.reduce((total, v) => total + v.stock, 0);
      
      const product: KimlandProduct = {
        id: productUrl.split('/').slice(-2, -1)[0] || 'unknown',
        name: productName.textContent?.trim() || '',
        url: productUrl,
        price: priceElement?.textContent?.trim() || '',
        oldPrice: oldPriceElement?.textContent?.trim(),
        variants,
        imageUrl: productImage?.src ? new URL(productImage.src, 'https://kimland.dz').href : ''
      };

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
      logger.error('❌ Erreur recherche produit', { sku, error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  /**
   * Vérifier si connecté
   */
  isLoggedIn(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Déconnexion
   */
  logout(): void {
    this.isAuthenticated = false;
    this.phpsessid = '';
    logger.info('🔐 Déconnexion Kimland');
  }
}
