/* Kimland Sync Pro - Script Optimisé avec SSE Temps Réel */

// Variables globales
let currentShop = null;
let syncResults = [];
let isSyncCancelled = false;
let syncEventSource = null;

// Initialisation
const urlParams = new URLSearchParams(window.location.search);
currentShop = urlParams.get('shop');

if (!currentShop) {
    document.getElementById('loading').innerHTML = '<div class="text-6xl mb-4">❌</div><p class="text-white text-xl">Erreur: Aucune boutique spécifiée</p>';
} else {
    loadDashboard();
}

// Chargement du dashboard
async function loadDashboard() {
    try {
        const response = await fetch(`/api/products?shop=${encodeURIComponent(currentShop)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            if (errorData.error === 'AUTH_REQUIRED' && errorData.install_url) {
                window.location.href = `/auth/install?shop=${encodeURIComponent(currentShop)}`;
                return;
            }
            throw new Error('Erreur de connexion');
        }

        const data = await response.json();
        if (data.success) {
            document.getElementById('loading').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
        } else {
            throw new Error(data.message || 'Erreur inconnue');
        }
    } catch (error) {
        document.getElementById('loading').innerHTML = '<div class="text-6xl mb-4">❌</div><p class="text-white text-xl">Erreur de chargement</p>';
    }
}

// 🚀 NOUVELLE FONCTION DE SYNCHRONISATION OPTIMISÉE AVEC SSE
async function syncAllInventory() {
    if (!confirm('⚡ Synchroniser l\'inventaire de TOUS les produits ?\n\nCeci va mettre à jour tous les stocks depuis Kimland.')) {
        return;
    }

    isSyncCancelled = false;
    showSyncModal();
    updateSyncStatus('🚀 Démarrage de la synchronisation...');
    
    try {
        // 🎯 Démarrer la synchronisation avec la nouvelle route SSE
        const response = await fetch(`/api/sync/inventory/realtime?shop=${encodeURIComponent(currentShop)}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error('Erreur de démarrage de synchronisation');
        }
        
        const result = await response.json();
        if (!result.success) {
            throw new Error(result.error || 'Erreur de démarrage');
        }
        
        updateSyncStatus('📈 Synchronisation en cours... Écoute des mises à jour en temps réel');
        
        // 🌐 Configurer l'écoute SSE pour les mises à jour temps réel
        setupSyncSSEListener();
        
    } catch (error) {
        updateSyncStatus('❌ Erreur: ' + error.message);
        console.error('❌ Erreur sync:', error);
    }
}

// 🔊 CONFIGURATION DE L'ÉCOUTE SSE POUR LA SYNCHRONISATION
function setupSyncSSEListener() {
    if (syncEventSource) {
        syncEventSource.close();
    }
    
    syncEventSource = new EventSource('/api/logs/stream');
    let syncStarted = false;
    
    syncEventSource.onopen = () => {
        console.log('✅ Connexion SSE établie pour sync');
        updateSyncStatus('🔗 Connecté au flux temps réel');
    };
    
    syncEventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            // 🔎 Filtrer seulement les événements de sync pour notre shop
            if (data.shop && data.shop !== currentShop) {
                return; // Ignorer les événements d'autres shops
            }
            
            // 📈 Traitement des différents types d'événements
            switch (data.type) {
                case 'sync_started':
                    syncStarted = true;
                    updateSyncStatus(data.message);
                    setupProgressBar(data.total);
                    break;
                    
                case 'sync_progress':
                    if (syncStarted && data.current && data.total) {
                        updateSyncProgress({
                            type: 'progress',
                            current: data.current,
                            total: data.total,
                            percentage: data.percentage,
                            message: data.message,
                            sku: data.sku,
                            productName: data.productName
                        });
                    }
                    break;
                    
                case 'sync_item_result':
                    if (syncStarted) {
                        updateSyncProgress({
                            type: 'result',
                            success: data.success,
                            sku: data.sku,
                            productName: data.productName,
                            message: data.message,
                            current: data.current,
                            total: data.total,
                            percentage: data.percentage,
                            kimlandStock: data.kimlandStock
                        });
                    }
                    break;
                    
                case 'sync_complete':
                    if (syncStarted) {
                        updateSyncProgress({
                            type: 'complete',
                            message: data.message,
                            successful: data.successful,
                            failed: data.failed,
                            total: data.total,
                            duration: data.duration,
                            successRate: data.successRate
                        });
                        cleanupSSE();
                        syncStarted = false;
                    }
                    break;
                    
                case 'sync_error':
                    if (syncStarted) {
                        updateSyncStatus(`💥 ${data.message}`);
                        cleanupSSE();
                        syncStarted = false;
                    }
                    break;
            }
            
        } catch (error) {
            console.error('❌ Erreur parsing SSE:', error, 'Raw data:', event.data);
        }
    };
    
    syncEventSource.onerror = (error) => {
        console.error('❌ Erreur SSE:', error);
        if (syncStarted) {
            updateSyncStatus('⚠️ Connexion interrompue - vérifiez les résultats manuellement');
        }
        cleanupSSE();
    };
    
    // 🗑️ Auto-nettoyage après 10 minutes (timeout de sécurité)
    setTimeout(() => {
        if (syncEventSource && syncEventSource.readyState !== EventSource.CLOSED) {
            updateSyncStatus('⏰ Timeout - synchronisation trop longue');
            cleanupSSE();
        }
    }, 600000); // 10 minutes
}

