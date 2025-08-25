@echo off
echo ========================
echo  🧪 TEST RAPIDE KIMLAND
echo ========================

echo 📋 Test 1: Configuration...
if exist .env (
    echo ✅ Fichier .env OK
) else (
    echo ❌ .env manquant
    copy .env.example .env
    echo ✅ .env créé
)

echo 📋 Test 2: Modules essentiels...
call node -e "try{require('express');console.log('✅ Express OK')}catch(e){console.log('❌ Express manquant')}"
call node -e "try{require('axios');console.log('✅ Axios OK')}catch(e){console.log('❌ Axios manquant')}"
call node -e "try{require('express-rate-limit');console.log('✅ Rate-limit OK')}catch(e){console.log('❌ Rate-limit manquant')}"

echo 📋 Test 3: Compilation rapide...
call npx tsc src/config/index.ts --outDir test-temp --skipLibCheck --noEmit
if %ERRORLEVEL% equ 0 (
    echo ✅ Config compile OK
) else (
    echo ❌ Erreurs config
)

echo 📋 Test 4: Démarrage...
echo 🚀 L'app va démarrer dans 3 secondes...
timeout /t 3 /nobreak >nul
call npx ts-node-dev --respawn --transpile-only src/server.ts