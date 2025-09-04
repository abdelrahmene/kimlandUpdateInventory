// Module de gestion des commandes Shopify ↔ Kimland - Version Console
class OrdersModule {
    constructor() {
        this.currentShop = null;
        this.stats = {
            received: 0,
            pending: 0,
            success: 0,
            errors: 0
        };
        this.isConnected = false;
        this.orders = [];
        
        this.init();
    }

    init() {
        // Récupérer le shop depuis les paramètres URL
        const urlParams = new URLSearchParams(window.location.search);
        this.currentShop = urlParams.get('shop');
        
        if (!this.currentShop) {
            this.addConsoleMessage('error', '⚠️', 'Erreur: Shop non spécifié dans l\'URL');
            return;
        }

        this.loadOrdersModule();
        this.startStatusCheck();
        this.setupEventListeners();
        this.startWebSocketConnection(); // Simuler une connexion temps réel
    }

    // Charger le statut des commandes
    async loadOrdersModule() {
        try {
            this.addConsoleMessage('info', '🔍', 'Vérification du statut de connexion Kimland...');
            
            const response = await fetch(`/api/orders/sync/status`);
            const data = await response.json();
            
            if (data.success) {
                this.updateStats(data.status);
                this.updateUI();
                this.addConsoleMessage('success', '✓', 'Connexion établie avec le système Kimland');
            } else {
                this.addConsoleMessage('error', '❌', 'Erreur chargement statut: ' + data.error);
            }
        } catch (error) {
            this.addConsoleMessage('error', '❌', 'Erreur connexion API: ' + error.message);
        }
    }

    // Mettre à jour les statistiques
    updateStats(status) {
        this.isConnected = status.kimlandConnected;
        this.stats = {
            received: status.totalSynced || 0,
            pending: 0, // À implémenter
            success: status.totalSynced || 0,
            errors: status.errors || 0
        };
    }

    // Mettre à jour l'interface utilisateur
    updateUI() {
        this.updateStatsCards();
        this.updateConnectionStatus();
    }

    // Mettre à jour les cartes de statistiques
    updateStatsCards() {
        const receivedEl = document.getElementById('stat-synced');
        const pendingEl = document.getElementById('stat-pending');
        const successEl = document.getElementById('stat-success');
        const errorsEl = document.getElementById('stat-errors');
        
        if (receivedEl) receivedEl.textContent = this.stats.received;
        if (pendingEl) pendingEl.textContent = this.stats.pending;
        if (successEl) successEl.textContent = this.stats.success;
        if (errorsEl) errorsEl.textContent = this.stats.errors;
    }

    // Ajouter un message dans la console
    addConsoleMessage(type, icon, message, details = null) {
        const consoleContent = document.getElementById('console-content');
        if (!consoleContent) return;

        const timestamp = new Date().toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const consoleLine = document.createElement('div');
        consoleLine.className = `console-line ${type}`;
        consoleLine.innerHTML = `
            <span class="timestamp">${icon}</span>
            <span class="message">${message}</span>
        `;

        if (details) {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'details';
            detailsDiv.textContent = details;
            consoleLine.appendChild(detailsDiv);
        }

        consoleContent.insertBefore(consoleLine, consoleContent.firstChild);

        // Limiter à 50 messages
        while (consoleContent.children.length > 50) {
            consoleContent.removeChild(consoleContent.lastChild);
        }
    }

    // Simuler une connexion temps réel pour les tests
    startWebSocketConnection() {
        this.addConsoleMessage('info', '🔗', 'Connexion WebSocket établie (simulation)');
        
        // Simuler des événements aléatoires pour démo
        setInterval(() => {
            if (Math.random() < 0.1) { // 10% de chance
                this.simulateIncomingOrder();
            }
        }, 10000); // Toutes les 10 secondes
    }

