@echo off
echo.
echo ===========================================
echo   TEST AUTHENTIFICATION KIMLAND
echo ===========================================
echo.

:: Vérifie si Node.js est installé
node --version > nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js n'est pas installé ou pas dans le PATH
    pause
    exit /b 1
)

:: Vérifie si TypeScript est installé localement
if not exist "node_modules\.bin\ts-node.cmd" (
    echo ⚠️ ts-node non trouvé localement, installation...
    npm install
    if errorlevel 1 (
        echo ❌ Échec installation des dépendances
        pause
        exit /b 1
    )
)

echo 🔧 Compilation et test du service Kimland...
echo.

:: Exécute le test
echo 📡 Lancement du test d'authentification...
npx ts-node test-kimland-auth.ts

echo.
echo ✅ Test terminé. Vérifiez les logs ci-dessus.
echo.
pause