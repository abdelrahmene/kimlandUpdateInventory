@echo off
echo =================================
echo  🚀 KIMLAND APP - DEMARRAGE RAPIDE
echo =================================
echo.

echo ✅ 1/4 - Vérification de l'environnement...
if not exist .env (
    echo ⚠️ Fichier .env manquant, copie depuis .env.example
    copy .env.example .env
)

echo ✅ 2/4 - Installation des dépendances...
call npm install

echo ✅ 3/4 - Compilation du projet...
call npm run compile

echo ✅ 4/4 - Démarrage en mode développement...
echo.
echo 🌐 Application disponible sur http://localhost:3000
echo 📝 Logs disponibles dans le terminal
echo 🛑 Appuyez sur Ctrl+C pour arrêter
echo.

call npm run dev
