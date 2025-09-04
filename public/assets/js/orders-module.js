// Module de gestion des commandes Shopify → Kimland
class OrdersModule {
    constructor() {
        this.currentShop = null;
        this.orders = [];
        this.stats = {
            received: 0,
            pending: 0,
            success: 0,
            errors: 0
        };
        this.isConnected = false;
        this.eventSource = null; // Pour stocker la connexion SSE
        
        this.init();
    }

    init() {
        const urlParams = new URLSearchParams(window.location.search);
        this.currentShop = urlParams.get('shop');
        
        if (!this.currentShop) {
            console.error('Shop non spécifié dans l\'URL');
            return;
        }

        this.setupEventListeners();
        this.loadOrdersModule();
        this.connectToRealTimeOrders();
    }

    // Charger le statut initial
    async loadOrdersModule() {
        try {
            const response = await fetch(`/api/orders/sync/status`);
            const data = await response.json();
            
            if (data.success) {
                this.updateStats(data.status);
                this.updateUI();
            }
        } catch (error) {
            console.error('Erreur chargement statut:', error);
        }
    }

    // Connexion temps réel pour les nouvelles commandes
    connectToRealTimeOrders() {
        console.log('🔗 [DEBUG] Tentative de connexion EventSource...');
        
        // Fermer la connexion existante si nécessaire
        if (this.eventSource) {
            console.log('🔗 [DEBUG] Fermeture de la connexion existante...');
            this.eventSource.close();
        }
        
        const eventSource = new EventSource('/api/logs/stream');
        this.eventSource = eventSource; // Stocker la référence
        
        eventSource.onopen = () => {
            console.log('✅ [DEBUG] EventSource connecté avec succès');
            console.log('🔍 [DEBUG] EventSource URL:', eventSource.url);
            console.log('🔍 [DEBUG] EventSource readyState:', eventSource.readyState);
        };
        
        eventSource.onmessage = (event) => {
            console.log('📨 [DEBUG] Message EventSource reçu:', event.data);
            console.log('📨 [DEBUG] Event type:', event.type);
            console.log('📨 [DEBUG] Event lastEventId:', event.lastEventId);
            
            try {
                const data = JSON.parse(event.data);
                console.log('📄 [DEBUG] Données parsées:', data);
                console.log('📄 [DEBUG] Type de message:', data.type);
                console.log('📄 [DEBUG] A des données:', !!data.data);
                
                if (data.type === 'webhook') {
                    console.log('🛒 [DEBUG] WEBHOOK DÉTECTÉ ! Données complètes:', data);
                    if (data.data) {
                        console.log('🛒 [DEBUG] Appel addNewOrder avec:', data.data);
                        this.addNewOrder(data.data);
                    } else {
                        console.warn('⚠️ [DEBUG] Webhook sans données ! Data complet:', data);
                    }
                } else if (data.type === 'connected') {
                    console.log('🔗 [DEBUG] Message de connexion SSE reçu:', data.message);
                } else {
                    console.log('ℹ️ [DEBUG] Message ignoré - Type:', data.type, 'Data:', !!data.data);
                }
            } catch (error) {
                console.error('❌ [DEBUG] Erreur parsing message EventSource:', error);
                console.error('❌ [DEBUG] Raw data:', event.data);
            }
        };
        
        eventSource.onerror = (error) => {
            console.error('❌ [DEBUG] Erreur EventSource:', error);
            console.log('🔄 [DEBUG] EventSource readyState:', eventSource.readyState);
            console.log('🔄 [DEBUG] EventSource CONNECTING:', EventSource.CONNECTING);
            console.log('🔄 [DEBUG] EventSource OPEN:', EventSource.OPEN);
            console.log('🔄 [DEBUG] EventSource CLOSED:', EventSource.CLOSED);
            
            // Si la connexion se ferme, ne pas reconnecter automatiquement pour l'instant
            // TODO: Corriger la configuration nginx/proxy pour SSE
            if (eventSource.readyState === EventSource.CLOSED) {
                console.log('⚠️ [DEBUG] Connexion SSE fermée - Reconnexion désactivée pour éviter la boucle');
                // setTimeout(() => {
                //     if (this.eventSource === eventSource) {
                //         console.log('♾️ [DEBUG] Tentative de reconnexion...');
                //         this.connectToRealTimeOrders();
                //     }
                // }, 5000);
            }
        };
        
        // Test de connexion après 2 secondes
        setTimeout(() => {
            console.log('🔍 [DEBUG] Vérification état EventSource après 2s:');
            console.log('  - ReadyState:', eventSource.readyState);
            console.log('  - URL:', eventSource.url);
            console.log('  - WithCredentials:', eventSource.withCredentials);
            
            if (eventSource.readyState !== EventSource.OPEN) {
                console.warn('⚠️ [DEBUG] EventSource pas ouvert après 2s, état:', eventSource.readyState);
            }
        }, 2000);
        
        // Stocker la référence pour debugging
        window.debugEventSource = eventSource;
    }

