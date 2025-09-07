@echo off
echo 🔄 Test de compilation...
cd /d C:\KimlandApp-TypeScript
call npm run build
if %errorlevel% equ 0 (
    echo ✅ Compilation réussie
    echo 📋 Les corrections ont été appliquées:
    echo   - JavaScript: Correction de l'erreur ligne 156 ^(guillemets dans onclick^)
    echo   - Kimland: Amélioration du scoring et recherche publique
    echo   - Filtrage: Exclusion des éléments notifications
    echo.
    echo 🧪 Pour tester maintenant:
    echo   1. Démarrez le serveur: npm start
    echo   2. Testez une synchronisation SKU 30196
    echo   3. Vérifiez que le produit est trouvé avec stock > 0
) else (
    echo ❌ Erreur de compilation - vérifiez les erreurs TypeScript
)
pause
