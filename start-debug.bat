@echo off
echo 🚀 Démarrage du serveur avec logs de debug...
echo.
echo ⚠️ ATTENTION: Mode DEBUG activé
echo 📋 Tous les logs de debug seront visibles dans la console
echo.

set NODE_ENV=development
node -r ts-node/register src/server.ts

pause
