import axios, { AxiosInstance } from 'axios';
import { logger } from '../../../utils/logger';
import { KimlandAuthService } from '../kimland-auth.service';

// Activer l'analyseur de requêtes en mode développement
if (process.env.NODE_ENV !== 'production') {
  try {
    const KimlandRequestAnalyzer = require('../../../../utils/kimland-analyzer.js');
    new KimlandRequestAnalyzer();
    logger.info('🔍 Analyseur de requêtes Kimland activé');
  } catch (error) {
    logger.warn('⚠️ Impossible de charger l\'analyseur de requêtes', { error: error.message });
  }
}

export interface KimlandClient {
  id?: string;
  nom: string;
  prenom: string;
  email: string;
  adresse: string;
  tel1: string;
  tel2?: string;
  wilaya: string;
  wilayaId: number;
  commune: string;
  communeId: number;
  frais: number;
}

export interface WilayaInfo {
  id: number;
  nom: string;
  frais: number;
}

export interface CommuneInfo {
  id: number;
  nom: string;
  wilayaId: number;
}

export class KimlandClientService {
  private httpClient: AxiosInstance;
  private authService: KimlandAuthService;
  private baseUrl = 'https://kimland.dz';

  // Mapping des wilayas avec leurs frais de livraison
  private readonly WILAYAS: Record<string, WilayaInfo> = {
    'Adrar': { id: 1, nom: 'Adrar', frais: 1000 },
    'Chlef': { id: 2, nom: 'Chlef', frais: 500 },
    'Laghouat': { id: 3, nom: 'Laghouat', frais: 600 },
    'Oum el Bouaghi': { id: 4, nom: 'Oum el Bouaghi', frais: 500 },
    'Batna': { id: 5, nom: 'Batna', frais: 600 },
    'Bejaia': { id: 6, nom: 'Bejaia', frais: 500 },
    'Biskra': { id: 7, nom: 'Biskra', frais: 600 },
    'Bechar': { id: 8, nom: 'Bechar', frais: 800 },
    'Blida': { id: 9, nom: 'Blida', frais: 400 },
    'Bouira': { id: 10, nom: 'Bouira', frais: 500 },
    'Tamanrasset': { id: 11, nom: 'Tamanrasset', frais: 1500 },
    'Tebessa': { id: 12, nom: 'Tebessa', frais: 500 },
    'Tlemcen': { id: 13, nom: 'Tlemcen', frais: 500 },
    'Tiaret': { id: 14, nom: 'Tiaret', frais: 500 },
    'Tizi Ouzou': { id: 15, nom: 'Tizi Ouzou', frais: 500 },
    'Alger': { id: 16, nom: 'Alger', frais: 300 },
    'Djelfa': { id: 17, nom: 'Djelfa', frais: 600 },
    'Jijel': { id: 18, nom: 'Jijel', frais: 500 },
    'Setif': { id: 19, nom: 'Setif', frais: 500 },
    'Saida': { id: 20, nom: 'Saida', frais: 600 },
    'Skikda': { id: 21, nom: 'Skikda', frais: 500 },
    'Sidi Bel Abbes': { id: 22, nom: 'Sidi Bel Abbes', frais: 500 },
    'Annaba': { id: 23, nom: 'Annaba', frais: 500 },
    'Guelma': { id: 24, nom: 'Guelma', frais: 500 },
    'Constantine': { id: 25, nom: 'Constantine', frais: 500 },
    'Medea': { id: 26, nom: 'Medea', frais: 500 },
    'Mostaganem': { id: 27, nom: 'Mostaganem', frais: 500 },
    'MSila': { id: 28, nom: 'MSila', frais: 600 },
    'Mascara': { id: 29, nom: 'Mascara', frais: 500 },
    'Ouargla': { id: 30, nom: 'Ouargla', frais: 700 },
    'Oran': { id: 31, nom: 'Oran', frais: 500 },
    'El Bayadh': { id: 32, nom: 'El Bayadh', frais: 800 },
    'Illizi': { id: 33, nom: 'Illizi', frais: 1500 },
    'Bordj Bou Arraridj': { id: 34, nom: 'Bordj Bou Arraridj', frais: 500 },
    'Boumerdes': { id: 35, nom: 'Boumerdes', frais: 400 },
    'El Taref': { id: 36, nom: 'El Taref', frais: 500 },
    'Tindouf': { id: 37, nom: 'Tindouf', frais: 1000 },
    'Tissemsilt': { id: 38, nom: 'Tissemsilt', frais: 600 },
    'El Oued': { id: 39, nom: 'El Oued', frais: 700 },
    'Khenchela': { id: 40, nom: 'Khenchela', frais: 500 },
    'Souk Ahras': { id: 41, nom: 'Souk Ahras', frais: 500 },
    'Tipaza': { id: 42, nom: 'Tipaza', frais: 400 },
    'Mila': { id: 43, nom: 'Mila', frais: 600 },
    'Ain Defla': { id: 44, nom: 'Ain Defla', frais: 500 },
    'Naama': { id: 45, nom: 'Naama', frais: 800 },
    'Ain Temouchent': { id: 46, nom: 'Ain Temouchent', frais: 500 },
    'Ghardaia': { id: 47, nom: 'Ghardaia', frais: 600 },
    'Relizane': { id: 48, nom: 'Relizane', frais: 600 }
  };

