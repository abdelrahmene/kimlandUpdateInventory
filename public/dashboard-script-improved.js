/* Kimland Sync Pro - Enhanced Script */

// Global Variables
let currentShop = null;
let syncResults = [];
let syncAbortController = null;
let isSyncCancelled = false;
let searchTimeout = null;

// Initialize
const urlParams = new URLSearchParams(window.location.search);
currentShop = urlParams.get('shop');

if (!currentShop) {
    document.getElementById('loading').innerHTML = '<div class="text-center"><div class="text-red-500 text-xl mb-2">×</div><p class="text-white">Erreur: Aucune boutique spécifiée</p></div>';
} else {
    loadDashboard();
}

// Dashboard Loading
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
            document.getElementById('loading').classList.add('hidden');
            document.getElementById('dashboard').classList.remove('hidden');
            document.getElementById('dashboard').classList.add('fade-in');
        } else {
            throw new Error(data.message || 'Erreur inconnue');
        }
    } catch (error) {
        document.getElementById('loading').innerHTML = '<div class="text-center"><div class="text-red-500 text-xl mb-2">×</div><p class="text-white">Erreur de chargement</p></div>';
    }
}

// Search Functions
async function searchProducts() {
    const searchTerm = document.getElementById('product-search-input').value.trim();
    
    if (!searchTerm || searchTerm.length < 2) {
        return;
    }
    
    hideTypingIndicator();
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
        showNoResults();
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
                <div class="text-gray-300">pour "${searchTerm}"</div>
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
            <div class="p-6 hover:bg-white/5 transition-all duration-200 group">
                <div class="flex items-center justify-between">
                    <div class="flex-1">
                        <h4 class="font-bold text-lg text-white mb-2 group-hover:text-blue-200">${product.title}</h4>
                        <div class="flex items-center space-x-4 text-sm">
                            <span class="text-gray-300">🆔 ${product.id}</span>
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
                                class="bg-green-500/20 hover:bg-green-500/30 text-green-300 px-4 py-2 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 border border-green-500/20">
                                🔄 Sync
                            </button>
                            <button 
                                onclick="updateProductSKU(${product.id}, '${product.title.replace(/'/g, "\\'")}')"
                                class="bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 px-4 py-2 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 border border-orange-500/20">
                                🔧 MAJ SKU
                            </button>
                        ` : `
                            <button 
                                onclick="updateProductSKU(${product.id}, '${product.title.replace(/'/g, "\\'")}')"
                                class="bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-4 py-2 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105 border border-blue-500/20">
                                🏷️ Ajouter SKU
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `}).join('');
    }
    
    resultsContainer.classList.remove('hidden');
}

function showSearchLoading() {
    document.getElementById('search-loading').classList.remove('hidden');
    document.getElementById('search-results').classList.add('hidden');
}

function hideSearchLoading() {
    document.getElementById('search-loading').classList.add('hidden');
}

function showNoResults() {
    document.getElementById('search-results-list').innerHTML = '<div class="p-8 text-center text-gray-300">Aucun produit trouvé</div>';
    document.getElementById('results-count').textContent = '0 produit(s)';
    document.getElementById('search-results').classList.remove('hidden');
}

function showTypingIndicator() {
    document.getElementById('typing-indicator').classList.add('active');
}

function hideTypingIndicator() {
    document.getElementById('typing-indicator').classList.remove('active');
}

// Progress Toast Functions
function showProgressToast(title, message) {
    document.getElementById('toast-title').textContent = title;
    document.getElementById('toast-message').textContent = message;
    document.getElementById('toast-progress-fill').style.width = '0%';
    document.getElementById('progress-toast').classList.add('show');
}

function updateProgressToast(message, progress) {
    if (message) document.getElementById('toast-message').textContent = message;
    if (progress !== undefined) document.getElementById('toast-progress-fill').style.width = progress + '%';
}

function hideProgressToast() {
    document.getElementById('progress-toast').classList.remove('show');
}

function showSuccessToast(message) {
    document.getElementById('toast-title').textContent = '✅ Succès';
    document.getElementById('toast-message').textContent = message;
    document.getElementById('toast-progress-fill').style.width = '100%';
    document.getElementById('progress-toast').classList.add('show');
    setTimeout(() => hideProgressToast(), 3000);
}

// Main Sync Functions avec Progress Toast
async function updateAllSKU() {
    if (!confirm('🔥 Mettre à jour le SKU de TOUS les produits ?\n\nCeci va rechercher et appliquer toutes les références Kimland correspondantes.')) {
        return;
    }
    
    showProgressToast('🏷️ Mise à jour SKU', 'Préparation de la mise à jour...');
    updateProgressToast('Connexion à Kimland...', 20);
    
    try {
        const response = await fetch(`/api/products/update-all-sku?shop=${encodeURIComponent(currentShop)}`, {
            method: 'POST'
        });
        
        updateProgressToast('Traitement des produits...', 70);
        const result = await response.json();
        
        updateProgressToast('Finalisation...', 90);
        
        if (result.success) {
            updateProgressToast('Terminé !', 100);
            setTimeout(() => {
                showSuccessToast(`${result.updated} SKU mis à jour, ${result.skipped} produits ignorés`);
            }, 500);
        } else {
            hideProgressToast();
            alert(`❌ Erreur: ${result.error}`);
        }
    } catch (error) {
        hideProgressToast();
        alert('❌ Erreur de connexion');
    }
}

async function syncAllInventory() {
    if (!confirm('⚡ Synchroniser l\'inventaire de TOUS les produits ?\n\nCeci va mettre à jour tous les stocks depuis Kimland.')) {
        return;
    }

    isSyncCancelled = false;
    syncAbortController = new AbortController();
    showSyncModal();
    
    try {
        const response = await fetch(`/api/sync/inventory/all?shop=${encodeURIComponent(currentShop)}`, {
            method: 'POST',
            signal: syncAbortController.signal
        });
        
        if (!response.ok) {
            throw new Error('Erreur de synchronisation');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let buffer = '';
        while (true) {
            if (isSyncCancelled) {
                reader.cancel();
                break;
            }
            
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        updateSyncProgress(data);
                        
                        if (data.type === 'cancelled') {
                            isSyncCancelled = true;
                            break;
                        }
                    } catch (e) {
                        console.log('Non-JSON line:', line);
                    }
                }
            }
            
            if (isSyncCancelled) break;
        }

        if (buffer.trim() && !isSyncCancelled) {
            try {
                const data = JSON.parse(buffer);
                updateSyncProgress(data);
            } catch (e) {
                console.log('Non-JSON final line:', buffer);
            }
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            updateSyncStatus('🚫 Synchronisation arrêtée');
        } else {
            updateSyncStatus('❌ Erreur: ' + error.message);
        }
    } finally {
        syncAbortController = null;
        hideCancelButton();
    }
}

// Individual product actions avec Progress Toast
async function syncProductFromSearch(productId, productTitle) {
    showProgressToast('🔄 Synchronisation', `Synchronisation de "${productTitle.substring(0, 30)}..."`);
    updateProgressToast('Connexion à Kimland...', 25);
    
    try {
        const response = await fetch(`/api/sync/product/${productId}?shop=${encodeURIComponent(currentShop)}`, { method: 'POST' });
        const result = await response.json();
        
        updateProgressToast('Mise à jour du stock...', 75);
        
        if (result.success) {
            updateProgressToast('Succès !', 100);
            setTimeout(() => {
                showSuccessToast('Stock synchronisé avec succès');
                // NE PAS relancer la recherche, garder les résultats actuels
            }, 500);
        } else {
            hideProgressToast();
            alert('❌ Erreur: ' + result.error);
        }
    } catch (error) {
        hideProgressToast();
        alert('❌ Erreur: ' + error.message);
    }
}

async function updateProductSKU(productId, productTitle) {
    showProgressToast('🏷️ Mise à jour SKU', `Traitement de "${productTitle.substring(0, 30)}..."`);
    updateProgressToast('Recherche de la référence...', 20);
    
    try {
        updateProgressToast('Connexion à Kimland...', 40);
        const response = await fetch(`/api/products/${productId}/update-sku?shop=${encodeURIComponent(currentShop)}`, { method: 'PUT' });
        const result = await response.json();
        
        updateProgressToast('Application du SKU...', 80);
        
        if (result.success) {
            updateProgressToast('Terminé !', 100);
            setTimeout(() => {
                showSuccessToast('SKU mis à jour: ' + result.reference);
                // NE PAS relancer la recherche, garder les résultats actuels
            }, 500);
        } else {
            hideProgressToast();
            alert('❌ Erreur: ' + result.error);
        }
    } catch (error) {
        hideProgressToast();
        alert('❌ Erreur: ' + error.message);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('product-search-input');
    const searchContainer = document.querySelector('.search-container');
    
    if (searchInput) {
        // Real-time search
        searchInput.addEventListener('input', function() {
            const value = this.value.trim();
            
            clearTimeout(searchTimeout);
            
            if (value.length >= 2) {
                showTypingIndicator();
                searchTimeout = setTimeout(() => {
                    searchProducts();
                }, 600);
            } else if (value.length === 0) {
                hideTypingIndicator();
                document.getElementById('search-results').classList.add('hidden');
            }
        });
        
        // Focus/blur effects
        searchInput.addEventListener('focus', function() {
            searchContainer.classList.add('focused');
        });
        
        searchInput.addEventListener('blur', function() {
            searchContainer.classList.remove('focused');
        });
        
        // Enter key support
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(searchTimeout);
                searchProducts();
            }
        });
    }
});

// Modal and sync functions (keeping existing ones)
function updateSyncProgress(data) {
    if (data.type === 'progress') {
        const progress = data.percentage || Math.round((data.current / data.total) * 100);
        document.getElementById('sync-progress-bar').style.width = progress + '%';
        updateSyncStatus(`${data.message} (${progress}%)`);
        showCancelButton();
    } else if (data.type === 'result') {
        const resultDiv = document.getElementById('sync-results');
        const statusColor = data.success ? 'text-green-600' : 'text-red-600';
        const statusIcon = data.success ? '✓' : '×';
        resultDiv.insertAdjacentHTML('beforeend', 
            `<div class="mb-2 text-sm"><span class="${statusColor} font-medium">${statusIcon}</span> ${data.sku} - ${data.message}</div>`
        );
        resultDiv.scrollTop = resultDiv.scrollHeight;
    } else if (data.type === 'complete') {
        updateSyncStatus(`Terminé: ${data.successful} réussies, ${data.failed} échecs`);
        hideCancelButton();
    }
}

function updateSyncStatus(text) { 
    document.getElementById('sync-status').textContent = text; 
}

function showSyncModal() { 
    document.getElementById('sync-modal').style.display = 'block'; 
    document.getElementById('sync-progress-bar').style.width = '0%'; 
    document.getElementById('sync-status').textContent = 'Initialisation...'; 
    document.getElementById('sync-results').innerHTML = ''; 
}

function closeSyncModal() { 
    document.getElementById('sync-modal').style.display = 'none'; 
}

function showCancelButton() { 
    document.getElementById('cancel-sync-btn').classList.remove('hidden'); 
}

function hideCancelButton() { 
    document.getElementById('cancel-sync-btn').classList.add('hidden'); 
}

function cancelSync() { 
    if (syncAbortController) { 
        syncAbortController.abort(); 
        isSyncCancelled = true; 
        document.getElementById('cancel-info').classList.remove('hidden');
    } 
}

// Modal click outside to close
window.onclick = function(event) {
    const modal = document.getElementById('sync-modal');
    if (event.target === modal) {
        closeSyncModal();
    }
}