    // Ajouter une nouvelle commande à l'interface
    addNewOrder(orderData) {
        console.log('🔄 [DEBUG] addNewOrder APPELÉ ! Données reçues:', orderData);
        console.log('🔄 [DEBUG] Type des données:', typeof orderData);
        console.log('🔄 [DEBUG] Propriétés disponibles:', Object.keys(orderData));
        
        // Créer l'objet commande
        const order = {
            id: Date.now(),
            orderNumber: orderData.orderNumber || 'N/A',
            customerName: orderData.customerName || 'Client anonyme',
            customerEmail: orderData.customerEmail || 'Email non spécifié',
            totalPrice: orderData.totalPrice || '0.00',
            financialStatus: orderData.financialStatus || 'pending',
            itemsCount: orderData.itemsCount || 0,
            timestamp: new Date(),
            synced: false
        };
        
        console.log('📋 [DEBUG] Objet commande créé:', order);
        console.log('📋 [DEBUG] Avant ajout - Nombre de commandes:', this.orders.length);

        // Ajouter au début de la liste
        this.orders.unshift(order);
        console.log('📈 [DEBUG] Après ajout - Nombre de commandes:', this.orders.length);
        console.log('📈 [DEBUG] Première commande:', this.orders[0]);
        
        // Limiter à 50 commandes
        if (this.orders.length > 50) {
            this.orders = this.orders.slice(0, 50);
            console.log('📏 [DEBUG] Liste limitée à 50 commandes');
        }

        // Mettre à jour les stats
        this.stats.received++;
        if (order.financialStatus === 'pending') {
            this.stats.pending++;
        } else if (order.financialStatus === 'paid') {
            this.stats.success++;
        }
        
        console.log('📉 [DEBUG] Stats mises à jour:', this.stats);
        console.log('🎯 [DEBUG] Appel updateUI...');
        this.updateUI();
        console.log('🎯 [DEBUG] Appel renderOrders...');
        this.renderOrders();
        console.log('✅ [DEBUG] Interface mise à jour terminée');
        
        // Animation visuelle pour signaler la nouvelle commande
        const ordersList = document.getElementById('orders-list');
        if (ordersList) {
            ordersList.style.border = '2px solid #10b981';
            setTimeout(() => {
                ordersList.style.border = '1px solid rgba(0, 0, 0, 0.05)';
            }, 2000);
        }
    }

