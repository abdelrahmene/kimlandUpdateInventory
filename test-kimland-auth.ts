// Script de test pour vérifier l'authentification Kimland
// Fichier: test-kimland-auth.ts

import { KimlandService } from './src/services/kimland/kimland.service';
import { logger } from './src/utils/logger';

async function testKimlandAuthentication() {
  const kimlandService = new KimlandService();

  console.log('🔧 Test de l\'authentification Kimland...\n');

  try {
    // Test 1: Vérification du statut initial
    const initialConnection = await kimlandService.checkConnection();
    console.log(`📊 Statut initial: ${initialConnection ? '✅ Connecté' : '❌ Non connecté'}`);

    // Test 2: Forcer une nouvelle authentification
    console.log('🔐 Test d\'authentification...');
    const authResult = await kimlandService.forceLogin();
    
    if (authResult.success) {
      console.log('✅ Authentification réussie !');
    } else {
      console.log(`❌ Échec authentification: ${authResult.error}`);
      return;
    }

    // Test 3: Vérifier le statut après login
    const postLoginConnection = await kimlandService.checkConnection();
    console.log(`📊 Statut après login: ${postLoginConnection ? '✅ Connecté' : '❌ Non connecté'}`);

    // Test 4: Test d'un produit (si SKU disponible)
    const testSku = 'TEST-SKU-001'; // Remplacez par un SKU réel
    console.log(`🔍 Test recherche produit: ${testSku}`);
    const productInfo = await kimlandService.getProductInfo(testSku);
    
    if (productInfo.found && productInfo.product) {
      console.log('✅ Produit trouvé !');
      console.log(`   Nom: ${productInfo.product.name}`);
      console.log(`   Prix: ${productInfo.product.price}`);
      console.log(`   Variants: ${productInfo.product.variants.length}`);
    } else {
      console.log(`⚠️ Produit non trouvé: ${productInfo.error || 'Aucune raison spécifiée'}`);
    }

    // Test 5: Statistiques de session
    const sessionStats = await kimlandService.getSessionStats();
    console.log('📈 Statistiques session:', sessionStats);

    console.log('\n🎉 Tous les tests terminés !');

  } catch (error) {
    console.error('❌ Erreur lors des tests:', error instanceof Error ? error.message : error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'N/A');
  } finally {
    // Nettoyage
    kimlandService.logout();
    console.log('🔐 Session fermée.');
  }
}

// Exécution du test
if (require.main === module) {
  testKimlandAuthentication()
    .then(() => {
      console.log('Test terminé.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test échoué:', error);
      process.exit(1);
    });
}

export { testKimlandAuthentication };