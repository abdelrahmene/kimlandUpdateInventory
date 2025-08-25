@echo off
echo ========================================
echo  🔧 KIMLAND APP - CORRECTION AUTOMATIQUE
echo ========================================

echo ✅ 1. Vérification et correction du fichier .env...
if not exist .env (
    echo    📄 Création du fichier .env...
    copy .env.example .env >nul
    echo NODE_ENV=development >> .env
    echo    ✅ Fichier .env créé et configuré en mode développement
) else (
    echo    ✅ Fichier .env trouvé
)

echo.
echo ✅ 2. Nettoyage et reconstruction...
echo    🗑️ Suppression du dossier dist...
if exist dist rmdir /s /q dist
echo    🔨 Compilation TypeScript...
call npx tsc

if not exist dist\server.js (
    echo    ❌ Erreur de compilation !
    echo    📋 Exécution du build custom...
    call node build.js
)

echo.
echo ✅ 3. Test de démarrage...
echo    🚀 Tentative de démarrage de l'application...
echo.

timeout /t 2 /nobreak >nul

call npm run dev

pause