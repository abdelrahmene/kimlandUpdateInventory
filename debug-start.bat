@echo off
cls
echo.
echo ========================================
echo   🧪 KIMLAND DEBUG MODE 🧪
echo ========================================
echo.

echo 🔧 Compilation TypeScript...
call npx tsc
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Erreur de compilation TypeScript
    echo 🔍 Vérifiez les erreurs ci-dessus
    echo.
    pause
    exit /b 1
)

echo ✅ Compilation réussie !
echo.

echo 🚀 Démarrage du serveur en mode DEBUG...
echo.
echo 📋 INSTRUCTIONS:
echo   1. Ouvrez votre navigateur sur http://localhost:5000/debug-webhook.html
echo   2. Connectez-vous au SSE
echo   3. Testez le webhook
echo   4. Ouvrez le dashboard sur http://localhost:5000/?shop=votre-boutique.myshopify.com
echo   5. Vérifiez si les commandes apparaissent
echo.
echo ⚠️ TOUS LES LOGS DE DEBUG SERONT VISIBLES CI-DESSOUS
echo ========================================
echo.

set NODE_ENV=development
node dist/server.js

pause
