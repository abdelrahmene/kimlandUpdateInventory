# 🔍 Guide de Debug avec les Nouveaux Logs Shopify

## 🚀 Comment tester :

1. **Lancez le serveur avec logs détaillés** :
   ```bash
   test-detailed-logs.bat
   ```

2. **Testez une synchronisation** sur le produit ID8763

3. **Ouvrez le fichier de logs** :
   ```
   logs/shopify-updates.log
   ```

## 🔎 Que regarder dans les logs :

### ✅ **Si tout fonctionne bien, vous devriez voir :**
```
🔄 SYNC START
📦 KIMLAND FOUND (avec 6 variants et stock total)
🏪 SHOPIFY PRODUCT (avec 6 variants existants)
🐛 DEBUG VARIANT_MATCHING (correspondances trouvées)
📊 STOCK UPDATE (pour chaque variant)
🏷️ SKU UPDATE (si nécessaire)
📤📥 API REQUEST/RESPONSE (toutes les requêtes)
✅ INVENTORY OK (confirmations)
🏁 SYNC COMPLETE (statistiques finales)
```

### ❌ **Si ça ne fonctionne pas, cherchez :**

1. **Erreurs de permissions** :
   ```
   ❌ API ERROR | {"status":403,"errorData":"Insufficient permissions"}
   ```

2. **Variants non trouvés** :
   ```
   🐛 DEBUG VARIANT_MATCHING | {"matchFound":false}
   ```

3. **Erreurs de création** :
   ```
   🐛 DEBUG CREATE_VARIANT_FAILED
   ```

4. **Problèmes d'inventaire** :
   ```
   ❌ INVENTORY FAIL | {"variantId":"...","error":"..."}
   ```

## 🎯 **Points critiques à vérifier :**

### 1. **Les correspondances de variants**
```json
🐛 DEBUG VARIANT_MATCHING | {
  "kimlandSize": "40",
  "shopifySize": "40", 
  "matchFound": true
}
```

### 2. **Les requêtes API et leurs réponses**
```json
📤 API REQUEST | {"method":"POST","url":"...variants.json","payload":"..."}
📥 API RESPONSE | {"status":201,"success":true,"response":"..."}
```

### 3. **Les mises à jour SKU**
```json
🏷️ SKU UPDATE | {"variantId":"...","oldSku":"","newSku":"ADIDAS-GALAXY-7-W-40","success":true}
```

### 4. **Les erreurs détaillées**
```json
🐛 DEBUG VARIANT_ERROR | {"kimlandSize":"40","error":"...","stack":"..."}
```

## 📊 **Statistiques finales attendues :**
```json
🏁 SYNC COMPLETE | {"sku":"ID8763","updates":6,"creates":0,"errors":0}
```

- **updates**: Nombre de variants mis à jour
- **creates**: Nombre de nouveaux variants créés  
- **errors**: Nombre d'erreurs

**Maintenant vous avez une visibilité complète sur tout ce qui se passe ! 🎉**
