#!/bin/bash

clear
echo
echo "========================================"
echo "   🧪 KIMLAND DEBUG MODE 🧪"
echo "========================================"
echo

echo "🔧 Compilation TypeScript..."
npx tsc
if [ $? -ne 0 ]; then
    echo
    echo "❌ Erreur de compilation TypeScript"
    echo "🔍 Vérifiez les erreurs ci-dessus"
    echo
    read -p "Appuyez sur Entrée pour continuer..."
    exit 1
fi

echo "✅ Compilation réussie !"
echo

echo "🚀 Démarrage du serveur en mode DEBUG..."
echo
echo "📋 INSTRUCTIONS:"
echo "  1. Ouvrez votre navigateur sur http://localhost:5000/debug-webhook.html"
echo "  2. Connectez-vous au SSE"
echo "  3. Testez le webhook"
echo "  4. Ouvrez le dashboard sur http://localhost:5000/?shop=votre-boutique.myshopify.com"
echo "  5. Vérifiez si les commandes apparaissent"
echo
echo "⚠️ TOUS LES LOGS DE DEBUG SERONT VISIBLES CI-DESSOUS"
echo "========================================"
echo

export NODE_ENV=development
node dist/server.js
