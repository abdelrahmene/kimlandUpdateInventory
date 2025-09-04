# 🧪 Guide de Test Rapide - Debug Commandes

## 🚀 Étapes pour tester

### 1️⃣ Compilation et Build
```cmd
compile-test.bat
```

### 2️⃣ Démarrage du serveur
```cmd
debug-start.bat
```

### 3️⃣ Test du webhook
**Option A - PowerShell (Windows):**
```powershell
test-webhook.ps1
```

**Option B - Bash (Linux/WSL):**
```bash
chmod +x test-webhook-only.sh
./test-webhook-only.sh
```

**Option C - Manuel avec curl:**
```bash
curl -X POST "https://kimiscrap.ddnsgeek.com/api/orders/webhook/orders/create" \
  -H "Content-Type: application/json" \
  -d '{"id":"TEST_MANUAL","order_number":1234,"customer":{"email":"test@manual.com","first_name":"Test","last_name":"Manual"},"line_items":[{"name":"Produit Test","quantity":1,"price":"99.99"}],"total_price":"99.99","financial_status":"paid","created_at":"2024-12-19T10:00:00Z"}'
```

## 🔍 Points de vérification

### ✅ Côté Serveur (logs console)
Recherchez ces messages dans les logs serveur :
- `🔗 [DEBUG SSE] Nouvelle connexion SSE démarrée`
- `🔍 [DEBUG WEBHOOK] Données brutes reçues`
- `📡 [DEBUG SSE] Diffusion vers X clients connectés`

### ✅ Côté Client (console navigateur F12)
Ouvrez https://kimiscrap.ddnsgeek.com/?shop=test.myshopify.com et regardez la console :
- `✅ [DEBUG] EventSource connecté avec succès`
- `📨 [DEBUG] Message EventSource reçu`
- `🛒 [DEBUG] WEBHOOK DÉTECTÉ !`
- `🔄 [DEBUG] addNewOrder APPELÉ !`

### ✅ Interface utilisateur
- La commande doit apparaître dans la section "📦 Commandes Shopify Reçues"
- Les stats doivent se mettre à jour
- Pas de message "En attente des commandes Shopify..."

## 🐛 Dépannage

### SSE se déconnecte en boucle
- Vérifiez les headers de proxy/nginx
- Regardez les logs serveur pour les erreurs SSE

### Webhook reçu mais pas affiché
- Vérifiez que le SSE est connecté
- Regardez si `broadcastToClients` est appelé
- Vérifiez la console navigateur pour les erreurs JS

### Élément orders-list introuvable
- Vérifiez que le DOM est bien chargé
- Regardez si le module OrdersModule s'initialise

## 🎯 Flux attendu

1. **Webhook reçu** → logs `[DEBUG WEBHOOK]`
2. **Message SSE diffusé** → logs `[DEBUG SSE] Diffusion`
3. **Client reçoit SSE** → logs navigateur `Message EventSource reçu`
4. **Commande ajoutée** → logs navigateur `addNewOrder APPELÉ`
5. **Interface mise à jour** → commande visible dans le dashboard

---

**Note:** Une fois que ça fonctionne, vous pouvez supprimer tous les logs `[DEBUG]` pour nettoyer l'affichage.
