@echo off
echo 🚀 Script de démarrage avec tests - KimlandApp
echo.

echo 📁 Vérification du répertoire de stockage...
if not exist "storage\auth" mkdir "storage\auth"
echo ✅ Répertoire de stockage créé

echo.
echo 🔧 Test du stockage sécurisé...
npx ts-node test\test-secure-storage.ts
if errorlevel 1 (
    echo ❌ Tests de stockage sécurisé échoués
    pause
    exit /b 1
)

echo.
echo 📊 Affichage des statistiques d'authentification...
curl -s -H "x-admin-key: kimland_admin_2024_secure_key_change_this_in_production" http://localhost:3000/admin/auth-stats 2>nul || echo ⚠️ Serveur pas encore démarré

echo.
echo 🧹 Nettoyage des authentifications expirées...
curl -s -X POST -H "x-admin-key: kimland_admin_2024_secure_key_change_this_in_production" http://localhost:3000/admin/cleanup-auth 2>nul || echo ⚠️ Serveur pas encore démarré

echo.
echo 🔄 Démarrage du serveur avec les nouvelles corrections...
echo ✅ Stockage sécurisé activé
echo ✅ Synchronisation des variantes "Dimension/Couleur" corrigée
echo ✅ Animation de progression améliorée
echo ✅ Authentification persistante activée

npm start
