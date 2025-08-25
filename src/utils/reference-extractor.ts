import { logger } from './logger';

export class ReferenceExtractor {
  private static readonly REFERENCE_PATTERNS = [
    // Patterns avec étiquettes explicites
    /Référence\s*:?\s*([A-Z0-9\-_\.]+)/i,
    /REF\.?\s*:?\s*([A-Z0-9\-_\.]+)/i,
    /Reference\s*:?\s*([A-Z0-9\-_\.]+)/i,
    /Code\s*:?\s*([A-Z0-9\-_\.]+)/i,
    /SKU\s*:?\s*([A-Z0-9\-_\.]+)/i,
    /Art\.?\s*:?\s*([A-Z0-9\-_\.]+)/i,
    /Article\s*:?\s*([A-Z0-9\-_\.]+)/i,
    /Modèle\s*:?\s*([A-Z0-9\-_\.]+)/i,
    /Model\s*:?\s*([A-Z0-9\-_\.]+)/i,
    
    // Patterns spécifiques pour formats communs
    /\b([0-9]{4}[A-Z]?\-[0-9A-Z]+)\b/i, // Format: 9902F-1482
    /\b([A-Z]{2}[0-9]{4})\b/, // Format: EG1758
    /\b([A-Z]+[0-9]+[A-Z]*\-?[0-9]*)\b/i, // Formats mixtes
  ];

  /**
   * Nettoie le HTML en supprimant les balises
   */
  private static cleanHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, ' ') // Supprimer toutes les balises HTML
      .replace(/&nbsp;/g, ' ') // Remplacer les espaces insécables
      .replace(/&amp;/g, '&') // Remplacer les entités HTML
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ') // Normaliser les espaces
      .trim();
  }

  /**
   * Extrait la référence depuis une description HTML
   */
  public static extractFromDescription(description?: string): string | null {
    if (!description || description.trim() === '') {
      return null;
    }

    try {
      // Nettoyer le HTML
      const cleanText = this.cleanHtml(description);

      // Essayer tous les patterns
      for (const pattern of this.REFERENCE_PATTERNS) {
        const match = cleanText.match(pattern);
        if (match && match[1]) {
          const reference = match[1].trim();
          
          // Valider que ce n'est pas juste des espaces ou caractères vides
          if (reference.length > 0 && reference !== 'null' && reference !== 'undefined') {
            logger.debug('Référence extraite', {
              pattern: pattern.source,
              reference,
              description: cleanText.substring(0, 100)
            });
            return reference;
          }
        }
      }

      // Log si aucune référence trouvée
      if (cleanText.length > 0) {
        logger.debug('Aucune référence trouvée', {
          description: cleanText.substring(0, 200)
        });
      }

      return null;
    } catch (error) {
      logger.error('Erreur lors de l\'extraction de référence', {
        error: error instanceof Error ? error.message : error,
        description: description?.substring(0, 100)
      });
      return null;
    }
  }

  /**
   * Valide qu'une référence extraite est valide
   */
  public static isValidReference(reference: string): boolean {
    if (!reference || typeof reference !== 'string') {
      return false;
    }

    const trimmed = reference.trim();
    
    // Vérifications de base
    if (trimmed.length === 0) return false;
    if (trimmed === 'null' || trimmed === 'undefined') return false;
    if (trimmed.length < 2 || trimmed.length > 50) return false;

    // Vérifier qu'il contient au moins un caractère alphanumérique
    return /[A-Za-z0-9]/.test(trimmed);
  }

  /**
   * Nettoie et normalise une référence
   */
  public static normalizeReference(reference: string): string {
    return reference.trim().toUpperCase();
  }
}
