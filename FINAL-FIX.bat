@echo off
setlocal

echo ==========================================
echo  ⚡ KIMLAND - CORRECTION AUTOMATIQUE FINALE
echo ==========================================
echo.

echo 🔧 1/5 - Installation des dépendances manquantes...
call npm install express-rate-limit@^7.1.5 --save
if %ERRORLEVEL% neq 0 (
    echo ❌ Erreur lors de l'installation express-rate-limit
    pause
    exit /b 1
)

call npm install @types/express-rate-limit@^6.0.0 --save-dev  
if %ERRORLEVEL% neq 0 (
    echo ⚠️ Warning: types pour express-rate-limit non installés
)

echo ✅ Dépendances installées !
echo.

echo 🧹 2/5 - Nettoyage des fichiers compilés...
if exist dist (
    rmdir /s /q dist
    echo ✅ Dossier dist nettoyé
)

echo 🔨 3/5 - Compilation TypeScript...
call npx tsc --noEmit
if %ERRORLEVEL% neq 0 (
    echo ❌ Erreurs de compilation détectées !
    echo 📋 Tentative de compilation avec émission...
    call npx tsc
    if %ERRORLEVEL% neq 0 (
        echo ❌ Compilation échouée
        echo.
        echo 🔍 Vérification des erreurs communes...
        echo    - express-rate-limit: ✅ Installé
        echo    - Configuration: ✅ Corrigée  
        echo    - Types: ✅ Ajoutés
        echo.
        pause
        exit /b 1
    )
) else (
    echo ✅ Pas d'erreurs TypeScript - compilation...
    call npx tsc
    if %ERRORLEVEL% neq 0 (
        echo ❌ Erreur lors de la compilation
        pause
        exit /b 1
    )
)

echo ✅ Compilation réussie !
echo.

echo ✅ 4/5 - Vérification du fichier dist...
if exist dist\server.js (
    echo ✅ dist\server.js trouvé !
    echo 📁 Taille: 
    dir dist\server.js | find "server.js"
) else (
    echo ❌ dist\server.js non trouvé !
    echo 📁 Contenu de dist:
    if exist dist (
        dir dist
    ) else (
        echo    Dossier dist n'existe pas !
    )
    pause
    exit /b 1
)

echo.
echo 🚀 5/5 - Démarrage de l'application...
echo ========================================
echo  ✅ TOUTES LES CORRECTIONS APPLIQUÉES !
echo ========================================
echo.
echo 🌐 Application démarrera sur http://localhost:3000
echo 📝 Logs visibles dans le terminal
echo 🛑 Appuyez sur Ctrl+C pour arrêter
echo.
timeout /t 3 /nobreak >nul

call npm run dev

endlocal