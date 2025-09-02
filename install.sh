#!/bin/bash

echo "🚀 Installation de Kimland App - TypeScript"
echo

# Vérifier si Node.js est installé
if ! command -v node &> /dev/null; then
    echo "❌ Node.js n'est pas installé"
    echo "Installez Node.js depuis https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js détecté: $(node --version)"
echo "✅ NPM version: $(npm --version)"

echo
echo "📦 Installation des dépendances..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de l'installation des dépendances"
    exit 1
fi

echo
echo "📝 Configuration de l'environnement..."
if [ ! -f ".env" ]; then
    cp ".env.example" ".env"
    echo "⚠️  Fichier .env créé. Veuillez le configurer avec vos clés API !"
    echo
    echo "Configurez les variables suivantes dans .env :"
    echo "- SHOPIFY_API_KEY"
    echo "- SHOPIFY_API_SECRET"
    echo "- FIREBASE_PRIVATE_KEY"
    echo "- FIREBASE_CLIENT_EMAIL"
    echo "- FIREBASE_PROJECT_ID"
    echo
else
    echo "✅ Fichier .env existe déjà"
fi

echo
echo "🔨 Compilation du code TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Erreur lors de la compilation"
    exit 1
fi

echo
echo "✅ Installation terminée !"
echo
echo "🏃‍♂️ Pour démarrer l'application :"
echo "  npm run dev    (mode développement)"
echo "  npm start      (mode production)"
echo
echo "🌐 L'application sera accessible sur http://localhost:5000"
echo
echo "⚠️  N'oubliez pas de configurer le fichier .env avant de démarrer !"
echo

# Rendre le script de déploiement exécutable
chmod +x deploy.sh

echo "📁 Fichiers créés :"
echo "  - .env (à configurer)"
echo "  - deploy.sh (pour déploiement VPS)"
echo "  - Dossier dist/ (code compilé)"
echo