    // Afficher les commandes
    renderOrders() {
        console.log('🎨 [DEBUG] === RENDERORDERS APPELÉ ===');
        console.log('🎨 [DEBUG] Nombre de commandes à afficher:', this.orders.length);
        console.log('🎨 [DEBUG] Liste des commandes:', this.orders);
        
        const ordersList = document.getElementById('orders-list');
        if (!ordersList) {
            console.error('❌ [DEBUG] Element orders-list INTROUVABLE dans le DOM !');
            console.error('❌ [DEBUG] Éléments avec ID trouvés:', 
                Array.from(document.querySelectorAll('[id]')).map(el => el.id));
            return;
        }
        
        console.log('📋 [DEBUG] Element orders-list trouvé:', ordersList);
        console.log('📋 [DEBUG] Position dans le DOM:', ordersList.getBoundingClientRect());
        console.log('📋 [DEBUG] Contenu HTML actuel:', ordersList.innerHTML);

        if (this.orders.length === 0) {
            console.log('🚫 [DEBUG] Aucune commande, affichage empty state');
            const emptyHTML = `
                <div class="empty-state">
                    <span class="text-gray-500">⏳ En attente des commandes Shopify...</span>
                </div>
            `;
            ordersList.innerHTML = emptyHTML;
            console.log('🚫 [DEBUG] Empty state injecté:', emptyHTML);
            return;
        }

        console.log('📏 [DEBUG] Génération HTML pour', this.orders.length, 'commandes...');
        let html = '';
        this.orders.forEach((order, index) => {
            console.log(`📝 [DEBUG] Génération commande ${index + 1}:`, order);
            const orderHtml = this.renderOrderItem(order);
            html += orderHtml;
        });
        
        console.log('📜 [DEBUG] HTML complet généré (longueur):', html.length);
        console.log('📜 [DEBUG] HTML complet:', html);
        
        ordersList.innerHTML = html;
        console.log('✅ [DEBUG] HTML injecté dans orders-list');
        console.log('✅ [DEBUG] Nouveau contenu orders-list:', ordersList.innerHTML);
        
        // Forcer un repaint
        ordersList.style.display = 'none';
        ordersList.offsetHeight; // Force reflow
        ordersList.style.display = '';
        console.log('✅ [DEBUG] Repaint forcé');
    }

    // Afficher une commande individuelle
    renderOrderItem(order) {
        const statusClass = order.financialStatus === 'paid' ? 'paid' : 
                           order.financialStatus === 'pending' ? 'pending' : 'cancelled';
        
        const actionButton = order.synced ? 
            `<button class="action-btn success" disabled>
                <span>✓</span> Synchronisé
            </button>` :
            `<button class="action-btn primary" onclick="window.ordersModule.createClientForOrder('${order.id}')">
                <span>👤</span> Créer Client Kimland
            </button>`;

        return `
            <div class="order-item order-animation" data-order-id="${order.id}">
                <div class="order-header">
                    <div>
                        <div class="order-number">Commande #${order.orderNumber}</div>
                        <div class="order-timestamp">${order.timestamp.toLocaleString('fr-FR')}</div>
                    </div>
                    <span class="order-status ${statusClass}">${order.financialStatus}</span>
                </div>
                
                <div class="order-details">
                    <div class="order-customer">
                        <h4>👤 Client</h4>
                        <p><strong>${order.customerName}</strong></p>
                        <p>${order.customerEmail}</p>
                    </div>
                    
                    <div class="order-items">
                        <h4>📦 Articles</h4>
                        <p>${order.itemsCount} article(s)</p>
                        <div class="order-total">${order.totalPrice} DA</div>
                    </div>
                </div>
                
                <div class="order-actions">
                    ${actionButton}
                </div>
            </div>
        `;
    }

    // Créer un client sur Kimland
    async createClientForOrder(orderId) {
        const order = this.orders.find(o => o.id == orderId);
        if (!order) return;

        const button = document.querySelector(`[data-order-id="${orderId}"] .action-btn.primary`);
        if (button) {
            button.innerHTML = '<span>⏳</span> Création en cours...';
            button.disabled = true;
        }

        try {
            // Simuler l'appel API pour créer le client
            await this.delay(2000);
            
            // Simuler le succès (90% de chance)
            const success = Math.random() > 0.1;
            
            if (success) {
                order.synced = true;
                this.stats.success++;
                this.stats.pending = Math.max(0, this.stats.pending - 1);
                
                if (button) {
                    button.innerHTML = '<span>✓</span> Client Créé !';
                    button.className = 'action-btn success';
                }
                
                // Notification de succès
                this.showNotification(`Client créé avec succès pour la commande #${order.orderNumber}`, 'success');
                
            } else {
                this.stats.errors++;
                this.stats.pending = Math.max(0, this.stats.pending - 1);
                
                if (button) {
                    button.innerHTML = '<span>❌</span> Erreur';
                    button.className = 'action-btn warning';
                    button.disabled = false;
                }
                
                this.showNotification(`Erreur lors de la création du client pour #${order.orderNumber}`, 'error');
            }
            
            this.updateUI();
            
        } catch (error) {
            console.error('Erreur création client:', error);
            this.stats.errors++;
            this.updateUI();
            
            if (button) {
                button.innerHTML = '<span>🔄</span> Réessayer';
                button.disabled = false;
                button.className = 'action-btn warning';
            }
        }
    }

