#!/bin/bash
echo "🔄 Compilation du projet..."
cd /home/boumediene/KimlandApp-TypeScript
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Compilation réussie"
    echo "🚀 Démarrage du serveur..."
    npm start
else
    echo "❌ Échec de la compilation"
    exit 1
fi
