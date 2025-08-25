@echo off
echo ===============================
echo  🚨 REPARATION D'URGENCE KIMLAND
echo ===============================

echo 🧹 1. Nettoyage espace disque...
if exist node_modules (
    echo    Suppression node_modules...
    rmdir /s /q node_modules
)
if exist dist (
    echo    Suppression dist...
    rmdir /s /q dist
)

echo 🗑️ Nettoyage cache npm...
call npm cache clean --force

echo ⚡ 2. Installation minimale...
call npm install express express-session express-rate-limit cors dotenv axios winston

echo 🔧 3. Installation dev tools...
call npm install --save-dev typescript ts-node ts-node-dev @types/node @types/express @types/express-session @types/cors

echo 🚀 4. Test compilation...
call npx tsc --noEmit
if %ERRORLEVEL% equ 0 (
    echo ✅ Compilation OK - Démarrage...
    call npm run dev
) else (
    echo ❌ Erreurs de compilation
    echo 📋 Vérification des erreurs...
    call npx tsc --noEmit --pretty
    pause
)
