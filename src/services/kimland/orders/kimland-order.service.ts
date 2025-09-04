import axios, { AxiosInstance } from 'axios';
import { logger } from '../../../utils/logger';
import { KimlandAuthService } from '../kimland-auth.service';
import { KimlandClientService, KimlandClient } from './kimland-client.service';

export interface KimlandOrderItem {
  sku: string;
  quantity: number;
  price: number;
  name: string;
  size?: string;
  color?: string;
}

export interface KimlandOrder {
  id?: string;
  clientEmail: string;
  items: KimlandOrderItem[];
  totalAmount: number;
  shippingCost: number;
  shopifyOrderId: string;
  shopifyOrderNumber: string;
  notes?: string;
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
  createdAt: Date;
}

export class KimlandOrderService {
  private httpClient: AxiosInstance;
  private authService: KimlandAuthService;
  private clientService: KimlandClientService;
  private baseUrl = 'https://kimland.dz';

  constructor(authService: KimlandAuthService) {
    this.authService = authService;
    this.clientService = new KimlandClientService(authService);
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
   * Créer une commande complète sur Kimland depuis une commande Shopify
   */
  async createOrderFromShopify(shopifyOrder: any): Promise<{ success: boolean; kimlandOrderId?: string; error?: string }> {
    try {
      logger.info('🛒 Début création commande Kimland', {
        shopifyOrderId: shopifyOrder.id,
        shopifyOrderNumber: shopifyOrder.order_number,
        customerEmail: shopifyOrder.customer?.email
      });

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

      // 1. Créer ou vérifier le client
      const clientResult = await this.ensureClientExists(shopifyOrder);
      if (!clientResult.success) {
        return { success: false, error: `Erreur client: ${clientResult.error}` };
      }

      // 2. Naviguer vers la liste des clients pour confirmer la commande
      const clientListResult = await this.navigateToClientList();
      if (!clientListResult.success) {
        return { success: false, error: `Erreur navigation: ${clientListResult.error}` };
      }

      // 3. Cliquer sur "Confirmer la commande" pour ce client
      const confirmResult = await this.confirmClientOrder(shopifyOrder.customer.email);
      if (!confirmResult.success) {
        return { success: false, error: `Erreur confirmation: ${confirmResult.error}` };
      }

      logger.info('✅ Commande Kimland créée avec succès', {
        shopifyOrderId: shopifyOrder.id,
        kimlandOrderId: confirmResult.orderId
      });

      return {
        success: true,
        kimlandOrderId: confirmResult.orderId
      };

    } catch (error) {
      logger.error('❌ Erreur création commande Kimland', {
        shopifyOrderId: shopifyOrder.id,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  }

  /**
   * S'assurer qu'un client existe sur Kimland
   */
  private async ensureClientExists(shopifyOrder: any): Promise<{ success: boolean; clientId?: string; error?: string }> {
    const customerEmail = shopifyOrder.customer?.email;
    if (!customerEmail) {
      return { success: false, error: 'Email client manquant dans la commande Shopify' };
    }

    // Vérifier si le client existe déjà
    const exists = await this.clientService.clientExists(customerEmail);
    if (exists) {
      logger.info('👤 Client existe déjà sur Kimland', { email: customerEmail });
      return { success: true, clientId: customerEmail };
    }

    // Créer le client
    const shippingAddress = shopifyOrder.shipping_address || shopifyOrder.billing_address;
    if (!shippingAddress) {
      return { success: false, error: 'Adresse de livraison manquante' };
    }

    const clientData = this.clientService.normalizeShopifyAddress({
      ...shippingAddress,
      email: customerEmail
    });

    // Compléter les données manquantes
    const completeClientData: Omit<KimlandClient, 'id'> = {
      nom: clientData.nom || 'Client',
      prenom: clientData.prenom || 'Shopify',
      email: customerEmail,
      adresse: clientData.adresse || 'Adresse non spécifiée',
      tel1: clientData.tel1 || '0555000000',
      tel2: shippingAddress.phone ? this.normalizePhoneNumber(shippingAddress.phone) : undefined,
      wilaya: clientData.wilaya || 'Alger',
      wilayaId: this.clientService.getWilayaInfo(clientData.wilaya || 'Alger')?.id || 16,
      commune: clientData.commune || 'Centre-ville',
      communeId: 0, // Sera résolu par le service client
      frais: this.clientService.getWilayaInfo(clientData.wilaya || 'Alger')?.frais || 300
    };

    return await this.clientService.createClient(completeClientData);
  }

  /**
   * Naviguer vers la liste des clients
   */
  private async navigateToClientList(): Promise<{ success: boolean; error?: string }> {
    try {
      // Simuler le clic sur le lien "Liste des clients"
      const response = await this.httpClient.get('/app/client/client_list', {
        headers: {
          'Referer': `${this.baseUrl}/app/client/new_client`,
        }
      });

      if (response.status === 200) {
        logger.debug('📋 Navigation vers liste clients réussie');
        return { success: true };
      }

      return { success: false, error: 'Erreur de navigation vers la liste des clients' };

    } catch (error) {
      logger.error('❌ Erreur navigation liste clients', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur de navigation'
      };
    }
  }

  /**
   * Confirmer la commande pour un client spécifique
   */
  private async confirmClientOrder(clientEmail: string): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      // Simuler le clic sur le bouton "Confirmer la commande" 
      // Basé sur le code HTML: <a class="btn btn-danger duplique" id="1756986443DQPM@gmail.com">
      const confirmResponse = await this.httpClient.post('/App/Control/commande/confirm_order.php', {
        clientEmail: clientEmail,
        action: 'confirm'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Referer': `${this.baseUrl}/app/client/client_list`,
          'X-Requested-With': 'XMLHttpRequest'
        }
      });

      if (confirmResponse.status === 200) {
        const responseData = confirmResponse.data;
        
        // Extraire l'ID de la commande de la réponse
        let orderId = clientEmail; // Par défaut, utiliser l'email comme ID
        
        if (typeof responseData === 'string' && responseData.includes('commande')) {
          // Tenter d'extraire un ID de commande depuis la réponse
          const orderIdMatch = responseData.match(/commande[^0-9]*(\d+)/i);
          if (orderIdMatch) {
            orderId = orderIdMatch[1];
          }
        }

        logger.info('✅ Commande confirmée sur Kimland', {
          clientEmail,
          orderId,
          response: responseData
        });

        return { success: true, orderId };
      }

      return { success: false, error: 'Erreur de confirmation de commande' };

    } catch (error) {
      logger.error('❌ Erreur confirmation commande', {
        clientEmail,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erreur de confirmation'
      };
    }
  }

  /**
   * Convertir une commande Shopify en format Kimland
   */
  private convertShopifyOrder(shopifyOrder: any): KimlandOrder {
    const items: KimlandOrderItem[] = shopifyOrder.line_items.map((item: any) => ({
      sku: item.sku || `shopify_${item.product_id}_${item.variant_id}`,
      quantity: item.quantity,
      price: parseFloat(item.price),
      name: item.name,
      size: item.variant_title !== 'Default Title' ? item.variant_title : undefined,
      color: undefined // À extraire si nécessaire
    }));

    const shippingCost = shopifyOrder.shipping_lines?.reduce((total: number, line: any) => 
      total + parseFloat(line.price), 0) || 0;

    return {
      clientEmail: shopifyOrder.customer.email,
      items,
      totalAmount: parseFloat(shopifyOrder.total_price),
      shippingCost,
      shopifyOrderId: shopifyOrder.id.toString(),
      shopifyOrderNumber: shopifyOrder.order_number.toString(),
      notes: shopifyOrder.note || `Commande Shopify #${shopifyOrder.order_number}`,
      status: 'pending',
      createdAt: new Date(shopifyOrder.created_at)
    };
  }

  /**
   * Normaliser un numéro de téléphone
   */
  private normalizePhoneNumber(phone: string): string {
    if (!phone) return '0555000000';
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('213')) {
      return '0' + cleaned.slice(3);
    }
    if (!cleaned.startsWith('0')) {
      return '0' + cleaned;
    }
    return cleaned.length === 10 ? cleaned : '0555000000';
  }
}