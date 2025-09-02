#!/bin/bash

# Script de déploiement automatique pour Hostinger VPS
# Usage: ./deploy.sh

set -e

echo "🚀 Démarrage du déploiement Kimland App..."

# Variables
APP_NAME="kimland-app"
APP_DIR="/var/www/$APP_NAME"
DOMAIN="your-domain.com" # Remplacer par votre domaine

# Couleurs pour les messages
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Vérifier si on est root
if [ "$EUID" -ne 0 ]; then
    print_error "Ce script doit être exécuté en tant que root"
    exit 1
fi

# 1. Mise à jour du système
print_status "Mise à jour du système..."
apt update && apt upgrade -y

# 2. Installation de Node.js 18
print_status "Installation de Node.js 18..."
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
apt-get install -y nodejs

# 3. Installation des outils globaux
print_status "Installation de PM2 et des outils..."
npm install -g pm2 typescript ts-node

# 4. Installation de Nginx
print_status "Installation de Nginx..."
apt install nginx -y

# 5. Installation de Certbot pour SSL
print_status "Installation de Certbot..."
apt install certbot python3-certbot-nginx -y

# 6. Création du répertoire de l'application
print_status "Création du répertoire de l'application..."
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs

# 7. Copie des fichiers (à faire manuellement ou via Git)
print_warning "Copiez maintenant vos fichiers dans $APP_DIR"
print_warning "Ou clonez votre repository Git dans ce répertoire"

read -p "Appuyez sur Entrée quand les fichiers sont copiés..."

# 8. Installation des dépendances
print_status "Installation des dépendances Node.js..."
cd $APP_DIR
npm install --production

# 9. Compilation TypeScript
print_status "Compilation du code TypeScript..."
npm run build

# 10. Configuration des permissions
print_status "Configuration des permissions..."
chown -R www-data:www-data $APP_DIR
chmod -R 755 $APP_DIR

# 11. Création du fichier .env
print_status "Création du fichier de configuration..."
if [ ! -f "$APP_DIR/.env" ]; then
    cp $APP_DIR/.env.example $APP_DIR/.env
    print_warning "Fichier .env créé. Veuillez le configurer avec vos clés API !"
    print_warning "Éditez le fichier : nano $APP_DIR/.env"
    read -p "Appuyez sur Entrée quand la configuration est terminée..."
fi

# 12. Configuration Nginx
print_status "Configuration de Nginx..."
cat > /etc/nginx/sites-available/$APP_NAME << EOF
server {
    listen 80;
    server_name $DOMAIN;
    
    # Redirection vers HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;
    
    # Certificats SSL (seront générés par Certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # Configuration SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    
    # Headers de sécurité
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Configuration du proxy vers Node.js
    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Cache des assets statiques
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Logs
    access_log /var/log/nginx/$APP_NAME.access.log;
    error_log /var/log/nginx/$APP_NAME.error.log;
}
EOF

# Activer le site
ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
nginx -t

# 13. Configuration du firewall
print_status "Configuration du firewall..."
ufw --force enable
ufw allow ssh
ufw allow 'Nginx Full'

# 14. Démarrage de l'application avec PM2
print_status "Démarrage de l'application avec PM2..."
cd $APP_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup

# 15. Redémarrage de Nginx
systemctl restart nginx

# 16. Obtention du certificat SSL
print_status "Obtention du certificat SSL..."
certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@$DOMAIN

print_status "✅ Déploiement terminé !"
print_status "🌐 Votre application est accessible sur : https://$DOMAIN"
print_status "📊 Monitoring PM2 : pm2 monit"
print_status "📋 Logs : pm2 logs $APP_NAME"
print_status "🔄 Redémarrer : pm2 restart $APP_NAME"

echo ""
print_warning "N'oubliez pas de :"
print_warning "1. Configurer votre app Shopify avec l'URL : https://$DOMAIN"
print_warning "2. Ajouter les webhooks si nécessaire"
print_warning "3. Tester l'installation avec une boutique de développement"