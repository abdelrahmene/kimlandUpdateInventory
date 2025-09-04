@echo off
echo 🔧 Test de compilation TypeScript...
npx tsc --noEmit
if %ERRORLEVEL% EQU 0 (
    echo ✅ Compilation TypeScript réussie
    echo 🏗️ Build complet...
    npx tsc
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Build terminé avec succès !
        echo.
        echo 🚀 Prêt pour le test ! Utilisez :
        echo   - debug-start.bat pour démarrer le serveur
        echo   - test-webhook-only.sh pour tester le webhook
    ) else (
        echo ❌ Erreur lors du build
    )
) else (
    echo ❌ Erreur de compilation TypeScript
)
pause
