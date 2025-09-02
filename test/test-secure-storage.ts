import { secureStoreService } from '../src/storage/secure-store.service';
import { logger } from '../src/utils/logger';

async function testSecureStorage() {
  console.log('🔧 Test du service de stockage sécurisé...');
  
  try {
    const testShop = 'test-boutique.myshopify.com';
    const testToken = 'shpat_test_token_12345';
    const testScope = 'read_products,write_products';
    
    console.log('\n1️⃣ Test de sauvegarde...');
    await secureStoreService.saveShopAuth(testShop, testToken, testScope);
    console.log('✅ Sauvegarde réussie');
    
    console.log('\n2️⃣ Test de récupération...');
    const retrievedAuth = await secureStoreService.getShopAuth(testShop);
    console.log('✅ Récupération réussie:', {
      shop: retrievedAuth?.shop,
      hasToken: !!retrievedAuth?.accessToken,
      tokenMatch: retrievedAuth?.accessToken === testToken,
      scope: retrievedAuth?.scope,
      isValid: retrievedAuth?.isValid
    });
    
    console.log('\n3️⃣ Test de vérification d\'authentification...');
    const isAuthenticated = await secureStoreService.isShopAuthenticated(testShop);
    console.log('✅ Authentification vérifiée:', isAuthenticated);
    
    console.log('\n4️⃣ Test de récupération de token uniquement...');
    const token = await secureStoreService.getShopToken(testShop);
    console.log('✅ Token récupéré:', token === testToken);
    
    console.log('\n5️⃣ Test des statistiques...');
    const stats = await secureStoreService.getAuthStats();
    console.log('✅ Statistiques:', stats);
    
    console.log('\n6️⃣ Test d\'invalidation...');
    await secureStoreService.invalidateShopAuth(testShop);
    const isStillAuthenticated = await secureStoreService.isShopAuthenticated(testShop);
    console.log('✅ Invalidation réussie:', !isStillAuthenticated);
    
    console.log('\n7️⃣ Test de suppression...');
    await secureStoreService.deleteShopAuth(testShop);
    const deletedAuth = await secureStoreService.getShopAuth(testShop);
    console.log('✅ Suppression réussie:', !deletedAuth);
    
    console.log('\n🎉 Tous les tests sont passés avec succès!');
    
  } catch (error) {
    console.error('❌ Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Exécuter les tests
if (require.main === module) {
  testSecureStorage().then(() => {
    console.log('\n✅ Tests terminés');
    process.exit(0);
  }).catch(error => {
    console.error('❌ Tests échoués:', error);
    process.exit(1);
  });
}

export { testSecureStorage };