// 🧹 Nettoyage SSE
function cleanupSSE() {
    if (syncEventSource) {
        syncEventSource.close();
        syncEventSource = null;
    }
}

// 📊 CONFIGURATION DE LA BARRE DE PROGRÈS
function setupProgressBar(total) {
    // Réinitialiser les résultats
    syncResults = [];
    
    // Afficher le total
    const statusEl = document.getElementById('sync-status');
    if (statusEl) {
        statusEl.innerHTML = `
            <div class="text-xl font-bold text-white mb-4">🚀 Synchronisation démarrée</div>
            <div class="text-white/80">Total: ${total} produits à traiter</div>
        `;
    }
    
    // Afficher la barre de progrès
    const progressContainer = document.getElementById('sync-progress');
    if (progressContainer) {
        progressContainer.innerHTML = `
            <div class="w-full bg-gray-700 rounded-full h-4 mb-4">
                <div id="progress-bar" class="bg-gradient-to-r from-blue-500 to-green-500 h-4 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
            <div class="text-center text-white/80">
                <span id="progress-text">0%</span> - 
                <span id="progress-details">En préparation...</span>
            </div>
        `;
    }
    
    // Réinitialiser la liste des résultats
    const resultsList = document.getElementById('sync-results-list');
    if (resultsList) {
        resultsList.innerHTML = '<div class="text-white/60 text-center py-4">En attente des résultats...</div>';
    }
}

// 📈 MISE À JOUR DU PROGRÈS EN TEMPS RÉEL
function updateSyncProgress(data) {
    switch (data.type) {
        case 'progress':
            // Mettre à jour la barre de progrès
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');
            const progressDetails = document.getElementById('progress-details');
            
            if (progressBar && data.percentage) {
                progressBar.style.width = `${data.percentage}%`;
            }
            
            if (progressText && data.percentage) {
                progressText.textContent = `${data.percentage}%`;
            }
            
            if (progressDetails) {
                if (data.sku) {
                    progressDetails.textContent = `${data.current}/${data.total} - ${data.sku}`;
                } else {
                    progressDetails.textContent = data.message || 'En cours...';
                }
            }
            break;
            
        case 'result':
            // Ajouter le résultat à la liste
            addSyncResult(data);
            
            // Mettre à jour la barre de progrès aussi
            const pBar = document.getElementById('progress-bar');
            const pText = document.getElementById('progress-text');
            const pDetails = document.getElementById('progress-details');
            
            if (pBar && data.percentage) {
                pBar.style.width = `${data.percentage}%`;
            }
            
            if (pText && data.percentage) {
                pText.textContent = `${data.percentage}%`;
            }
            
            if (pDetails && data.current && data.total) {
                pDetails.textContent = `${data.current}/${data.total} produits traités`;
            }
            break;
            
        case 'complete':
            // Finaliser la synchronisation
            completeSyncProgress(data);
            break;
    }
}

