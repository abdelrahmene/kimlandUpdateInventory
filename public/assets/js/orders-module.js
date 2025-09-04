// Module de gestion des commandes Shopify ↔ Kimland
class OrdersModule {
    constructor() {
        this.currentShop = null;
        this.stats = {
            totalSynced: 0,
            pendingSync: 0,
            errors: 0,
            lastSync: null
        };
        this.logs = [];
        this.isConnected = false;
        
        this.init();
    }

    init() {
        // Récupérer le shop depuis les paramètres URL
        const urlParams = new URLSearchParams(window.location.search);
        this.currentShop = urlParams.get('shop');
        
        if (!this.currentShop) {
            this.logError('Shop non spécifié dans l\'URL');
            return;
        }

        this.loadOrdersModule();
        this.startStatusCheck();
        this.setupEventListeners();
    }

    // Charger le statut des commandes
    async loadOrdersModule() {
        try {
            const response = await fetch(`/api/orders/sync/status`);
            const data = await response.json();
            
            if (data.success) {
                this.updateStats(data.status);
                this.updateUI();
            } else {
                this.logError('Erreur chargement statut: ' + data.error);
            }
        } catch (error) {
            this.logError('Erreur connexion API: ' + error.message);
        }
    }

    // Mettre à jour les statistiques
    updateStats(status) {
        this.isConnected = status.kimlandConnected;
        this.stats = {
            totalSynced: status.totalSynced || 0,
            pendingSync: 0, // À implémenter
            errors: status.errors || 0,
            lastSync: status.lastSync ? new Date(status.lastSync) : null
        };
    }

    // Mettre à jour l'interface utilisateur
    updateUI() {
        this.updateStatsCards();
        this.updateConnectionStatus();
        this.updateRecentOrders();
    }

    // Mettre à jour les cartes de statistiques
    updateStatsCards() {
        const syncedEl = document.getElementById('stat-synced');
        const pendingEl = document.getElementById('stat-pending');
        const errorsEl = document.getElementById('stat-errors');
        
        if (syncedEl) syncedEl.textContent = this.stats.totalSynced;
        if (pendingEl) pendingEl.textContent = this.stats.pendingSync;
        if (errorsEl) errorsEl.textContent = this.stats.errors;
    }

    // Mettre à jour le statut de connexion
    updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;

