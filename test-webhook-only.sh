#!/bin/bash

echo "🔥 Test Webhook Direct"
echo "====================="

echo "📡 Envoi d'une commande de test..."

curl -X POST "https://kimiscrap.ddnsgeek.com/api/orders/webhook/orders/create" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "TEST_BASH_'$(date +%s)'",
    "order_number": '$(shuf -i 1000-9999 -n 1)',
    "customer": {
      "email": "test@bash-debug.com",
      "first_name": "Debug",
      "last_name": "Bash"
    },
    "shipping_address": {
      "first_name": "Debug",
      "last_name": "Bash",
      "address1": "123 Rue du Debug",
      "city": "Alger"
    },
    "line_items": [{
      "id": 1,
      "name": "Produit Test Bash Debug",
      "quantity": 1,
      "price": "149.99",
      "sku": "TEST-BASH-DEBUG"
    }],
    "total_price": "149.99",
    "financial_status": "paid",
    "created_at": "'$(date -Iseconds)'"
  }'

echo
echo
echo "✅ Webhook envoyé !"
echo "📋 Maintenant :"
echo "  1. Vérifiez les logs serveur pour voir si le webhook est reçu"
echo "  2. Vérifiez si le SSE diffuse le message"
echo "  3. Ouvrez le dashboard pour voir si la commande apparaît"
echo "  4. URL Dashboard: https://kimiscrap.ddnsgeek.com/?shop=test.myshopify.com"
