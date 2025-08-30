#!/bin/bash

# Script pour récupérer le stock d'un produit via l'API Shopify
# Utilisation: ./get-stock.sh [SHOP] [ACCESS_TOKEN] [SKU]

SHOP="$1"
ACCESS_TOKEN="$2"
SKU="${3:-IH3576}"

if [ -z "$SHOP" ] || [ -z "$ACCESS_TOKEN" ]; then
    echo "Usage: $0 <shop.myshopify.com> <access_token> [sku]"
    echo "Exemple: $0 ma-boutique.myshopify.com shpat_abc123... IH3576"
    exit 1
fi

echo "🔍 Recherche du produit avec SKU: $SKU"
echo "🏪 Boutique: $SHOP"
echo "🔑 Token: ${ACCESS_TOKEN:0:20}..."

# URL de base de l'API
API_BASE="https://$SHOP/admin/api/2023-10"

# Fonction pour faire une requête GET
api_get() {
    curl -s -H "X-Shopify-Access-Token: $ACCESS_TOKEN" \
         -H "Content-Type: application/json" \
         "$1"
}

# Fonction pour rechercher un produit par SKU
search_by_sku() {
    local sku="$1"
    local page=1
    local limit=250
    
    while true; do
        echo "📄 Recherche page $page..."
        
        local response=$(api_get "$API_BASE/products.json?limit=$limit&page=$page")
        
        # Vérifier si la réponse est valide
        if ! echo "$response" | jq . >/dev/null 2>&1; then
            echo "❌ Erreur API: $response"
            return 1
        fi
        
        # Compter les produits sur cette page
        local count=$(echo "$response" | jq '.products | length')
        
        if [ "$count" -eq 0 ]; then
            echo "❌ Produit avec SKU '$sku' non trouvé."
            return 1
        fi
        
        # Chercher le SKU dans cette page
        local found=$(echo "$response" | jq -r "
            .products[] | 
            select(.variants[]?.sku == \"$sku\") | 
            {
                product_id: .id,
                title: .title,
                status: .status,
                variant: (.variants[] | select(.sku == \"$sku\"))
            }
        ")
        
        if [ -n "$found" ]; then
            echo "✅ Produit trouvé!"
            echo
            
            # Parser les informations
            local product_title=$(echo "$found" | jq -r '.title')
            local product_id=$(echo "$found" | jq -r '.product_id')
            local product_status=$(echo "$found" | jq -r '.status')
            local variant_id=$(echo "$found" | jq -r '.variant.id')
            local variant_title=$(echo "$found" | jq -r '.variant.title')
            local inventory_quantity=$(echo "$found" | jq -r '.variant.inventory_quantity')
            local price=$(echo "$found" | jq -r '.variant.price')
            local option1=$(echo "$found" | jq -r '.variant.option1 // "N/A"')
            local option2=$(echo "$found" | jq -r '.variant.option2 // "N/A"')
            local option3=$(echo "$found" | jq -r '.variant.option3 // "N/A"')
            
            echo "📦 Produit: $product_title"
            echo "🆔 Product ID: $product_id"
            echo "📊 Status: $product_status"
            echo "🔖 Variant ID: $variant_id"
            echo "📝 Variant: $variant_title"
            echo "📦 Stock: $inventory_quantity"
            echo "💰 Prix: $price €"
            echo "📏 Option 1: $option1"
            echo "📏 Option 2: $option2" 
            echo "📏 Option 3: $option3"
            
            return 0
        fi
        
        # Si moins de produits que la limite, on a fini
        if [ "$count" -lt "$limit" ]; then
            break
        fi
        
        ((page++))
    done
    
    echo "❌ Produit avec SKU '$sku' non trouvé."
    return 1
}

# Fonction pour lister tous les SKUs disponibles
list_all_skus() {
    echo "📋 Liste de tous les SKUs disponibles:"
    local page=1
    local limit=250
    
    while true; do
        local response=$(api_get "$API_BASE/products.json?limit=$limit&page=$page")
        
        if ! echo "$response" | jq . >/dev/null 2>&1; then
            break
        fi
        
        local count=$(echo "$response" | jq '.products | length')
        
        if [ "$count" -eq 0 ]; then
            break
        fi
        
        echo "$response" | jq -r '
            .products[] | 
            .title as $product_title |
            .variants[]? | 
            select(.sku != null and .sku != "") |
            "   \(.sku) | \($product_title) - \(.title) | Stock: \(.inventory_quantity // 0)"
        '
        
        if [ "$count" -lt "$limit" ]; then
            break
        fi
        
        ((page++))
    done
}

# Test de connexion d'abord
echo "🔗 Test de connexion..."
SHOP_INFO=$(api_get "$API_BASE/shop.json")

if echo "$SHOP_INFO" | jq -e '.shop' >/dev/null 2>&1; then
    SHOP_NAME=$(echo "$SHOP_INFO" | jq -r '.shop.name')
    echo "✅ Connexion réussie à: $SHOP_NAME"
else
    echo "❌ Erreur de connexion: $SHOP_INFO"
    exit 1
fi

echo
echo "🔍 Recherche du produit..."

# Rechercher le produit par SKU
if ! search_by_sku "$SKU"; then
    echo
    echo "💡 Voulez-vous voir tous les SKUs disponibles? (y/N)"
    read -r show_all
    if [[ "$show_all" =~ ^[Yy]$ ]]; then
        list_all_skus
    fi
fi
