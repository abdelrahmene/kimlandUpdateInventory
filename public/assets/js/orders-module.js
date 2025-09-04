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
        const eventSource = new EventSource('/api/logs/stream');
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'webhook' && data.data) {
                    this.addNewOrder(data.data);
                }
            } catch (error) {
                console.error('Erreur parsing message:', error);
            }
        };
        
        eventSource.onerror = (error) => {
            console.error('Erreur EventSource:', error);
        };
    }

    // Ajouter une nouvelle commande à l'interface
    addNewOrder(orderData) {
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

        // Ajouter au début de la liste
        this.orders.unshift(order);
        
        // Limiter à 50 commandes
        if (this.orders.length > 50) {
            this.orders = this.orders.slice(0, 50);
        }

        // Mettre à jour les stats
        this.stats.received++;
        if (order.financialStatus === 'pending') {
            this.stats.pending++;
        }
        
        this.updateUI();
        this.renderOrders();
    }

    // Afficher les commandes
    renderOrders() {
        const ordersList = document.getElementById('orders-list');
        if (!ordersList) return;

        if (this.orders.length === 0) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <span class="text-gray-500">⏳ En attente des commandes Shopify...</span>
                </div>
            `;
            return;
        }

        ordersList.innerHTML = this.orders.map(order => this.renderOrderItem(order)).join('');
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
        const testOrderData = {
            id: 'TEST_' + Date.now(),
            order_number: Math.floor(Math.random() * 9000) + 1000,
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
                name: 'Produit Test',
                quantity: 1,
                price: '99.99'
            }],
            total_price: '99.99',
            financial_status: 'paid',
            created_at: new Date().toISOString()
        };

        try {
            const response = await fetch('/api/orders/webhook/orders/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testOrderData)
            });
            
            const result = await response.json();
            this.showNotification('Test webhook envoyé !', 'success');
            
        } catch (error) {
            console.error('Erreur test webhook:', error);
            this.showNotification('Erreur test webhook', 'error');
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
        const elements = {
            'stat-synced': this.stats.received,
            'stat-pending': this.stats.pending,
            'stat-success': this.stats.success,
            'stat-errors': this.stats.errors
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
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
        window.ordersModule = new OrdersModule();
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