        statusEl.className = `orders-status ${this.isConnected ? 'connected' : 'disconnected'}`;
        statusEl.innerHTML = this.isConnected 
            ? '🟢 Connecté à Kimland - Synchronisation automatique active'
            : '🔴 Déconnecté de Kimland - Vérifiez la configuration';
    }

    // Tester la création d'un client
    async testClient() {
        this.logInfo('Test de création client démarré...');
        
        try {
            const response = await fetch(`/api/orders/test/create-client`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.logSuccess(`Client créé avec succès !`);
                this.logInfo(`Email: ${data.clientData.email}`);
                this.logInfo(`Wilaya: ${data.clientData.wilaya} (${data.wilayaInfo.frais} DA de frais)`);
                this.logInfo(`Kimland ID: ${data.kimlandResult.clientId}`);
            } else {
                this.logError(`Création client échouée: ${data.error}`);
                if (data.kimlandResult && data.kimlandResult.error) {
                    this.logError(`Détail: ${data.kimlandResult.error}`);
                }
            }
        } catch (error) {
            this.logError('Erreur test client: ' + error.message);
        }
    }

    // Tester la synchronisation
    async testSync() {
        this.logInfo('Test de synchronisation démarré...');
        
        try {
            const response = await fetch(`/api/orders/sync/test`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await response.json();
            
            if (data.success && data.result) {
                const result = data.result;
                if (result.success) {
                    this.logSuccess(`Test réussi - Commande ${result.shopifyOrderNumber} synchronisée`);
                    this.logInfo(`ID Kimland: ${result.kimlandOrderId}`);
                } else {
                    this.logError(`Test échoué: ${result.error}`);
                }
            } else {
                this.logError('Erreur test: ' + (data.error || 'Erreur inconnue'));
            }
        } catch (error) {
            this.logError('Erreur test sync: ' + error.message);
        }
    }

    // Synchroniser les commandes récentes
    async syncRecent() {
        this.logInfo('Synchronisation des commandes récentes...');
        
        try {
            const response = await fetch(`/api/orders/sync/recent?shop=${encodeURIComponent(this.currentShop)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ days: 7 })
            });
            
            const data = await response.json();
            
            if (data.success && data.stats) {
                const stats = data.stats;
                this.logSuccess(`Synchronisation terminée: ${stats.successful}/${stats.total} commandes`);
                
                // Afficher les détails des erreurs
                if (stats.failed > 0) {
                    const failures = stats.results.filter(r => !r.success);
                    failures.forEach(failure => {
                        this.logError(`Commande ${failure.shopifyOrderNumber}: ${failure.error}`);
                    });
                }
                
                this.stats.totalSynced += stats.successful;
                this.stats.errors += stats.failed;
                this.updateStatsCards();
            } else {
                this.logError('Erreur sync récentes: ' + (data.error || 'Erreur inconnue'));
            }
        } catch (error) {
            this.logError('Erreur sync récentes: ' + error.message);
        }
    }

    // Vérifier le statut périodiquement
    startStatusCheck() {
        setInterval(() => {
            this.loadOrdersModule();
        }, 30000); // Toutes les 30 secondes
    }

    // Configurer les événements
    setupEventListeners() {
        // Bouton test client
        const testClientBtn = document.getElementById('test-client-btn');
        if (testClientBtn) {
            testClientBtn.addEventListener('click', () => this.testClient());
        }

        // Bouton test
        const testBtn = document.getElementById('test-sync-btn');
        if (testBtn) {
            testBtn.addEventListener('click', () => this.testSync());
        }

        // Bouton sync récentes
        const syncBtn = document.getElementById('sync-recent-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.syncRecent());
        }

        // Bouton actualiser statut
        const refreshBtn = document.getElementById('refresh-status-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadOrdersModule());
        }

        // Boutons collapse/expand
        this.setupToggleButtons();
    }

    // Configurer les boutons de toggle
    setupToggleButtons() {
        const toggles = document.querySelectorAll('.toggle-section');
        toggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                const content = toggle.nextElementSibling;
                const arrow = toggle.querySelector('.toggle-arrow');
                
                if (content && arrow) {
                    const isExpanded = content.classList.contains('expanded');
                    
                    if (isExpanded) {
                        content.classList.remove('expanded');
                        arrow.classList.remove('expanded');
                    } else {
                        content.classList.add('expanded');
                        arrow.classList.add('expanded');
                    }
                }
            });
        });
    }

    // Mettre à jour les commandes récentes (simulé)
    updateRecentOrders() {
        const container = document.getElementById('recent-orders-list');
        if (!container) return;

        // Simulation de commandes récentes
        const recentOrders = [
            {
                number: '#1001',
                customer: 'client@example.com',
                status: 'synced',
                timestamp: new Date(Date.now() - 1000 * 60 * 30) // 30 min ago
            },
            {
                number: '#1000',
                customer: 'test@kimland.com',
                status: 'pending',
                timestamp: new Date(Date.now() - 1000 * 60 * 60) // 1h ago
            }
        ];

        container.innerHTML = recentOrders.map(order => `
            <div class="recent-order">
                <div class="order-info">
                    <div class="order-number">${order.number}</div>
                    <div class="order-customer">${order.customer}</div>
                </div>
                <div class="order-status ${order.status}">
                    ${order.status === 'synced' ? 'Synchronisé' : 
                      order.status === 'pending' ? 'En attente' : 'Échec'}
                </div>
            </div>
        `).join('');
    }

    // Logging
    logInfo(message) {
        this.addLogEntry('info', message);
    }

    logSuccess(message) {
        this.addLogEntry('success', message);
    }

    logError(message) {
        this.addLogEntry('error', message);
        console.error('[OrdersModule]', message);
    }

    addLogEntry(type, message) {
        const timestamp = new Date().toLocaleTimeString();
        const entry = {
            type,
            message,
            timestamp
        };
        
        this.logs.unshift(entry);
        
        // Garder seulement les 50 dernières entrées
        if (this.logs.length > 50) {
            this.logs = this.logs.slice(0, 50);
        }
        
        this.updateLogDisplay();
    }

    updateLogDisplay() {
        const logEl = document.getElementById('orders-log');
        if (!logEl) return;

        logEl.innerHTML = this.logs.map(entry => `
            <div class="log-entry ${entry.type}">
                <span class="log-timestamp">${entry.timestamp}</span>
                ${entry.message}
            </div>
        `).join('');

        // Auto-scroll vers le haut (nouveau log)
        logEl.scrollTop = 0;
    }

    // Méthodes utilitaires
    formatDate(date) {
        if (!date) return 'Jamais';
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    }
}

// Initialiser le module quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier si on est sur la page avec le module de commandes
    if (document.getElementById('orders-module')) {
        window.ordersModule = new OrdersModule();
    }
});