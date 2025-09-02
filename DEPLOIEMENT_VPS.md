# GUIDE DE DÉPLOIEMENT HOSTINGER VPS
# ===================================

## ÉTAPES DE DÉPLOIEMENT

### 1. Préparation locale
```bash
# Test local d'abord
npm run dev
# Vérifiez: http://localhost:5000/api/test
```

### 2. Upload vers Hostinger VPS
```bash
# Compresser le projet
tar -czf kimland-app.tar.gz --exclude=node_modules --exclude=.git --exclude=dist .

# Upload via SFTP ou panel Hostinger
```

### 3. Sur le VPS Hostinger
```bash
# Se connecter en SSH
ssh votre-username@votre-ip-vps

# Extraire
tar -xzf kimland-app.tar.gz
cd KimlandApp-TypeScript

# Installer Node.js (si pas installé)
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Installer dépendances
npm ci --production

# Build production
npm run build

# Installer PM2 pour gestion processus
npm install -g pm2

# Démarrer avec PM2
pm2 start dist/server.js --name "kimland-app"

# Auto-restart au boot
pm2 startup
pm2 save
```

### 4. Configuration Nginx (reverse proxy)
```nginx
server {
    listen 80;
    server_name votre-domaine.com;
    
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 5. Variables d'environnement production
Modifiez `.env`:
```
NODE_ENV=production
APP_URL=https://votre-domaine.com
SHOPIFY_REDIRECT_URI=https://votre-domaine.com/auth/callback
```

## COMMANDES UTILES
```bash
# Logs
pm2 logs kimland-app

# Restart
pm2 restart kimland-app

# Status
pm2 status

# Stop
pm2 stop kimland-app
```

## TEST APRÈS DÉPLOIEMENT
1. Visitez: https://votre-domaine.com/health
2. Test API: https://votre-domaine.com/api/test
3. Installation: https://votre-domaine.com/install?shop=votre-boutique.myshopify.com
