// Script pour analyser les logs et identifier les problèmes critiques
const fs = require('fs');
const path = require('path');

function analyzeLogs(logFilePath) {
    try {
        // Lire le fichier de log
        const logContent = fs.readFileSync(logFilePath, 'utf8');
        const lines = logContent.split('\n');
        
        // Prendre les 200 dernières lignes pour l'analyse récente
        const recentLines = lines.slice(-200);
        
        const errors = [];
        const warnings = [];
        const criticalIssues = [];
        
        recentLines.forEach((line, index) => {
            const actualIndex = lines.length - 200 + index;
            
            // Identifier les erreurs
            if (line.includes('❌') || line.includes('ERROR') || line.includes('Error')) {
                errors.push({
                    line: actualIndex + 1,
                    content: line.trim()
                });
            }
            
            // Identifier les avertissements
            if (line.includes('⚠️') || line.includes('WARN') || line.includes('Warning')) {
                warnings.push({
                    line: actualIndex + 1,
                    content: line.trim()
                });
            }
            
            // Identifier les problèmes critiques spécifiques
            if (line.includes('Échec authentification') || 
                line.includes('ECONNREFUSED') ||
                line.includes('timeout') ||
                line.includes('ENOTFOUND') ||
                line.includes('status: 40') ||
                line.includes('status: 50')) {
                criticalIssues.push({
                    line: actualIndex + 1,
                    content: line.trim(),
                    type: 'network'
                });
            }
            
            if (line.includes('extraction') && (line.includes('failed') || line.includes('échec'))) {
                criticalIssues.push({
                    line: actualIndex + 1,
                    content: line.trim(),
                    type: 'extraction'
                });
            }
        });
        
        return {
            totalLines: lines.length,
            analyzedLines: recentLines.length,
            errors: errors.slice(-10), // Dernières 10 erreurs
            warnings: warnings.slice(-10), // Derniers 10 avertissements
            criticalIssues: criticalIssues.slice(-15), // Derniers 15 problèmes critiques
            lastLines: recentLines.slice(-20) // 20 dernières lignes
        };
        
    } catch (error) {
        return {
            error: `Impossible de lire le fichier de log: ${error.message}`
        };
    }
}

// Analyser les logs
const logPath = 'C:\\KimlandApp-TypeScript\\logs\\app.log';
const analysis = analyzeLogs(logPath);

console.log('=== ANALYSE DES LOGS RÉCENTS ===\n');

if (analysis.error) {
    console.log('ERREUR:', analysis.error);
    process.exit(1);
}

console.log(`📊 Statistiques:`);
console.log(`   Total lignes: ${analysis.totalLines}`);
console.log(`   Lignes analysées: ${analysis.analyzedLines}`);
console.log(`   Erreurs récentes: ${analysis.errors.length}`);
console.log(`   Avertissements: ${analysis.warnings.length}`);
console.log(`   Problèmes critiques: ${analysis.criticalIssues.length}\n`);

if (analysis.criticalIssues.length > 0) {
    console.log('🚨 PROBLÈMES CRITIQUES:');
    analysis.criticalIssues.forEach((issue, i) => {
        console.log(`${i + 1}. [${issue.type}] Ligne ${issue.line}: ${issue.content}`);
    });
    console.log('');
}

if (analysis.errors.length > 0) {
    console.log('❌ ERREURS RÉCENTES:');
    analysis.errors.forEach((error, i) => {
        console.log(`${i + 1}. Ligne ${error.line}: ${error.content}`);
    });
    console.log('');
}

if (analysis.warnings.length > 0) {
    console.log('⚠️ AVERTISSEMENTS:');
    analysis.warnings.slice(-5).forEach((warning, i) => {
        console.log(`${i + 1}. Ligne ${warning.line}: ${warning.content}`);
    });
    console.log('');
}

console.log('📋 DERNIÈRES LIGNES DU LOG:');
analysis.lastLines.forEach((line, i) => {
    if (line.trim()) {
        console.log(`${analysis.totalLines - 20 + i + 1}: ${line.trim()}`);
    }
});

// Suggestions de correction basées sur l'analyse
console.log('\n💡 SUGGESTIONS DE CORRECTION:');

const hasNetworkIssues = analysis.criticalIssues.some(i => i.type === 'network');
const hasAuthIssues = analysis.criticalIssues.some(i => i.content.includes('authentification'));
const hasExtractionIssues = analysis.criticalIssues.some(i => i.type === 'extraction');

if (hasNetworkIssues) {
    console.log('🌐 Problèmes réseau détectés:');
    console.log('   - Vérifier la connectivité internet');
    console.log('   - Augmenter les timeouts');
    console.log('   - Implémenter retry avec backoff');
}

if (hasAuthIssues) {
    console.log('🔐 Problèmes d\'authentification détectés:');
    console.log('   - Vérifier les credentials Kimland');
    console.log('   - Revoir la logique de login');
    console.log('   - Analyser les cookies et sessions');
}

if (hasExtractionIssues) {
    console.log('🔍 Problèmes d\'extraction détectés:');
    console.log('   - Revoir les sélecteurs CSS');
    console.log('   - Analyser la structure HTML');
    console.log('   - Implémenter des fallbacks');
}

module.exports = { analyzeLogs };