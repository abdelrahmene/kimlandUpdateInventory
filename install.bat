@echo off
echo 🚀 Installation de Kimland App - TypeScript
echo.

REM Vérifier si Node.js est installé
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js n'est pas installé
    echo Téléchargez et installez Node.js depuis https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js détecté
node --version

echo.
echo 📦 Installation des dépendances...
npm install

if %errorlevel% neq 0 (
    echo ❌ Erreur lors de l'installation des dépendances
    pause
    exit /b 1
)

echo.
echo 📝 Configuration de l'environnement...
if not exist ".env" (
    copy ".env.example" ".env"
    echo ⚠️  Fichier .env créé. Veuillez le configurer avec vos clés API !
    echo.
    echo Ouvrez le fichier .env et configurez :
    echo - SHOPIFY_API_KEY
    echo - SHOPIFY_API_SECRET  
    echo - FIREBASE_PRIVATE_KEY
    echo - FIREBASE_CLIENT_EMAIL
    echo - FIREBASE_PROJECT_ID
    echo.
) else (
    echo ✅ Fichier .env existe déjà
)

echo.
echo 🔨 Compilation du code TypeScript...
npm run build

if %errorlevel% neq 0 (
    echo ❌ Erreur lors de la compilation
    pause
    exit /b 1
)

echo.
echo ✅ Installation terminée !
echo.
echo 🏃‍♂️ Pour démarrer l'application :
echo   npm run dev    (mode développement)
echo   npm start      (mode production)
echo.
echo 🌐 L'application sera accessible sur http://localhost:3000
echo.
echo ⚠️  N'oubliez pas de configurer le fichier .env avant de démarrer !
echo.

pause