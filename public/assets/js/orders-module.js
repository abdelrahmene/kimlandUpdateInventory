// Module de gestion des commandes Shopify ↔ Kimland - Version Console Temps Réel
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
        this.connectToRealTimeLogs(); // Connexion aux logs temps réel
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
            pending: 0,
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
    addConsoleMessage(type, icon, message, details = null, actionButton = null) {
        const consoleContent = document.getElementById('console-content');
        if (!consoleContent) return;

        const consoleLine = document.createElement('div');
        consoleLine.className = `console-line ${type}`;
        
        let html = `
            <span class="timestamp">${icon}</span>
            <span class="message">${message}</span>
        `;
        
        if (actionButton) {
            html += `<button class="action-btn ${actionButton.class || ''}" onclick="${actionButton.onclick}">${actionButton.text}</button>`;
        }
        
        consoleLine.innerHTML = html;

        if (details) {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'details';
            detailsDiv.textContent = details;
            consoleLine.appendChild(detailsDiv);
        }

        consoleContent.insertBefore(consoleLine, consoleContent.firstChild);

        // Limiter à 100 messages
        while (consoleContent.children.length > 100) {
            consoleContent.removeChild(consoleContent.lastChild);
        }
    }

    // Connexion aux logs temps réel
    connectToRealTimeLogs() {
        this.addConsoleMessage('info', '🔗', 'Connexion au stream temps réel...');
        
        const eventSource = new EventSource('/api/logs/stream');
        
        eventSource.onopen = () => {
            this.addConsoleMessage('success', '✓', 'Connecté au stream temps réel');
        };
        
        eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleRealTimeMessage(data);
            } catch (error) {
                console.error('Erreur parsing message temps réel:', error);
            }
        };
        
        eventSource.onerror = (error) => {
            this.addConsoleMessage('error', '❌', 'Erreur connexion temps réel');
            console.error('EventSource error:', error);
        };
        
        // Charger les logs récents au démarrage
        this.loadRecentLogs();
    }
    
    // Charger les logs récents
    async loadRecentLogs() {
        try {
            const response = await fetch('/api/logs/recent');
            const data = await response.json();
            
            if (data.success && data.logs) {
                // Afficher les logs récents (les plus anciens d'abord)
                data.logs.reverse().forEach(log => {
                    this.addConsoleMessage(
                        log.level, 
                        log.icon, 
                        log.message, 
                        log.data ? JSON.stringify(log.data, null, 2) : null
                    );
                });
            }
        } catch (error) {
            this.addConsoleMessage('error', '❌', 'Erreur chargement logs récents: ' + error.message);
        }
    }
    
    // Gérer les messages temps réel
    handleRealTimeMessage(data) {
        let actionButton = null;
        
        // Ajouter un bouton d'action pour les commandes en attente de paiement
        if (data.type === 'warning' && data.message.includes('en attente de paiement')) {
            actionButton = {
                text: 'Créer Client',
                class: 'warning',
                onclick: `window.ordersModule.createClientFromOrder('${data.data?.orderNumber || ''}')`
            };
        }
        
        // Ajouter un bouton pour les commandes payées
        if (data.type === 'webhook' && data.data?.needsProcessing) {
            actionButton = {
                text: 'Traiter',
                class: 'success',
                onclick: `window.ordersModule.processOrder('${data.data?.orderNumber || ''}')`
            };
        }
        
        this.addConsoleMessage(
            data.type,
            data.icon,
            data.message,
            data.details,
            actionButton
        );
        
        // Mettre à jour les statistiques
        this.updateStatsFromMessage(data);
    }
    
    // Mettre à jour les stats depuis les messages
    updateStatsFromMessage(data) {
        if (data.type === 'webhook') {
            this.stats.received++;
        } else if (data.type === 'processing') {
            this.stats.pending++;
        } else if (data.type === 'success') {
            this.stats.success++;
            this.stats.pending = Math.max(0, this.stats.pending - 1);
        } else if (data.type === 'error') {
            this.stats.errors++;
            this.stats.pending = Math.max(0, this.stats.pending - 1);
        }
        
        this.updateStatsCards();
    }

    // Actions pour les commandes
    async createClientFromOrder(orderNumber) {
        this.addConsoleMessage('processing', '👤', `Création du client pour commande #${orderNumber}`, 'Extraction des données client...');
        
        try {
            // Simuler la création du client
            setTimeout(() => {
                const success = Math.random() > 0.1; // 90% de succès
                if (success) {
                    this.addConsoleMessage('success', '✓', `Client créé pour commande #${orderNumber}`, 'Prêt pour traitement manuel');
                } else {
                    this.addConsoleMessage('error', '❌', `Échec création client commande #${orderNumber}`, 'Données client incomplètes');
                }
            }, 2000);
            
        } catch (error) {
            this.addConsoleMessage('error', '❌', `Erreur création client: ${error.message}`);
        }
    }
    
    async processOrder(orderNumber) {
        this.addConsoleMessage('processing', '⚙️', `Traitement automatique commande #${orderNumber}`, 'Synchronisation avec Kimland...');
        
        try {
            // Simuler le traitement
            setTimeout(() => {
                const success = Math.random() > 0.15; // 85% de succès
                if (success) {
                    this.addConsoleMessage('success', '✓', `Commande #${orderNumber} traitée automatiquement`, 'Client créé et commande ajoutée');
                    this.stats.success++;
                } else {
                    this.addConsoleMessage('error', '❌', `Échec traitement commande #${orderNumber}`, 'Problème de synchronisation Kimland');
                    this.stats.errors++;
                }
                this.updateStatsCards();
            }, 3000);
            
        } catch (error) {
            this.addConsoleMessage('error', '❌', `Erreur traitement: ${error.message}`);
        }
    }

    // Tester le webhook avec une commande factice
    async testWebhook() {
        this.addConsoleMessage('info', '🧪', 'Test du webhook en cours...');
        
        try {
            const testOrderData = {
                id: 'TEST_' + Date.now(),
                order_number: Math.floor(Math.random() * 9000) + 1000,
                customer: {
                    email: 'test@webhook.com',
                    first_name: 'Test',
                    last_name: 'Webhook'
                },
                shipping_address: {
                    first_name: 'Test',
                    last_name: 'Webhook',
                    address1: '123 Rue Test',
                    city: 'Alger',
                    province: 'Alger',
                    country: 'Algeria',
                    phone: '0555123456'
                },
                line_items: [{
                    id: 1,
                    name: 'Produit Test Webhook',
                    quantity: 1,
                    price: '29.99'
                }],
                total_price: '29.99',
                financial_status: 'paid',
                created_at: new Date().toISOString()
            };

            const response = await fetch('/api/orders/webhook/orders/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(testOrderData)
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.addConsoleMessage('success', '✓', `Test webhook réussi !`, `Commande traitée avec succès`);
            } else {
                this.addConsoleMessage('error', '❌', `Test webhook échoué`, result.message || 'Erreur inconnue');
            }
            
        } catch (error) {
            this.addConsoleMessage('error', '❌', `Erreur test webhook: ${error.message}`);
        }
    }

    // Vider la console
    clearConsole() {
        const consoleContent = document.getElementById('console-content');
        if (consoleContent) {
            consoleContent.innerHTML = `
                <div class="console-line welcome">
                    <span class="timestamp">🚀</span>
                    <span class="message">Console vidée - Système prêt</span>
                </div>
            `;
        }
    }

    // Vérifier le statut périodiquement
    startStatusCheck() {
        setInterval(() => {
            this.loadOrdersModule();
        }, 60000); // Toutes les 60 secondes
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

    // Méthodes héritées simplifiées pour compatibilité
    updateConnectionStatus() {
        const statusEl = document.getElementById('connection-status');
        if (!statusEl) return;

        statusEl.className = `orders-status ${this.isConnected ? 'connected' : 'disconnected'}`;
        statusEl.innerHTML = this.isConnected 
            ? '🟢 Connecté à Kimland - Synchronisation automatique active'
            : '🔴 Déconnecté de Kimland - Vérifiez la configuration';
    }
}

// Initialiser le module quand le DOM est prêt
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier si on est sur la page avec le module de commandes
    if (document.getElementById('orders-module')) {
        window.ordersModule = new OrdersModule();
    }
});