    // Tester le webhook
    async testWebhook() {
        console.log('🧪 [DEBUG] Test webhook démarré...');
        
        const testOrderData = {
            id: 'TEST_' + Date.now(),
            order_number: Math.floor(Math.random() * 9000) + 1000,
            test: false, // Forcer le traitement même si c'est un test
            customer: {
                email: 'test@webhook.com',
                first_name: 'Test',
                last_name: 'Client'
            },
            shipping_address: {
                first_name: 'Test',
                last_name: 'Client'
            },
            line_items: [{
                id: 1,
                product_id: 123,
                variant_id: 456,
                sku: 'TEST-SKU-001',
                name: 'Produit Test',
                quantity: 1,
                price: '29.99'
            }],
            total_price: '29.99',
            financial_status: 'paid',
            created_at: new Date().toISOString()
        };

        console.log('🧪 [DEBUG] Données de test:', testOrderData);

        try {
            console.log('📡 [DEBUG] Envoi de la requête webhook...');
            const response = await fetch('/api/orders/webhook/orders/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testOrderData)
            });
            
            console.log('📡 [DEBUG] Réponse reçue - Status:', response.status);
            const result = await response.json();
            console.log('📡 [DEBUG] Réponse JSON:', result);
            
            this.showNotification('Test webhook envoyé ! Vérifiez la console pour les détails.', 'success');
            
        } catch (error) {
            console.error('❌ [DEBUG] Erreur test webhook:', error);
            this.showNotification('Erreur test webhook: ' + error.message, 'error');
        }
    }

    // Mettre à jour les statistiques
    updateStats(status) {
        this.isConnected = status?.kimlandConnected || false;
        // Les stats sont mises à jour en temps réel via les commandes
    }

    // Mettre à jour l'interface
    updateUI() {
        this.updateStatsCards();
        this.updateConnectionStatus();
    }

    // Mettre à jour les cartes de stats
    updateStatsCards() {
        console.log('📊 [DEBUG] Mise à jour des stats:', this.stats);
        
        const elements = {
            'stat-synced': this.stats.received,
            'stat-pending': this.stats.pending,
            'stat-success': this.stats.success,
            'stat-errors': this.stats.errors
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                console.log(`📊 [DEBUG] Mise à jour ${id}: ${el.textContent} → ${value}`);
                el.textContent = value;
            } else {
                console.warn(`📊 [DEBUG] Élément ${id} introuvable !`);
            }
        });
    }

    // Mettre à jour le statut de connexion
    updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;

        statusEl.className = `orders-status ${this.isConnected ? 'connected' : 'disconnected'}`;
        statusEl.innerHTML = this.isConnected 
            ? '🟢 Connecté à Kimland - Prêt pour synchronisation'
            : '🔴 Déconnecté de Kimland - Vérifiez la configuration';
    }

    // Configuration des événements
    setupEventListeners() {
        const testBtn = document.getElementById('test-webhook-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testWebhook());
        }

        const clearBtn = document.getElementById('clear-console-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.clearOrders());
        }

        const refreshBtn = document.getElementById('refresh-status-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadOrdersModule());
        }
    }

    // Vider la liste des commandes
    clearOrders() {
        this.orders = [];
        this.stats = { received: 0, pending: 0, success: 0, errors: 0 };
        this.renderOrders();
        this.updateUI();
        this.showNotification('Liste des commandes vidée', 'info');
    }

    // Afficher une notification
    showNotification(message, type = 'info') {
        // Simple notification dans la console pour le moment
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Vous pouvez ajouter une vraie notification toast ici
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
            color: white;
            border-radius: 8px;
            z-index: 1000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    // Utilitaires
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialiser le module
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('orders-module')) {
        console.log('🚀 [DEBUG] Initialisation OrdersModule...');
        window.ordersModule = new OrdersModule();
        console.log('🚀 [DEBUG] OrdersModule initialisé:', window.ordersModule);
    } else {
        console.log('⚠️ [DEBUG] Element orders-module introuvable, module non initialisé');
    }
});

// Ajouter les styles pour les notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
`;
document.head.appendChild(style);