// ➕ AJOUTER UN RÉSULTAT À LA LISTE
function addSyncResult(data) {
    const resultsList = document.getElementById('sync-results-list');
    if (!resultsList) return;
    
    // Supprimer le message d'attente
    if (resultsList.innerHTML.includes('En attente des résultats')) {
        resultsList.innerHTML = '';
    }
    
    const icon = data.success ? '✓' : '×';
    const colorClass = data.success ? 'text-green-400' : 'text-red-400';
    const bgClass = data.success ? 'bg-green-500/10' : 'bg-red-500/10';
    
    let stockInfo = '';
    if (data.success && data.kimlandStock !== undefined) {
        stockInfo = ` - Stock: ${data.kimlandStock}`;
    }
    
    const resultHtml = `
        <div class="flex items-center p-3 ${bgClass} rounded-lg mb-2">
            <span class="${colorClass} text-lg font-bold mr-3">${icon}</span>
            <div class="flex-1">
                <div class="font-semibold text-white">${data.sku || 'SKU manquant'}</div>
                <div class="text-sm text-white/70">${data.productName || 'Nom indisponible'}${stockInfo}</div>
            </div>
            <div class="text-xs text-white/50">
                ${new Date().toLocaleTimeString()}
            </div>
        </div>
    `;
    
    // Ajouter en haut de la liste (plus récents en premier)
    resultsList.insertAdjacentHTML('afterbegin', resultHtml);
    
    // Limiter à 50 résultats max
    const results = resultsList.children;
    if (results.length > 50) {
        resultsList.removeChild(results[results.length - 1]);
    }
    
    // Faire défiler vers le haut pour voir le nouveau résultat
    resultsList.scrollTop = 0;
}

// 🏁 FINALISER LA SYNCHRONISATION
function completeSyncProgress(data) {
    // Mettre à jour le statut final
    const statusEl = document.getElementById('sync-status');
    if (statusEl) {
        const successRate = data.successRate || 0;
        const statusIcon = successRate === 100 ? '🎉' : successRate >= 80 ? '✅' : '⚠️';
        
        statusEl.innerHTML = `
            <div class="text-xl font-bold text-white mb-4">${statusIcon} ${data.message}</div>
            <div class="grid grid-cols-3 gap-4 text-center">
                <div class="bg-green-500/20 p-3 rounded-lg">
                    <div class="text-2xl font-bold text-green-400">${data.successful}</div>
                    <div class="text-sm text-white/70">Succès</div>
                </div>
                <div class="bg-red-500/20 p-3 rounded-lg">
                    <div class="text-2xl font-bold text-red-400">${data.failed}</div>
                    <div class="text-sm text-white/70">Échecs</div>
                </div>
                <div class="bg-blue-500/20 p-3 rounded-lg">
                    <div class="text-2xl font-bold text-blue-400">${successRate}%</div>
                    <div class="text-sm text-white/70">Taux réussite</div>
                </div>
            </div>
        `;
    }
    
    // Finaliser la barre de progrès
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressDetails = document.getElementById('progress-details');
    
    if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.classList.add('bg-green-500');
    }
    
    if (progressText) {
        progressText.textContent = '100%';
    }
    
    if (progressDetails) {
        progressDetails.textContent = `Terminé en ${Math.round(data.duration / 1000)}s`;
    }
    
    // Afficher le bouton de fermeture
    const modalFooter = document.querySelector('#sync-modal .space-x-4');
    if (modalFooter) {
        modalFooter.innerHTML = `
            <button onclick="closeSyncModal()" 
                    class="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold transition-all duration-200">
                🎯 Fermer
            </button>
        `;
    }
}

// 📊 MISE À JOUR DU STATUT
function updateSyncStatus(message) {
    const statusEl = document.getElementById('sync-status');
    if (statusEl) {
        statusEl.innerHTML = `<div class="text-lg text-white">${message}</div>`;
    }
}

