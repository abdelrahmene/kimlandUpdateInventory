# Guide de déploiement rapide - Hostinger VPS

## 📋 Étapes de déploiement

### 1. Préparer votre PC local

```bash
# Dans le dossier C:\KimlandApp-TypeScript
npm install
cp .env.example .env
# Configurer le fichier .env avec vos clés
```

### 2. Connexion au serveur VPS

```bash
ssh root@148.230.125.253
# Mot de passe de votre VPS Hostinger
```

### 3. Télécharger et exécuter le script de déploiement

```bash
# Sur le serveur VPS
wget https://raw.githubusercontent.com/votre-repo/deploy.sh
chmod +x deploy.sh
./deploy.sh
```

### 4. Transférer vos fichiers

**Option A: Via SCP (recommandé)**
```bash
# Depuis votre PC local
scp -r C:\KimlandApp-TypeScript root@148.230.125.253:/var/www/kimland-app/
```

**Option B: Via Git**
```bash
# Sur le serveur VPS
cd /var/www/kimland-app
git clone https://github.com/votre-repo/kimland-app.git .
```

### 5. Configuration finale

```bash
# Sur le serveur VPS
cd /var/www/kimland-app
npm install
npm run build

# Configurer les variables d'environnement
nano .env

# Démarrer l'application
pm2 start ecosystem.config.js
pm2 save
```

### 6. Configurer votre app Shopify

Dans votre Partner Dashboard Shopify :
- **App URL**: `https://votre-domaine.com`
- **Allowed redirection URL(s)**: `https://votre-domaine.com/auth/callback`

## 🛠️ Commandes utiles

```bash
# Voir les logs
pm2 logs kimland-app

# Redémarrer l'app
pm2 restart kimland-app

# Status des processus
pm2 status

# Monitoring en temps réel
pm2 monit

# Recharger Nginx
systemctl reload nginx

# Vérifier les certificats SSL
certbot certificates
```

## 🔧 Résolution de problèmes

**App ne démarre pas:**
```bash
pm2 logs kimland-app
# Vérifier les erreurs et la configuration .env
```

**Erreur 502 Bad Gateway:**
```bash
pm2 status
# Vérifier si l'app tourne sur le port 3000
netstat -tlnp | grep :3000
```

**Problème SSL:**
```bash
certbot renew --dry-run
systemctl status nginx
```

## 📱 Test de l'installation

1. Aller sur `https://votre-domaine.com`
2. Entrer le nom d'une boutique de test
3. Suivre le processus d'installation OAuth
4. Vérifier que le dashboard s'affiche avec les produits

## 🚀 Mise en production

1. Tester avec une boutique de développement
2. Configurer les webhooks si nécessaire
3. Surveiller les logs pendant les premiers jours
4. Configurer une sauvegarde automatique

## 🔐 Sécurité

- Certificat SSL automatiquement configuré
- Firewall UFW activé
- Headers de sécurité Nginx
- Sessions sécurisées
- Validation HMAC Shopify