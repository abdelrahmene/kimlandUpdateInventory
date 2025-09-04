# Test Webhook PowerShell
Write-Host "🔥 Test Webhook Direct" -ForegroundColor Yellow
Write-Host "=====================" -ForegroundColor Yellow
Write-Host ""

$timestamp = [int][double]::Parse((Get-Date -UFormat %s))
$orderNumber = Get-Random -Minimum 1000 -Maximum 9999
$currentTime = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"

$webhookData = @{
    id = "TEST_PS_$timestamp"
    order_number = $orderNumber
    customer = @{
        email = "test@powershell-debug.com"
        first_name = "Debug"
        last_name = "PowerShell"
    }
    shipping_address = @{
        first_name = "Debug"
        last_name = "PowerShell"
        address1 = "123 Rue du Debug PS"
        city = "Alger"
    }
    line_items = @(
        @{
            id = 1
            name = "Produit Test PowerShell Debug"
            quantity = 1
            price = "199.99"
            sku = "TEST-PS-DEBUG"
        }
    )
    total_price = "199.99"
    financial_status = "paid"
    created_at = $currentTime
} | ConvertTo-Json -Depth 10

Write-Host "📡 Envoi d'une commande de test..." -ForegroundColor Cyan
Write-Host "Commande #$orderNumber" -ForegroundColor Green

try {
    $response = Invoke-RestMethod -Uri "https://kimiscrap.ddnsgeek.com/api/orders/webhook/orders/create" `
                                  -Method POST `
                                  -ContentType "application/json" `
                                  -Body $webhookData

    Write-Host ""
    Write-Host "✅ Webhook envoyé avec succès !" -ForegroundColor Green
    Write-Host "Réponse: $($response | ConvertTo-Json)" -ForegroundColor Gray
    
} catch {
    Write-Host ""
    Write-Host "❌ Erreur lors de l'envoi du webhook:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Write-Host "📋 Maintenant :" -ForegroundColor Yellow
Write-Host "  1. Vérifiez les logs serveur pour voir si le webhook est reçu" -ForegroundColor White
Write-Host "  2. Vérifiez si le SSE diffuse le message" -ForegroundColor White
Write-Host "  3. Ouvrez le dashboard pour voir si la commande apparaît" -ForegroundColor White
Write-Host "  4. URL Dashboard: https://kimiscrap.ddnsgeek.com/?shop=test.myshopify.com" -ForegroundColor Cyan

Read-Host "Appuyez sur Entrée pour continuer..."
