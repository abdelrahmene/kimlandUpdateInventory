@echo off
echo 🚀 Test rapide du serveur Kimland App
echo.

echo 📦 Verification des dependances...
npm list --depth=0 > nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Dependances manquantes, installation...
    npm install
)

echo.
echo 🔨 Compilation TypeScript...
npm run compile
if %errorlevel% neq 0 (
    echo ❌ Erreur de compilation
    pause
    exit /b 1
)

echo.
echo ✅ Compilation réussie
echo.
echo 🌐 Démarrage du serveur en mode développement...
echo 📍 Dashboard: http://localhost:3000
echo 🛑 Ctrl+C pour arrêter
echo.

npm run dev