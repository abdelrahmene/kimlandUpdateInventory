#!/bin/bash

echo "🧪 Test rapide SSE et Webhook"
echo "================================"

echo
echo "1️⃣ Test connexion SSE..."
curl -N -H "Accept: text/event-stream" "https://kimiscrap.ddnsgeek.com/api/logs/stream" &
CURL_PID=$!

echo "Attente 5 secondes pour voir les messages SSE..."
sleep 5

echo
echo "2️⃣ Test webhook..."
curl -X POST "https://kimiscrap.ddnsgeek.com/api/orders/webhook/orders/create" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "TEST_CURL_'$(date +%s)'",
    "order_number": '$(shuf -i 1000-9999 -n 1)',
    "customer": {
      "email": "test@curl.com",
      "first_name": "Test",
      "last_name": "Curl"
    },
    "line_items": [{
      "name": "Produit Test Curl",
      "quantity": 1,
      "price": "99.99"
    }],
    "total_price": "99.99",
    "financial_status": "paid",
    "created_at": "'$(date -Iseconds)'"
  }'

echo
echo "Attente 3 secondes pour voir si le webhook génère un message SSE..."
sleep 3

echo
echo "3️⃣ Arrêt du test SSE..."
kill $CURL_PID 2>/dev/null

echo
echo "✅ Test terminé ! Vérifiez les logs serveur pour voir les messages."
