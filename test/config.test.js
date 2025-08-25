const { config } = require('../dist/config');
const { logger } = require('../dist/utils/logger');

console.log('🧪 Test de configuration Kimland App');
console.log('=====================================');

// Test de configuration
console.log('📋 Configuration:');
console.log(`- Environment: ${config.app.env}`);
console.log(`- Port: ${config.app.port}`);
console.log(`- Shopify API Key: ${config.shopify.apiKey ? '✅ Configuré' : '❌ Manquant'}`);
console.log(`- Shopify API Secret: ${config.shopify.apiSecret ? '✅ Configuré' : '❌ Manquant'}`);
console.log(`- Firebase Project ID: ${config.firebase.projectId ? '✅ Configuré' : '❌ Manquant'}`);

// Test du logger
console.log('\n📝 Test du logger:');
logger.info('Logger opérationnel');
logger.warn('Ceci est un avertissement de test');

console.log('\n✅ Tests terminés');

// Vérification des dépendances critiques
const requiredPackages = ['express', 'cors', 'dotenv', 'axios', 'winston'];
console.log('\n📦 Vérification des dépendances:');

requiredPackages.forEach(pkg => {
    try {
        require(pkg);
        console.log(`- ${pkg}: ✅`);
    } catch (error) {
        console.log(`- ${pkg}: ❌ (${error.message})`);
    }
});

process.exit(0);