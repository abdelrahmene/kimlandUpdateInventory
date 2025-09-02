const axios = require('axios');

// Appel à votre serveur local pour récupérer un produit (cela affichera le token dans les logs)
axios.get('http://localhost:5000/api/products?shop=8e1994-3a.myshopify.com&limit=1')
  .then(response => {
    console.log('✅ Requête réussie - vérifiez les logs du serveur pour voir le token');
  })
  .catch(error => {
    console.log('❌ Erreur:', error.response?.status, error.message);
    console.log('Réponse:', error.response?.data);
  });