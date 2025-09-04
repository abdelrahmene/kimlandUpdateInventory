/* Kimland Sync Pro - Main Script */

// Global Variables
let currentShop = null;
let syncResults = [];
let syncAbortController = null;
let isSyncCancelled = false;

// Initialize
const urlParams = new URLSearchParams(window.location.search);
currentShop = urlParams.get('shop');

if (!currentShop) {
    document.getElementById('loading').innerHTML = '<div class="text-6xl mb-4">❌</div><p class="text-white text-xl">Erreur: Aucune boutique spécifiée</p>';
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
            document.getElementById('loading').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
        } else {
            throw new Error(data.message || 'Erreur inconnue');
        }
    } catch (error) {
        document.getElementById('loading').innerHTML = '<div class="text-6xl mb-4">❌</div><p class="text-white text-xl">Erreur de chargement</p>';
    }
}

// Search Functions
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
                            <button 
                                onclick="updateProductSKU(${product.id}, '${product.title.replace(/'/g, "\\'")}')"
                                class="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105">
                                🔧 MAJ SKU
                            </button>
                        ` : `
                            <button 
                                onclick="updateProductSKU(${product.id}, '${product.title.replace(/'/g, "\\'")}')"
                                class="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold transition-all duration-200 transform hover:scale-105">
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

// Main Sync Functions
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

// Event Listeners
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

window.onclick = function(event) {
    const modal = document.getElementById('sync-modal');
    if (event.target === modal) {
        closeSyncModal();
    }
}