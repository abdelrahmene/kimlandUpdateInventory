@echo off
echo =====================================
echo  ⚡ DEMARRAGE RAPIDE KIMLAND - V2
echo =====================================

echo 🔍 Vérification des modules critiques...
if not exist node_modules\express (
    echo ❌ Express manquant - Installation...
    call npm install express express-session cors dotenv axios winston
)

if not exist node_modules\express-rate-limit (
    echo ❌ express-rate-limit manquant - Installation...  
    call npm install express-rate-limit
)

if not exist node_modules\typescript (
    echo ❌ TypeScript manquant - Installation dev...
    call npm install --save-dev typescript ts-node-dev @types/node @types/express
)

echo ✅ Modules vérifiés !

echo 🔥 Démarrage direct en mode développement...
echo ========================================

call npx ts-node-dev --respawn --transpile-only src/server.ts