// 🎭 FONCTIONS D'AFFICHAGE DU MODAL
function showSyncModal() {
    const modal = document.getElementById('sync-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}

function closeSyncModal() {
    const modal = document.getElementById('sync-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
    
    // Nettoyer la connexion SSE
    cleanupSSE();
}

// 🔄 Fonctions de recherche (conservées de l'original)
async function searchProducts() {
    const searchTerm = document.getElementById('product-search-input').value.trim();
    
    if (!searchTerm || searchTerm.length < 2) {
        alert('🔍 Veuillez saisir au moins 2 caractères pour la recherche');
        return;
    }
    
    showSearchLoading();
    
    try {
        const searchResponse = await fetch(
            `/api/products/search?shop=${encodeURIComponent(currentShop)}&q=${encodeURIComponent(searchTerm)}`,
            { method: 'GET' }
        );
        
        if (!searchResponse.ok) {
            throw new Error(`Erreur de recherche: ${searchResponse.status}`);
        }
        
        const searchData = await searchResponse.json();
        
        if (searchData.success && searchData.products) {
            displaySearchResults(searchData.products, searchTerm);
        } else {
            throw new Error(searchData.error || 'Aucun résultat trouvé');
        }
        
    } catch (error) {
        console.error('❌ Erreur recherche:', error);
        hideSearchLoading();
        alert('❌ Erreur lors de la recherche: ' + error.message);
    }
}

function displaySearchResults(products, searchTerm) {
    hideSearchLoading();
    
    const resultsContainer = document.getElementById('search-results');
    const resultsList = document.getElementById('search-results-list');
    const resultsCount = document.getElementById('results-count');
    
    resultsCount.textContent = `${products.length} produit(s)`;
    
    if (products.length === 0) {
        resultsList.innerHTML = `
            <div class="p-8 text-center">
                <div class="text-4xl mb-4">🔍</div>
                <div class="text-white text-lg font-semibold mb-2">Aucun produit trouvé</div>
                <div class="text-white/70">pour "${searchTerm}"</div>
            </div>
        `;
    } else {
        const limitedProducts = products.slice(0, 10);
        
        resultsList.innerHTML = limitedProducts.map((product, index) => {
            const totalStock = product.variants?.reduce((total, v) => total + (v.inventory_quantity || 0), 0) || 0;
            const hasSku = product.variants?.[0]?.sku;
            const stockColor = totalStock > 0 ? 'text-green-400' : 'text-red-400';
            const stockIcon = totalStock > 0 ? '📦' : '📭';
            
            return `
            <div class="p-6 hover:bg-white/10 transition-all duration-200 group">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <h4 class="font-bold text-lg text-white mb-2 group-hover:text-blue-200">${product.title}</h4>
                        <div class="flex items-center space-x-4 text-sm">
                            <span class="text-white/70">🆔 ${product.id}</span>
                            ${hasSku ? `
                                <span class="bg-green-500/20 text-green-300 px-2 py-1 rounded-full">
                                    🏷️ ${product.variants[0].sku}
                                </span>
                            ` : `
                                <span class="bg-red-500/20 text-red-300 px-2 py-1 rounded-full">
                                    ⚠️ Pas de SKU
                                </span>
                            `}
                            <span class="${stockColor}">
                                ${stockIcon} Stock: ${totalStock}
                            </span>
                        </div>
                    </div>
                    
                    <div class="flex flex-col space-y-2 ml-4">
                        ${hasSku ? `
                            <button 
                                onclick="syncProductFromSearch(${product.id}, '${product.title.replace(/'/g, "\\'")}')"
                                class="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105">
                                🔄 Sync
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `}).join('');
    }
    
    resultsContainer.classList.remove('hidden');
}

function clearSearch() {
    document.getElementById('product-search-input').value = '';
    document.getElementById('search-results').classList.add('hidden');
}

function showSearchLoading() {
    document.getElementById('search-loading').classList.remove('hidden');
    document.getElementById('search-results').classList.add('hidden');
}

function hideSearchLoading() {
    document.getElementById('search-loading').classList.add('hidden');
}

// 🚀 Synchronisation d'un produit individuel
async function syncProductFromSearch(productId, productName) {
    try {
        const response = await fetch(`/api/sync/product/${productId}?shop=${encodeURIComponent(currentShop)}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`✅ ${productName} synchronisé avec succès !`);
            // Optionnel: rafraîchir les résultats de recherche
        } else {
            alert(`❌ Erreur: ${result.message || 'Synchronisation échouée'}`);
        }
    } catch (error) {
        alert('❌ Erreur de connexion');
    }
}

// 🔧 Mise à jour SKU
async function updateAllSKU() {
    if (!confirm('🔥 Mettre à jour le SKU de TOUS les produits ?\n\nCeci va rechercher et appliquer toutes les références Kimland correspondantes.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/products/update-all-sku?shop=${encodeURIComponent(currentShop)}`, {
            method: 'POST'
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert(`✅ Mise à jour terminée!\n- ${result.updated} SKU mis à jour\n- ${result.skipped} produits ignorés`);
        } else {
            alert(`❌ Erreur: ${result.error}`);
        }
    } catch (error) {
        alert('❌ Erreur de connexion');
    }
}

// 🎧 Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('product-search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchProducts();
            }
        });
    }
});

// 🎯 Nettoyage lors de la fermeture de la page
window.addEventListener('beforeunload', () => {
    cleanupSSE();
});

// 🖱️ Fermeture du modal par clic extérieur
window.onclick = function(event) {
    const modal = document.getElementById('sync-modal');
    if (event.target === modal) {
        closeSyncModal();
    }
}
