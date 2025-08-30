# Script PowerShell pour récupérer le stock d'un produit via l'API Shopify
# Utilisation: .\get-stock.ps1 -Shop "ma-boutique.myshopify.com" -AccessToken "shpat_..." -SKU "IH3576"

param(
    [Parameter(Mandatory=$true)]
    [string]$Shop,
    
    [Parameter(Mandatory=$true)]
    [string]$AccessToken,
    
    [Parameter(Mandatory=$false)]
    [string]$SKU = "IH3576"
)

Write-Host "🔍 Recherche du produit avec SKU: $SKU" -ForegroundColor Cyan
Write-Host "🏪 Boutique: $Shop" -ForegroundColor Cyan
Write-Host "🔑 Token: $($AccessToken.Substring(0, 20))..." -ForegroundColor Cyan

$ApiBase = "https://$Shop/admin/api/2023-10"

# Headers pour les requêtes
$Headers = @{
    "X-Shopify-Access-Token" = $AccessToken
    "Content-Type" = "application/json"
}

# Fonction pour faire une requête GET
function Invoke-ShopifyAPI {
    param([string]$Endpoint)
    
    try {
        $Response = Invoke-RestMethod -Uri "$ApiBase/$Endpoint" -Headers $Headers -Method Get
        return $Response
    }
    catch {
        Write-Error "❌ Erreur API: $($_.Exception.Message)"
        return $null
    }
}

# Test de connexion
Write-Host "`n🔗 Test de connexion..." -ForegroundColor Yellow
$ShopInfo = Invoke-ShopifyAPI "shop.json"

if ($ShopInfo -and $ShopInfo.shop) {
    Write-Host "✅ Connexion réussie à: $($ShopInfo.shop.name)" -ForegroundColor Green
}
else {
    Write-Host "❌ Erreur de connexion" -ForegroundColor Red
    exit 1
}

# Rechercher le produit par SKU
Write-Host "`n🔍 Recherche du produit..." -ForegroundColor Yellow

$Page = 1
$Limit = 250
$Found = $false

while ($true) {
    Write-Host "📄 Recherche page $Page..." -ForegroundColor Gray
    
    $Products = Invoke-ShopifyAPI "products.json?limit=$Limit&page=$Page"
    
    if (-not $Products -or -not $Products.products) {
        break
    }
    
    $Count = $Products.products.Count
    
    if ($Count -eq 0) {
        break
    }
    
    # Chercher le SKU dans cette page
    foreach ($Product in $Products.products) {
        foreach ($Variant in $Product.variants) {
            if ($Variant.sku -eq $SKU) {
                Write-Host "`n✅ Produit trouvé!" -ForegroundColor Green
                Write-Host ""
                Write-Host "📦 Produit: $($Product.title)" -ForegroundColor White
                Write-Host "🆔 Product ID: $($Product.id)" -ForegroundColor White
                Write-Host "📊 Status: $($Product.status)" -ForegroundColor White
                Write-Host "🔖 Variant ID: $($Variant.id)" -ForegroundColor White
                Write-Host "📝 Variant: $($Variant.title)" -ForegroundColor White
                Write-Host "📦 Stock: $($Variant.inventory_quantity)" -ForegroundColor White
                Write-Host "💰 Prix: $($Variant.price) €" -ForegroundColor White
                
                if ($Variant.option1) { Write-Host "📏 Option 1: $($Variant.option1)" -ForegroundColor White }
                if ($Variant.option2) { Write-Host "📏 Option 2: $($Variant.option2)" -ForegroundColor White }
                if ($Variant.option3) { Write-Host "📏 Option 3: $($Variant.option3)" -ForegroundColor White }
                
                $Found = $true
                break
            }
        }
        if ($Found) { break }
    }
    
    if ($Found) { break }
    
    # Si moins de produits que la limite, on a fini
    if ($Count -lt $Limit) {
        break
    }
    
    $Page++
}

if (-not $Found) {
    Write-Host "❌ Produit avec SKU '$SKU' non trouvé." -ForegroundColor Red
    
    $ShowAll = Read-Host "`n💡 Voulez-vous voir tous les SKUs disponibles? (y/N)"
    
    if ($ShowAll -eq "y" -or $ShowAll -eq "Y") {
        Write-Host "`n📋 Liste de tous les SKUs disponibles:" -ForegroundColor Yellow
        
        $Page = 1
        while ($true) {
            $Products = Invoke-ShopifyAPI "products.json?limit=$Limit&page=$Page"
            
            if (-not $Products -or -not $Products.products) {
                break
            }
            
            $Count = $Products.products.Count
            if ($Count -eq 0) {
                break
            }
            
            foreach ($Product in $Products.products) {
                foreach ($Variant in $Product.variants) {
                    if ($Variant.sku) {
                        $Stock = if ($Variant.inventory_quantity) { $Variant.inventory_quantity } else { 0 }
                        Write-Host "   $($Variant.sku) | $($Product.title) - $($Variant.title) | Stock: $Stock" -ForegroundColor Gray
                    }
                }
            }
            
            if ($Count -lt $Limit) {
                break
            }
            
            $Page++
        }
    }
}

Write-Host "`n🌐 Informations pour requêtes API:" -ForegroundColor Cyan
Write-Host "Shop: $Shop" -ForegroundColor White
Write-Host "Access Token: $AccessToken" -ForegroundColor White
Write-Host "API Base URL: $ApiBase" -ForegroundColor White
