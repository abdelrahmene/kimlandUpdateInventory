#!/bin/bash

echo "🔧 Configuration des permissions et test complet"
echo "================================================="

# Rendre les scripts exécutables
echo "📝 Attribution des permissions d'exécution..."
chmod +x debug-start.sh
chmod +x test-webhook-only.sh  
chmod +x test-sse-webhook.sh

echo "✅ Permissions accordées"
echo

# Test de compilation
echo "🏗️ Test de compilation TypeScript..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
    echo "❌ Erreur de compilation, vérifiez le code TypeScript"
    exit 1
fi

echo "✅ Compilation OK"
echo

# Build complet
echo "📦 Build complet du projet..."
npx tsc
if [ $? -ne 0 ]; then
    echo "❌ Erreur lors du build"
    exit 1
fi

echo "✅ Build terminé"
echo

echo "🎯 PRÊT POUR LES TESTS !"
echo "========================"
echo
echo "Commandes disponibles:"
echo "  ./debug-start.sh          - Démarrer le serveur en mode debug"
echo "  ./test-webhook-only.sh    - Tester le webhook uniquement"
echo "  ./test-sse-webhook.sh     - Tester SSE + webhook"
echo
echo "URLs importantes:"
echo "  Dashboard: https://kimiscrap.ddnsgeek.com/?shop=test.myshopify.com"
echo "  Test page: https://kimiscrap.ddnsgeek.com/debug-webhook.html"
echo

read -p "Voulez-vous démarrer le serveur maintenant ? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Démarrage du serveur..."
    ./debug-start.sh
fi
