@echo off
echo ======================================
echo  🎯 CORRECTION CIBLÉE KIMLAND
echo ======================================

echo 🧹 Nettoyage préventif...
if exist node_modules\crypto (
    echo    Suppression du module crypto obsolète...
    rmdir /s /q node_modules\crypto
)

echo ⚡ Installation des modules critiques uniquement...
call npm install --no-save express@4.18.2 express-session@1.17.3 express-rate-limit@7.1.5
if %ERRORLEVEL% neq 0 (
    echo ❌ Erreur lors de l'installation des modules Express
    exit /b 1
)

call npm install --no-save cors@2.8.5 dotenv@16.3.1 axios@1.6.0
if %ERRORLEVEL% neq 0 (
    echo ❌ Erreur lors de l'installation des modules utilitaires
    exit /b 1
)

call npm install --no-save winston@3.11.0
if %ERRORLEVEL% neq 0 (
    echo ❌ Erreur lors de l'installation de winston
    exit /b 1
)

echo 🔧 Installation outils de développement...
call npm install --save-dev --no-save typescript@5.2.2 ts-node-dev@2.0.0
if %ERRORLEVEL% neq 0 (
    echo ❌ Erreur lors de l'installation des outils TypeScript
    exit /b 1
)

call npm install --save-dev --no-save @types/node@20.8.0 @types/express@4.17.20
if %ERRORLEVEL% neq 0 (
    echo ❌ Erreur lors de l'installation des types
    exit /b 1
)

echo ✅ Installation terminée !

echo 🚀 Test de démarrage...
timeout /t 2 /nobreak >nul
call npx ts-node-dev --respawn --transpile-only src/server.ts