  constructor(authService: KimlandAuthService) {
    this.authService = authService;
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
      withCredentials: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    });
  }

  /**
   * Créer un nouveau client sur Kimland
   */
  async createClient(clientData: Omit<KimlandClient, 'id'>): Promise<{ success: boolean; clientId?: string; error?: string }> {
    try {
      // S'assurer d'être connecté
      if (!this.authService.isLoggedIn()) {
        const authResult = await this.authService.authenticate({
          email: 'bousetta88@gmail.com',
          username: 'Boumediene Bousetta',
          password: 'Abraj@Injaz'
        });
        
        if (!authResult) {
          return { success: false, error: 'Échec de l\'authentification Kimland' };
        }
      }

      // Obtenir les informations de la wilaya
      const wilayaInfo = this.getWilayaInfo(clientData.wilaya);
      if (!wilayaInfo) {
        return { success: false, error: `Wilaya non trouvée: ${clientData.wilaya}` };
      }

      // Obtenir les communes pour cette wilaya
      const communes = await this.getCommunesForWilaya(wilayaInfo.id);
      const commune = communes.find(c => c.nom.toLowerCase() === clientData.commune.toLowerCase());
      if (!commune) {
        return { success: false, error: `Commune non trouvée: ${clientData.commune}` };
      }

      // Construire les données du formulaire pour créer le client
      const formData = new FormData();
      formData.append('nom', clientData.nom);
      formData.append('prenom', clientData.prenom);
      formData.append('email', clientData.email);
      formData.append('adresse', clientData.adresse);
      formData.append('tel1', clientData.tel1);
      formData.append('tel2', clientData.tel2 || '');
      formData.append('wilaya', wilayaInfo.id.toString());
      formData.append('commune', commune.id.toString());
      formData.append('frais', wilayaInfo.frais.toString());

      logger.info('🏗️ Création client Kimland', {
        nom: clientData.nom,
        prenom: clientData.prenom,
        email: clientData.email,
        wilaya: clientData.wilaya,
        commune: clientData.commune,
        frais: wilayaInfo.frais
      });

      // Envoyer la requête de création du client
      const response = await this.httpClient.post('/App/Control/client/new_client.php', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Referer': `${this.baseUrl}/app/client/new_client`,
          'Origin': this.baseUrl
        }
      });

      // Analyser la réponse
      if (response.status === 200) {
        // La réponse devrait contenir un indicateur de succès
        const responseText = response.data;
        
        if (typeof responseText === 'string' && responseText.includes('success')) {
          logger.info('✅ Client créé avec succès sur Kimland', {
            email: clientData.email,
            response: responseText
          });
          
          return { 
            success: true, 
            clientId: clientData.email // Utiliser l'email comme identifiant
          };
        }
      }

      return { success: false, error: 'Réponse inattendue du serveur Kimland' };

    } catch (error) {
      logger.error('❌ Erreur création client Kimland', {
        error: error instanceof Error ? error.message : String(error),
        clientEmail: clientData.email
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * Vérifier si un client existe déjà
   */
  async clientExists(email: string): Promise<boolean> {
    try {
      // Naviguer vers la page des clients
      const clientsResponse = await this.httpClient.get('/app/client/client_list');
      const htmlContent = clientsResponse.data;

      // Chercher l'email dans le contenu HTML
      return htmlContent.includes(email);

    } catch (error) {
      logger.warn('⚠️ Erreur vérification existence client', { 
        email, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return false;
    }
  }

  /**
   * Obtenir les informations d'une wilaya
   */
  getWilayaInfo(wilayaNom: string): WilayaInfo | null {
    // Normaliser le nom pour la recherche
    const normalizedNom = wilayaNom.toLowerCase().trim();
    
    // Chercher dans les wilayas
    for (const [key, wilaya] of Object.entries(this.WILAYAS)) {
      if (key.toLowerCase() === normalizedNom || wilaya.nom.toLowerCase() === normalizedNom) {
        return wilaya;
      }
    }

    return null;
  }

  /**
   * Obtenir les communes d'une wilaya
   */
  async getCommunesForWilaya(wilayaId: number): Promise<CommuneInfo[]> {
    try {
      // Cette requête simule l'appel AJAX pour récupérer les communes
      const response = await this.httpClient.post('/App/Control/commande/select_commune.php', 
        `wilayaID=${wilayaId}&commune=commune`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      const htmlContent = response.data;
      const communes: CommuneInfo[] = [];

      // Parser la réponse HTML pour extraire les communes
      const optionRegex = /<option value="(\d+)">([^<]+)<\/option>/g;
      let match;

      while ((match = optionRegex.exec(htmlContent)) !== null) {
        const [, valueStr, nom] = match;
        const id = parseInt(valueStr);
        
        if (id > 0 && nom.trim() !== 'Séléctionner') {
          communes.push({
            id,
            nom: nom.trim(),
            wilayaId
          });
        }
      }

      return communes;

    } catch (error) {
      logger.warn('⚠️ Erreur récupération communes', { 
        wilayaId, 
        error: error instanceof Error ? error.message : String(error) 
      });
      return [];
    }
  }

  /**
   * Normaliser les données d'adresse depuis Shopify
   */
  normalizeShopifyAddress(address: any): Partial<KimlandClient> {
    const fullName = `${address.first_name || ''} ${address.last_name || ''}`.trim();
    const [prenom, ...nomParts] = fullName.split(' ');
    const nom = nomParts.join(' ') || prenom; // Si un seul nom, l'utiliser comme nom de famille

    // Mapper les provinces/états vers les wilayas algériennes
    const wilayaMapping: Record<string, string> = {
      'algeria': 'Alger',
      'alger': 'Alger',
      'oran': 'Oran',
      'constantine': 'Constantine',
      'annaba': 'Annaba',
      // Ajouter d'autres mappings si nécessaire
    };

    const wilaya = wilayaMapping[address.province?.toLowerCase()] || 
                   address.province || 
                   'Alger'; // Valeur par défaut

    return {
      nom: nom || 'Client',
      prenom: prenom || 'Shopify',
      email: address.email || `shopify_${Date.now()}@temp.com`,
      adresse: `${address.address1 || ''} ${address.address2 || ''}`.trim() || 'Adresse non spécifiée',
      tel1: this.normalizePhoneNumber(address.phone),
      wilaya,
      commune: address.city || 'Centre-ville' // Commune par défaut
    };
  }

  /**
   * Normaliser un numéro de téléphone algérien
   */
  private normalizePhoneNumber(phone: string): string {
    if (!phone) return '0555000000'; // Numéro par défaut

    // Nettoyer le numéro
    const cleaned = phone.replace(/\D/g, '');
    
    // Si le numéro commence par 213 (code pays), le retirer
    if (cleaned.startsWith('213')) {
      return '0' + cleaned.slice(3);
    }
    
    // Si le numéro ne commence pas par 0, l'ajouter
    if (!cleaned.startsWith('0')) {
      return '0' + cleaned;
    }

    // S'assurer que le numéro fait 10 chiffres
    if (cleaned.length === 10) {
      return cleaned;
    }

    // Si le numéro est trop court ou trop long, utiliser un numéro par défaut
    return '0555000000';
  }
}