@echo off
echo ================================
echo  🔍 DIAGNOSTIC KIMLAND APP
echo ================================

echo.
echo 📦 1. Vérification package.json...
if exist package.json (
    echo ✅ package.json trouvé
    findstr "express-rate-limit" package.json >nul
    if %ERRORLEVEL% equ 0 (
        echo ✅ express-rate-limit présent dans package.json
    ) else (
        echo ❌ express-rate-limit MANQUANT dans package.json
    )
) else (
    echo ❌ package.json MANQUANT
)

echo.
echo 📁 2. Vérification des dossiers...
if exist src (
    echo ✅ Dossier src trouvé
) else (
    echo ❌ Dossier src MANQUANT
)

if exist dist (
    echo ✅ Dossier dist trouvé
    if exist dist\server.js (
        echo ✅ dist\server.js trouvé
    ) else (
        echo ❌ dist\server.js MANQUANT
    )
) else (
    echo ⚠️ Dossier dist manquant (normal avant compilation)
)

echo.
echo ⚙️ 3. Vérification .env...
if exist .env (
    echo ✅ Fichier .env trouvé
    findstr "NODE_ENV=development" .env >nul
    if %ERRORLEVEL% equ 0 (
        echo ✅ Mode développement activé
    ) else (
        echo ⚠️ Mode développement non défini
    )
) else (
    echo ❌ Fichier .env MANQUANT
)

echo.
echo 🔧 4. Test compilation rapide...
call npx tsc --noEmit --skipLibCheck
if %ERRORLEVEL% equ 0 (
    echo ✅ Code TypeScript valide
) else (
    echo ❌ Erreurs TypeScript détectées
)

echo.
echo 📊 RÉSUMÉ:
echo ========
echo Si tous les ✅ sont affichés, lancez: npm run dev  
echo Si des ❌ sont visibles, lancez: FINAL-FIX.bat
echo.
pause