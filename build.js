const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔧 Building KimlandApp...');

// Nettoyer le dossier dist
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
}

// Compiler TypeScript
exec('npx tsc', (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Erreur de compilation:', error);
    return;
  }
  
  if (stderr) {
    console.log('⚠️ Avertissements:', stderr);
  }
  
  if (stdout) {
    console.log(stdout);
  }
  
  // Copier les fichiers statiques
  if (fs.existsSync('public')) {
    fs.cpSync('public', 'dist/public', { recursive: true });
    console.log('✅ Fichiers publics copiés');
  }
  
  console.log('✅ Build terminé avec succès!');
  console.log('📝 Pour démarrer: npm start');
});