    // Simuler une commande entrante
    simulateIncomingOrder() {
        const orderNumber = Math.floor(Math.random() * 9000) + 1000;
        const customerEmail = `client${Math.floor(Math.random() * 100)}@example.com`;
        
        this.addConsoleMessage('webhook', '📦', `Nouvelle commande reçue: #${orderNumber}`, customerEmail);
        
        setTimeout(() => {
            this.addConsoleMessage('processing', '⚙️', `Traitement commande #${orderNumber}`, 'Création client sur Kimland...');
            this.stats.pending++;
            this.updateStatsCards();
        }, 1000);
        
        setTimeout(() => {
            const success = Math.random() > 0.2; // 80% de succès
            if (success) {
                this.addConsoleMessage('success', '✓', `Commande #${orderNumber} synchronisée avec succès !`);
                this.stats.success++;
                this.stats.received++;
            } else {
                this.addConsoleMessage('error', '❌', `Échec synchronisation commande #${orderNumber}`, 'Erreur de connexion Kimland');
                this.stats.errors++;
            }
            this.stats.pending = Math.max(0, this.stats.pending - 1);
            this.updateStatsCards();
        }, 3000);
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

    // Configurer les événements
    setupEventListeners() {
        // Bouton test webhook
        const testWebhookBtn = document.getElementById('test-webhook-btn');
        if (testWebhookBtn) {
            testWebhookBtn.addEventListener('click', () => this.testWebhook());
        }

        // Bouton vider console
        const clearConsoleBtn = document.getElementById('clear-console-btn');
        if (clearConsoleBtn) {
            clearConsoleBtn.addEventListener('click', () => this.clearConsole());
        }

        // Bouton actualiser statut
        const refreshBtn = document.getElementById('refresh-status-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.loadOrdersModule());
        }

        // Interaction avec les dots de la console
        const controlDots = document.querySelectorAll('.control-dot');
        controlDots.forEach(dot => {
            dot.addEventListener('click', (e) => {
                if (e.target.classList.contains('red')) {
                    this.addConsoleMessage('error', '❌', 'Connexion fermée par l\'utilisateur');
                } else if (e.target.classList.contains('yellow')) {
                    this.addConsoleMessage('warning', '⚠️', 'Mode maintenance activé');
                } else if (e.target.classList.contains('green')) {
                    this.addConsoleMessage('success', '✅', 'Système opérationnel');
                }
            });
        });
    }

    // Vérifier le statut périodiquement
    startStatusCheck() {
        setInterval(() => {
            this.loadOrdersModule();
        }, 60000); // Toutes les 60 secondes
    }

    // Méthodes héritées simplifiées pour compatibilité
    updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;

        statusEl.className = `orders-status ${this.isConnected ? 'connected' : 'disconnected'}`;
        statusEl.innerHTML = this.isConnected 
            ? '🟢 Connecté à Kimland - Synchronisation automatique active'
            : '🔴 Déconnecté de Kimland - Vérifiez la configuration';
    }

    // Gestion des webhooks entrants (pour intégration future)
    handleIncomingWebhook(orderData) {
        const orderNumber = orderData.order_number || orderData.name || 'Inconnu';
        const customerEmail = orderData.customer?.email || 'Email non spécifié';
        const totalPrice = orderData.total_price || '0.00';
        
        this.addConsoleMessage('webhook', '📦', `Commande reçue: #${orderNumber}`, `${customerEmail} - ${totalPrice} DA`);
        
        this.stats.received++;
        this.stats.pending++;
        this.updateStatsCards();
        
        // Simuler le traitement
        setTimeout(() => {
            const success = Math.random() > 0.15; // 85% de succès
            if (success) {
                this.addConsoleMessage('success', '✓', `Commande #${orderNumber} synchronisée !`, 'Client créé et commande ajoutée sur Kimland');
                this.stats.success++;
            } else {
                this.addConsoleMessage('error', '❌', `Échec commande #${orderNumber}`, 'Erreur lors de la création du client');
                this.stats.errors++;
            }
            this.stats.pending--;
            this.updateStatsCards();
        }, Math.random() * 3000 + 2000); // Entre 2 et 5 secondes
    }
}

// Initialiser le module quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier si on est sur la page avec le module de commandes
    if (document.getElementById('orders-module')) {
        window.ordersModule = new OrdersModule();
    }
});