function dashboard() {
    return {
        loading: false,
        products: [],
        shopData: null,
        error: null,

        get activeProducts() {
            return this.products.filter(p => p.status === 'active').length;
        },

        get lowStockProducts() {
            return this.products.filter(p => 
                p.variants.some(v => v.inventory_quantity <= 5)
            ).length;
        },

        get productsWithReference() {
            return this.products.filter(p => p.reference).length;
        },

        async init() {
            await this.loadDashboard();
        },

        async loadDashboard() {
            this.loading = true;
            this.error = null;

            try {
                const shop = new URLSearchParams(window.location.search).get('shop');
                if (!shop) {
                    throw new Error('Shop parameter manquant');
                }

                const response = await fetch(`/api/dashboard?shop=${encodeURIComponent(shop)}`);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Erreur lors du chargement');
                }

                this.shopData = data.shop;
                this.products = data.products;
            } catch (error) {
                console.error('Erreur:', error);
                this.error = error.message;
            } finally {
                this.loading = false;
            }
        },

        async syncProducts() {
            this.loading = true;
            
            try {
                const shop = new URLSearchParams(window.location.search).get('shop');
                const response = await fetch(`/api/products/sync?shop=${encodeURIComponent(shop)}`, {
                    method: 'POST'
                });
                
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error);
                }

                await this.loadDashboard();
                alert('Synchronisation terminée!');
            } catch (error) {
                console.error('Erreur sync:', error);
                alert('Erreur lors de la synchronisation');
            } finally {
                this.loading = false;
            }
        }
    };
}