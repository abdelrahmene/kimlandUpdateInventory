# 🚀 Guide de Configuration et Test - Webhooks Shopify

## 📡 Configuration des Webhooks

### Option 1: Test local avec ngrok (Recommandé)

```bash
# 1. Installer ngrok (si pas déjà fait)
npm install -g ngrok

# 2. Dans un terminal, démarrer votre app
cd C:\KimlandApp-TypeScript
npm run build
npm start

# 3. Dans un autre terminal, exposer le port
ngrok http 5000

# Ngrok affichera quelque chose comme :
# Forwarding https://abc123.ngrok.io -> http://localhost:5000
```

### Option 2: Test avec votre domaine
Si vous avez un serveur en ligne, utilisez directement votre domaine.

## ⚙️ Configuration dans Shopify Admin

### Étape 1: Accéder aux paramètres Shopify
1. Connectez-vous à votre **Shopify Admin**
2. Allez dans **Settings** → **Notifications**
3. Descendez jusqu'à la section **Webhooks**

### Étape 2: Créer le webhook
1. Cliquez sur **Create webhook**
2. Configurez comme suit :
   - **Event**: `Order creation`
   - **Format**: `JSON`
   - **URL**: `https://abc123.ngrok.io/api/orders/webhook/orders/create`
   - **API version**: `2024-10` (ou Latest)

### Étape 3: Vérification
- Shopify va tester l'URL immédiatement
- Vous devriez voir une indication de succès ✅

## 🧪 Tests étape par étape

### 1. Test de l'application
```bash
# Démarrer l'app
npm start

# Vérifier que l'API répond
curl http://localhost:5000/health
# Réponse attendue: {"status":"ok",...}
```

### 2. Test de création de client
```bash
# Via l'interface web
# 1. Ouvrir http://localhost:5000/dashboard.html?shop=votre-boutique.myshopify.com
# 2. Cliquer sur "Tester création client" 
# 3. Vérifier les logs dans l'interface

# Ou via API directe
curl -X POST http://localhost:5000/api/orders/test/create-client \
  -H "Content-Type: application/json"
```

### 3. Test du webhook (simulation)
```bash
# Simuler une commande Shopify
curl -X POST http://localhost:5000/api/orders/webhook/orders/create \
  -H "Content-Type: application/json" \
  -d '{
    "id": 123456,
    "order_number": 1001,
    "test": false,
    "customer": {
      "email": "test@example.com",
      "first_name": "Test",
      "last_name": "Client"
    },
    "shipping_address": {
      "first_name": "Test",
      "last_name": "Client",
      "address1": "123 Rue Test",
      "city": "Alger",
      "province": "Alger",
      "country": "Algeria",
      "phone": "0555123456"
    },
    "line_items": [{
      "id": 1,
      "product_id": 123,
      "variant_id": 456,
      "sku": "TEST-001",
      "name": "Produit Test",
      "quantity": 1,
      "price": "29.99"
    }],
    "total_price": "29.99",
    "financial_status": "paid",
    "created_at": "2025-01-01T10:00:00Z"
  }'
```

### 4. Test complet avec vraie commande Shopify
1. **Créer une commande de test** dans Shopify Admin
2. **Vérifier les logs** dans votre dashboard
3. **Contrôler sur Kimland** que le client et la commande sont créés

## 🔍 Analyse des requêtes Burp Suite

Pour analyser les requêtes Kimland, nous devons les capturer manuellement :

### Méthode 1: Logs applicatifs
```javascript
// Les logs détaillés sont dans les fichiers de log Winston
// Vérifiez les fichiers dans /logs/
```

### Méthode 2: Interception manuelle
1. **Configurer Burp** pour intercepter `kimland.dz`
2. **Lancer le test** de création client
3. **Analyser les requêtes** capturées

### Requêtes attendues (basé sur votre code HTML)
```
1. POST /App/Control/client/new_client.php
   - FormData avec nom, prénom, email, adresse, etc.
   
2. GET /app/client/client_list
   - Navigation vers la liste des clients
   
3. POST /App/Control/commande/confirm_order.php  
   - Confirmation de commande pour le client
```

## 📊 Monitoring et Debug

### Interface Dashboard
- **URL**: `http://localhost:5000/dashboard.html?shop=votre-boutique.myshopify.com`
- **Section "Gestion des Commandes"** affiche :
  - Statut connexion Kimland
  - Statistiques en temps réel  
  - Logs détaillés
  - Boutons de test

### Logs détaillés
```bash
# Logs serveur
tail -f logs/combined.log

# Logs Winston spécifiques
tail -f logs/error.log
tail -f logs/shopify.log
```

### Debug common issues

#### Webhook non reçu
- Vérifier que ngrok fonctionne
- Contrôler l'URL dans Shopify Admin
- Tester avec `curl` d'abord

#### Client non créé sur Kimland
- Vérifier l'authentification Kimland
- Contrôler les logs d'erreur  
- Tester la création manuelle

#### Mapping wilaya/commune
- Les wilayas sont hardcodées dans le service
- Les communes sont récupérées dynamiquement via AJAX

## 🔧 Configuration avancée

### Variables d'environnement
```env
# .env
NODE_ENV=development
PORT=5000
SHOPIFY_API_KEY=votre_clé
SHOPIFY_API_SECRET=votre_secret

# Pour production
NODE_ENV=production
```

### Sécurité webhook
```javascript
// Ajouter la vérification signature Shopify (optionnel)
const crypto = require('crypto');
const signature = req.headers['x-shopify-hmac-sha256'];
// Vérifier la signature...
```

## ✅ Checklist avant production

- [ ] Webhooks configurés dans Shopify
- [ ] Tests réussis en local avec ngrok
- [ ] Authentification Kimland fonctionnelle
- [ ] Mapping wilayas/communes à jour
- [ ] Logs configurés et monitoring actif
- [ ] URL de production configurée
- [ ] Tests de charge effectués

## 📞 Support

En cas de problème :
1. Vérifier les logs dans le dashboard
2. Tester la création client manuellement  
3. Contrôler la connexion Kimland
4. Analyser les requêtes réseau avec les outils dev

---
**Prêt pour les tests !** 🚀