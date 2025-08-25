# 🚨 GUIDE DE DÉPANNAGE RAPIDE

## ⚡ Solution Express (1 minute)

```cmd
FINAL-FIX.bat
```
Ce script corrige AUTOMATIQUEMENT tous les problèmes.

---

## 🔍 Si ça ne marche toujours pas

### 1. Diagnostic
```cmd
diagnostic.bat
```

### 2. Erreurs communes et solutions

#### ❌ `Cannot find module 'express-rate-limit'`
```cmd
npm install express-rate-limit
npm install @types/express-rate-limit --save-dev
```

#### ❌ `Cannot find module 'C:\...\dist\server.js'`
```cmd
npm run build
# ou
npx tsc
```

#### ❌ `Variable d'environnement manquante: FIREBASE_PRIVATE_KEY`
✅ **DÉJÀ CORRIGÉ** - Redémarrez juste l'app

#### ❌ Erreurs de compilation TypeScript
```cmd
npx tsc --noEmit
# Voir les erreurs détaillées
```

---

## 📋 Checklist de vérification

- [ ] `express-rate-limit` installé ?
- [ ] Dossier `dist` existe ?
- [ ] Fichier `.env` en mode `development` ?
- [ ] `npm install` exécuté récemment ?

---

## 🚀 Commandes de démarrage

### Développement
```cmd
npm run dev
```

### Production  
```cmd
npm run build
npm start
```

### Test rapide
```cmd
node -e "console.log('Node.js fonctionne !')"
npm --version
```

---

## 🆘 Dernier recours

Si rien ne marche :
1. Supprimer `node_modules` et `dist`
2. `npm install`  
3. `FINAL-FIX.bat`

**⚡ Temps de résolution estimé : < 5 minutes**