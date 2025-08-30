const express = require('express');
const { firebaseService } = require('./dist/services/firebase.service.js');
const { memoryStorage } = require('./dist/storage/memory-storage.service.js');

async function getToken() {
  const shop = '8e1994-3a.myshopify.com';
  
  console.log('🔍 Recherche access token...');
  
  // Essayer mémoire
  try {
    const token = await memoryStorage.getShopToken(shop);
    if (token) {
      console.log('✅ Token trouvé en mémoire:');
      console.log(token);
      return;
    }
  } catch (e) {
    console.log('❌ Erreur mémoire:', e.message);
  }
  
  // Essayer Firebase
  try {
    const token = await firebaseService.getShopToken(shop);
    if (token) {
      console.log('✅ Token trouvé dans Firebase:');
      console.log(token);
      return;
    }
  } catch (e) {
    console.log('❌ Erreur Firebase:', e.message);
  }
  
  console.log('❌ Aucun token trouvé. Utilisez le lien d\'installation.');
}

getToken().catch(console.error);