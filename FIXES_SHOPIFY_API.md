# Corrections API Shopify - Version 2024-10

## Problème Identifié
L'application utilisait l'ancienne version de l'API Shopify (2023-10) et des permissions obsolètes, ce qui causait l'erreur:
- "Cette application peut être retirée de la liste"
- "Appels de rupture d'API passés"
- Erreur 403 Forbidden pour les locations

## Corrections Apportées

### 1. Mise à jour de la version d'API
- **Fichier**: `src/config/index.ts`
- **Changement**: `apiVersion: '2023-10'` → `apiVersion: '2024-10'`

### 2. Correction des permissions (scopes)
- **Fichiers**: `.env` et `.env.example`
- **Anciens scopes**: `read_products,read_inventory`
- **Nouveaux scopes**: `read_products,write_products,read_inventory,write_inventory,read_locations`

### 3. Ajout du scope read_locations
Conformément aux exigences Shopify 2024-10, l'accès aux locations nécessite maintenant le scope `read_locations`.

## Détails des Changements

### src/config/index.ts
```typescript
// AVANT
apiVersion: process.env.SHOPIFY_API_VERSION || '2023-10'

// APRÈS  
apiVersion: process.env.SHOPIFY_API_VERSION || '2024-10'
```

### .env
```bash
# AVANT
SHOPIFY_SCOPES=read_products,read_inventory
SHOPIFY_API_VERSION=2023-10

# APRÈS
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory,read_locations
SHOPIFY_API_VERSION=2024-10
```

### .env.example
Même modifications pour le fichier exemple.

## Prochaines Étapes

### 1. Rebuild de l'Application
```bash
npm run build
```

### 2. Redémarrage du Serveur
```bash
npm start
```

### 3. Nouvelle Installation de l'App
⚠️ **IMPORTANT**: L'utilisateur doit **réinstaller l'application** sur Shopify pour que les nouvelles permissions soient accordées.

1. Se rendre sur: `https://admin.shopify.com/store/VOTRE-STORE/settings/apps`
2. Désinstaller l'app "Kimland References Manager" 
3. Réinstaller l'app via votre URL d'installation
4. Accepter les nouvelles permissions

### 4. Vérification
- Tester l'accès aux produits
- Tester la mise à jour de l'inventaire
- Vérifier l'accès aux locations

## Services Déjà Compatibles

Le code existant dans `src/services/shopify-api.service.ts` gère déjà:
- ✅ La nouvelle API locations (méthode `getLocations`)
- ✅ La mise à jour d'inventaire moderne (`updateInventoryLevelModern`)
- ✅ Le fallback vers l'ancienne API si nécessaire
- ✅ La gestion des erreurs de permissions 403

## Notes Techniques

- Les méthodes d'API dans ShopifyApiService sont déjà compatibles 2024-10
- Le système de fallback permet une transition en douceur
- Les logs détaillés aident au debugging des problèmes de permissions

## Statut
✅ **Corrections terminées** - Prêt pour la réinstallation
