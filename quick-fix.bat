@echo off
echo ========================================
echo  🚀 KIMLAND - CORRECTION ULTRA RAPIDE
echo ========================================

echo ⚡ Installation express-rate-limit...
call npm install express-rate-limit @types/express-rate-limit --save

echo ⚡ Nettoyage...
if exist dist rmdir /s /q dist

echo ⚡ Compilation...
call npx tsc

if exist dist\server.js (
    echo ✅ Compilation réussie !
    echo 🚀 Démarrage de l'application...
    call npm run dev
) else (
    echo ❌ Erreur de compilation
    echo 📋 Affichage des erreurs...
    call npx tsc --noEmit
    pause
)