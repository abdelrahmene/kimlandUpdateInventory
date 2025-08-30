@echo off
echo 🔧 Rebuild avec nouveaux logs détaillés...
echo.

REM Nettoyage
if exist dist rmdir /s /q dist

REM Compilation
echo 📦 Compilation TypeScript...
npx tsc

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Erreur de compilation
    pause
    exit /b 1
)

REM Vider les anciens logs
echo 📄 Nettoyage logs précédents...
echo # Logs détaillés Shopify - Session du %date% %time% > logs\shopify-updates.log

echo.
echo ✅ Prêt pour les tests avec logs détaillés !
echo.
echo 📋 NOUVEAUX LOGS DISPONIBLES :
echo   🔄 Suivi complet des requêtes API
echo   🐛 Debug détaillé des correspondances variants  
echo   📤📥 Request/Response avec payloads
echo   🏷️ Suivi des mises à jour SKU
echo   ❌ Erreurs avec stack traces
echo.
echo 📂 Fichier logs : logs\shopify-updates.log
echo.
echo 🚀 Démarrage du serveur...

npm start
