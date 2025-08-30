@echo off
echo 🔧 Reconstruction de l'application avec les corrections Shopify...

echo 📁 Nettoyage du dossier dist...
if exist dist rmdir /s /q dist

echo 📦 Compilation TypeScript...
npx tsc

if %ERRORLEVEL% NEQ 0 (
    echo ❌ Erreur de compilation
    pause
    exit /b 1
)

echo ✅ Compilation réussie!
echo 🚀 Démarrage du serveur...
echo.
echo 📋 CORRECTIONS APPLIQUÉES:
echo   - API Shopify 2024-10
echo   - Permissions read_locations ajoutées
echo   - Logger spécialisé pour mises à jour Shopify
echo   - Mise à jour des SKUs des variants
echo   - Création automatique des variants manquants
echo.
echo 📄 Vérifiez les logs dans: logs/shopify-updates.log
echo.

npm start
