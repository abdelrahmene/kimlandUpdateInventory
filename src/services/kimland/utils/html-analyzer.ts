import { ProductScore, PageAnalysis } from '../types/kimland.types';
import { logger } from '../../../utils/logger';

export class HtmlAnalyzer {
  /**
   * Vérifier si un élément est un filtre (à ignorer)
   */
  static isFilterElement(element: Element): boolean {
    const tagName = element.tagName.toLowerCase();
    const className = element.className || '';
    const innerHTML = element.innerHTML || '';
    const id = element.id || '';

    return (
      tagName === 'label' ||
      tagName === 'input' ||
      innerHTML.includes('input type="checkbox"') ||
      innerHTML.includes('name="pointure"') ||
      innerHTML.includes('name="categori') ||
      className.includes('filter') ||
      id.includes('filter') ||
      className.includes('sidebar') ||
      className.includes('menu') ||
      innerHTML.includes('filter') ||
      innerHTML.includes('sidebar')
    );
  }

  /**
   * Calculer le score d'un élément produit
   */
  static calculateProductScore(element: Element, sku: string, productName?: string): ProductScore {
    const hasLink = element.querySelector('a[href]') ? 1 : 0;
    const hasImage = element.querySelector('img') ? 1 : 0;
    const hasTitle = element.querySelector('[class*="name"], [class*="title"], h1, h2, h3, h4, h5, h6') ? 1 : 0;
    const hasPrice = element.querySelector('[class*="price"], [class*="cost"], [class*="prix"]') ? 1 : 0;
    
    // Bonus pour correspondance SKU
    const elementText = element.textContent?.toLowerCase() || '';
    const skuMatch = elementText.includes(sku.toLowerCase()) ? 3 : 0;
    
    // Bonus pour correspondance nom de produit
    let nameMatch = 0;
    if (productName) {
      const productNameLower = productName.toLowerCase();
      const words = productNameLower.split(' ').filter(w => w.length > 2);
      let matchingWords = 0;
      
      for (const word of words) {
        if (elementText.includes(word)) {
          matchingWords++;
        }
      }
      
      if (matchingWords > 0) {
        nameMatch = Math.min(3, matchingWords); // Maximum 3 points
      }
    }
    
    const total = hasLink + hasImage + hasTitle + hasPrice + skuMatch + nameMatch;
    
    return {
      total,
      hasLink,
      hasImage,
      hasTitle,
      hasPrice,
      skuMatch,
      nameMatch
    };
  }

  /**
   * Vérifier les indicateurs d'erreur dans la page
   */
  static checkErrorIndicators(pageText: string, sku: string): PageAnalysis {
    const containsSkuInText = pageText.includes(sku);
    const hasErrorMessage = pageText.includes("n'existe pas") || 
                           pageText.includes("recherche n'existe") ||
                           pageText.includes("Erreur 404") ||
                           pageText.includes("Page non trouvée");
    const hasNoResultsMessage = pageText.includes("aucun résultat") ||
                                pageText.includes("produit introuvable") ||
                                pageText.includes("aucun produit") ||
                                pageText.includes("recherche vide");
    
    return {
      containsSkuInText,
      hasErrorMessage,
      hasNoResultsMessage
    };
  }

  /**
   * Diagnostic de la page pour debug
   */
  static logPageDiagnostics(searchDoc: Document, sku: string): void {
    const allProductElements = searchDoc.querySelectorAll('[class*="product"], [class*="item"], .card, article, [class*="col"]');
    const elementsByType = Array.from(allProductElements).reduce((acc, el) => {
      const type = el.tagName.toLowerCase();
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const topClasses = Array.from(allProductElements)
      .map(el => el.className)
      .filter(c => c && c.length > 0)
      .slice(0, 10);

    logger.info('🔍 Diagnostic complet éléments page', {
      sku,
      totalElements: allProductElements.length,
      elementsByType,
      topClasses,
      hasRows: searchDoc.querySelectorAll('.row').length,
      hasCols: searchDoc.querySelectorAll('[class*="col-"]').length,
      hasProducts: searchDoc.querySelectorAll('[class*="product"]').length,
      hasItems: searchDoc.querySelectorAll('[class*="item"]').length
    });
  }

  /**
   * Obtenir les sélecteurs CSS pour les produits
   */
  static getProductSelectors(): string[] {
    return [
      // 1. Sélecteurs Kimland spécifiques
      '.product-item.col-6', 
      '.product-item.col-4',
      '.product-item.col-md-6',
      '.product-item',
      '.product-card',
      '.item.col-6',
      '.item.col-4', 
      '.product.col-6',
      '.product.col-4',
      
      // 2. Grilles Bootstrap communes
      '.row .col-6',
      '.row .col-4', 
      '.row .col-md-6',
      '.row .col-lg-4',
      '.products .col-6',
      '.products .col-4',
      '.container .col-6',
      '.container .col-4',
      
      // 3. Sélecteurs par classe partielle
      '[class*="col-6"][class*="product"]',
      '[class*="col-4"][class*="product"]',
      '[class*="product"][class*="col"]',
      '[class*="item"][class*="col"]',
      
      // 4. Liens et interactions
      'div[onclick*="product"]',
      'div[onclick*="item"]',
      'div[onclick*="detail"]',
      'a[href*="product"]',
      'a[href*="item"]',
      'a[href*="detail"]',
      
      // 5. Cartes et articles
      '.card.product',
      '.card[class*="product"]',
      '.product-card',
      '.item-card',
      'article.product',
      'article[class*="product"]',
      
      // 6. Conteneurs génériques (derniers recours)
      '.product',
      '.item',
      '[class*="product"]',
      '[class*="item"]',
      '.card',
      'article'
    ];
  }
}
