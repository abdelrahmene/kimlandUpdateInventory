# 🚀 KimlandApp - Application Shopify TypeScript

## 🛠️ Démarrage Rapide

### Option 1: Script Automatique (Recommandé)
```cmd
fix-and-run.bat
```
Ce script :
- ✅ Configure automatiquement l'environnement
- ✅ Corrige les erreurs de compilation 
- ✅ Lance l'application en mode développement

### Option 2: Démarrage Manuel
```cmd
npm install
npm run build
npm run dev
```

## 🔧 Configuration

### 1. Variables d'environnement
Le fichier `.env` est automatiquement créé avec les bonnes valeurs.
- `NODE_ENV=development` (pas d'erreurs Firebase)
- Configuration Shopify pré-remplie
- Ports et URLs configurés

### 2. Firebase (Optionnel)
Firebase fonctionne en mode "graceful failure" :
- ✅ Si configuré : sauvegarde en base
- ✅ Si non configuré : logs uniquement, pas d'erreur

## 📱 Test de l'application

1. **Démarrer** : `npm run dev`
2. **Ouvrir** : http://localhost:5000
3. **Tester** : Entrer le nom d'une boutique Shopify

## 🌐 Déploiement VPS Hostinger

### Automatique
```bash
# Sur le serveur VPS
chmod +x deploy.sh
./deploy.sh
```

### Manuel
```bash
# Transférer les fichiers
scp -r C:\KimlandApp-TypeScript root@148.230.125.253:/var/www/kimland-app/

# Sur le serveur
cd /var/www/kimland-app
npm install
npm run build
pm2 start ecosystem.config.js
```

## 📋 Scripts Disponibles

- `npm run dev` - Mode développement avec auto-reload
- `npm run build` - Construction avec copie des assets
- `npm run start` - Démarrage en production
- `npm run compile` - Compilation TypeScript seule
- `npm run lint` - Vérification du code

## 🔍 Résolution de problèmes

### Erreur "Cannot find module"
```cmd
npm install
npm run build
```

### Erreur "FIREBASE_PRIVATE_KEY"
✅ **Déjà corrigé** : L'app fonctionne sans Firebase en développement

### Port 5000 occupé
Modifier le PORT dans `.env` :
```env
PORT=3001
```

### Problème de compilation
```cmd
npm run clean
npm install
npm run build
```

## 🎯 Fonctionnalités

- ✅ **Connexion Shopify** OAuth sécurisée
- ✅ **Dashboard produits** avec statistiques
- ✅ **Extraction références** automatique
- ✅ **Mode hors-ligne** (sans Firebase)
- ✅ **Interface moderne** Responsive
- ✅ **Prêt production** Optimisé VPS

## 🏗️ Architecture

```
KimlandApp-TypeScript/
├── src/
│   ├── config/       # Configuration centralisée
│   ├── middleware/   # Middlewares Express
│   ├── routes/       # Routes API et pages
│   ├── services/     # Services (Shopify, Firebase)
│   ├── types/        # Types TypeScript
│   └── utils/        # Utilitaires
├── public/           # Assets statiques  
├── dist/             # Code compilé
└── deploy.sh         # Script de déploiement
```

## 🚨 Points Important

1. **Mode Développement** : Pas besoin de Firebase
2. **Mode Production** : Firebase optionnel mais recommandé
3. **Sécurité** : HMAC validation automatique
4. **Performance** : Compilation optimisée
5. **Monitoring** : Logs détaillés

---

## 🆘 Support

Si problème persiste :
1. Supprimer `node_modules` et `dist`
2. Exécuter `npm install`
3. Lancer `fix-and-run.bat`

**Status** : ✅ Prêt pour développement et production