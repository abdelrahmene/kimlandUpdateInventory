@echo off
echo 🔧 Test de compilation TypeScript...
npx tsc --noEmit
if %ERRORLEVEL% EQU 0 (
    echo ✅ Compilation TypeScript réussie
    echo 🏗️ Build du projet...
    npx tsc
    if %ERRORLEVEL% EQU 0 (
        echo ✅ Build terminé avec succès
    ) else (
        echo ❌ Erreur lors du build
    )
) else (
    echo ❌ Erreur de compilation TypeScript
)
pause
