// Test d'accès aux tokens et APIs Shopify
import { config } from './src/config';
import { firebaseService } from './src/services/firebase.service';
import { shopifyApiService } from './src/services/shopify-api.service';
import { logger } from './src/utils/logger';

async function getAccessTokenAndTestAPI() {
  try {
    console.log('🔍 Recherche des boutiques installées...');
    
    // Récupérer toutes les boutiques actives de Firebase
    const shops = await firebaseService.getAllShops();
    console.log(`📊 ${shops.length} boutiques trouvées`);
    
    if (shops.length === 0) {
      console.log('❌ Aucune boutique trouvée. Installez d\'abord l\'application sur une boutique Shopify.');
      return;
    }
    
    // Utiliser la première boutique trouvée
    const shop = shops[0];
    console.log(`🏪 Boutique sélectionnée: ${shop.name} (${shop.myshopifyDomain})`);
    console.log(`🔑 Access Token: ${shop.accessToken.substring(0, 20)}...${shop.accessToken.substring(shop.accessToken.length - 10)}`);
    
    // Test de connexion
    console.log('🔗 Test de connexion...');
    const isConnected = await shopifyApiService.testConnection(shop.myshopifyDomain, shop.accessToken);
    console.log(`📡 Connexion: ${isConnected ? '✅ OK' : '❌ Échec'}`);
    
    if (!isConnected) {
      console.log('❌ Connexion échouée. Token peut-être expiré.');
      return;
    }
    
    // Récupérer les produits
    console.log('📦 Récupération des produits...');
    const products = await shopifyApiService.getProducts(shop.myshopifyDomain, shop.accessToken, { limit: 10 });
    console.log(`📊 ${products.length} produits récupérés`);
    
    if (products.length === 0) {
      console.log('❌ Aucun produit trouvé dans la boutique.');
      return;
    }
    
    // Afficher les produits avec leurs variants
    console.log('\\n🛍️ Liste des produits:');
    products.forEach((product, index) => {
      console.log(`\\n${index + 1}. ${product.title}`);
      console.log(`   ID: ${product.id}`);
      console.log(`   Status: ${product.status}`);
      console.log(`   Variants (${product.variants.length}):`);
      
      product.variants.forEach((variant, vIndex) => {
        const sku = variant.sku || 'Pas de SKU';
        const stock = variant.inventory_quantity || 0;
        const size = variant.option1 || variant.option2 || variant.option3 || 'N/A';
        console.log(`     ${vIndex + 1}. ${variant.title} | SKU: ${sku} | Taille: ${size} | Stock: ${stock}`);
      });
    });
    
    // Rechercher le produit avec SKU "IH3576"
    console.log('\\n🔍 Recherche du produit avec SKU "IH3576"...');
    let targetProduct = null;
    let targetVariant = null;
    
    for (const product of products) {
      for (const variant of product.variants) {
        if (variant.sku === 'IH3576') {
          targetProduct = product;
          targetVariant = variant;
          break;
        }
      }
      if (targetProduct) break;
    }
    
    if (targetProduct && targetVariant) {
      console.log('\\n✅ Produit trouvé:');
      console.log(`📦 Produit: ${targetProduct.title}`);
      console.log(`🔖 Variant: ${targetVariant.title}`);
      console.log(`📊 Stock actuel: ${targetVariant.inventory_quantity}`);
      console.log(`💰 Prix: ${targetVariant.price}`);
      console.log(`⚖️ Poids: ${targetVariant.weight}g`);
      
      if (targetVariant.option1 || targetVariant.option2 || targetVariant.option3) {
        console.log(`📏 Taille/Option: ${targetVariant.option1 || targetVariant.option2 || targetVariant.option3}`);
      }
    } else {
      console.log('❌ Produit avec SKU "IH3576" non trouvé.');
      console.log('\\n💡 SKUs disponibles:');
      products.forEach(product => {
        product.variants.forEach(variant => {
          if (variant.sku) {
            console.log(`   - ${variant.sku} (${product.title} - ${variant.title})`);
          }
        });
      });
    }
    
    // Informations pour les requêtes curl
    console.log('\\n🌐 Informations pour requêtes API:');
    console.log(`Shop: ${shop.myshopifyDomain}`);
    console.log(`Access Token: ${shop.accessToken}`);
    console.log(`API Base URL: https://${shop.myshopifyDomain}/admin/api/${config.shopify.apiVersion}`);
    
  } catch (error) {
    console.error('❌ Erreur:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('Stack:', error.stack);
    }
  }
}

// Exécution
if (require.main === module) {
  getAccessTokenAndTestAPI();
}
