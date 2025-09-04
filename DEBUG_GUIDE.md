# 🧪 Guide de Debug - Problème Commandes Dashboard

## 🎯 Problème
Les commandes Shopify ne s'affichent pas dans le dashboard malgré que le webhook fonctionne.

## 🔧 Solution mise en place
J'ai ajouté des logs de debug complets pour identifier le problème :

### 📡 Côté Serveur (webhook)
- **Fichier**: `src/routes/orders.routes.ts`
- **Logs ajoutés**: 
  - Données brutes reçues du webhook
  - Informations extraites de la commande
  - Diffusion SSE avec détails complets

### 🌐 Côté SSE (Server-Sent Events)
- **Fichier**: `src/routes/logs.routes.ts`
- **Logs ajoutés**:
  - Connexions SSE (ouverture/fermeture)
  - Diffusion vers les clients
  - Nombres de clients connectés

### 💻 Côté Client (JavaScript)
- **Fichier**: `public/assets/js/orders-module.js`
- **Logs ajoutés**:
  - Réception des messages SSE
  - Ajout des commandes à la liste
  - Rendu de l'interface

## 🚀 Comment tester

### 1. Démarrage
```bash
# Lancez le serveur en mode debug
debug-start.bat
```

### 2. Test direct
1. Ouvrez http://localhost:5000/debug-webhook.html
2. Connectez-vous au SSE
3. Testez le webhook
4. Observez les logs

### 3. Test dashboard
1. Ouvrez http://localhost:5000/?shop=test.myshopify.com
2. Ouvrez la console développeur (F12)
3. Testez le webhook depuis l'interface
4. Vérifiez si les commandes apparaissent

## 🔍 Points de vérification

### ✅ Vérifier que le webhook fonctionne
- Le serveur reçoit-il les données ?
- Les logs `[DEBUG WEBHOOK]` s'affichent-ils ?

### ✅ Vérifier que le SSE fonctionne
- Le client se connecte-t-il au SSE ?
- Les logs `[DEBUG SSE]` s'affichent-ils ?
- Le message est-il diffusé vers les clients ?

### ✅ Vérifier que le client reçoit les messages
- Le JavaScript reçoit-il les messages SSE ?
- La fonction `addNewOrder` est-elle appelée ?
- Les logs `[DEBUG]` s'affichent-ils dans la console ?

### ✅ Vérifier que l'interface se met à jour
- L'élément `orders-list` existe-t-il ?
- Le HTML est-il généré et injecté ?
- Y a-t-il des erreurs JavaScript ?

## 🐛 Problèmes possibles identifiés

1. **SSE non connecté**: Le client ne se connecte pas au stream
2. **Messages SSE perdus**: Les messages ne sont pas reçus
3. **Parsing JSON**: Erreur lors du parsing des données SSE
4. **DOM manquant**: L'élément `orders-list` n'existe pas
5. **JavaScript bloqué**: Erreurs qui empêchent l'exécution

## 📋 Prochaines étapes

1. **Lancez debug-start.bat**
2. **Testez avec debug-webhook.html**
3. **Analysez les logs dans la console**
4. **Identifiez où le flux se brise**
5. **Corrigez le problème identifié**

## 🔧 Logs à surveiller

### Console Serveur
```
🔗 [DEBUG SSE] Nouvelle connexion SSE démarrée
🔍 [DEBUG WEBHOOK] Données brutes reçues
📡 [DEBUG SSE] Diffusion vers X clients connectés
```

### Console Navigateur
```
✅ [DEBUG] EventSource connecté avec succès
📨 [DEBUG] Message EventSource reçu
🛒 [DEBUG] WEBHOOK DÉTECTÉ !
🔄 [DEBUG] addNewOrder APPELÉ !
```

---

**Note**: Une fois le problème identifié et résolu, vous pouvez désactiver les logs de debug en supprimant les `console.log` ajoutés.
