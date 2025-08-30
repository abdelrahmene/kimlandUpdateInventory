@echo off
echo Compilation rapide...
if exist dist rmdir /s /q dist
npx tsc
echo.
echo ✅ CORRECTIONS APPLIQUÉES:
echo   - Detection produits avec tailles numeriques vs Standard
echo   - Skip automatique variants incompatibles 
echo   - Capture detaillee erreurs 422
echo   - Logs enrichis pour debug
echo.
echo 📂 Nouveau test recommande: 
echo   - Produit avec tailles numeriques (comme ID8763)
echo   - Produit standard (comme un collier/accessoire)
echo.

npm start
