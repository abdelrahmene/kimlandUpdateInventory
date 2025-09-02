import axios from 'axios';
import { logger } from '../utils/logger';

export interface GraphQLResponse<T = any> {
  data?: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

export interface ProductVariant {
  id: string;
  title: string;
  inventoryQuantity: number;
  selectedOptions: Array<{
    name: string;
    value: string;
  }>;
}

export interface Product {
  id: string;
  title: string;
  variants: {
    edges: Array<{
      node: ProductVariant;
    }>;
  };
  options: Array<{
    id: string;
    name: string;
    values: string[];
  }>;
}

class ShopifyGraphQLService {
  async executeQuery<T>(
    shop: string,
    accessToken: string,
    query: string,
    variables?: any
  ): Promise<GraphQLResponse<T>> {
    try {
      const response = await axios.post(
        `https://${shop}/admin/api/2024-10/graphql.json`,
        {
          query,
          variables
        },
        {
          headers: {
            'X-Shopify-Access-Token': accessToken,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('📡 GraphQL Request', {
        shop,
        query: query.substring(0, 100) + '...',
        variables,
        responseStatus: response.status
      });

      return response.data;
    } catch (error: any) {
      logger.error('❌ GraphQL Error', {
        shop,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }

  async getProduct(shop: string, accessToken: string, productId: string): Promise<Product | null> {
    const query = `
      query getProduct($id: ID!) {
        product(id: $id) {
          id
          title
          options {
            id
            name
            values
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                inventoryQuantity
                selectedOptions {
                  name
                  value
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      id: `gid://shopify/Product/${productId}`
    };

    const response = await this.executeQuery<{ product: Product }>(
      shop,
      accessToken,
      query,
      variables
    );

    if (response.errors) {
      logger.error('❌ GraphQL getProduct errors', response.errors);
      return null;
    }

    return response.data?.product || null;
  }

  async createProductVariant(
    shop: string,
    accessToken: string,
    productId: string,
    optionValues: string[],
    inventoryQuantity: number = 0
  ): Promise<ProductVariant | null> {
    const query = `
      mutation productVariantCreate($input: ProductVariantInput!) {
        productVariantCreate(input: $input) {
          productVariant {
            id
            title
            inventoryQuantity
            selectedOptions {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        productId: `gid://shopify/Product/${productId}`,
        options: optionValues,
        inventoryQuantity,
        inventoryManagement: 'SHOPIFY',
        inventoryPolicy: 'DENY'
      }
    };

    logger.info('🔄 Creating variant via GraphQL', {
      shop,
      productId,
      optionValues,
      inventoryQuantity
    });

    const response = await this.executeQuery<{
      productVariantCreate: {
        productVariant: ProductVariant;
        userErrors: Array<{ field: string; message: string }>;
      };
    }>(shop, accessToken, query, variables);

    if (response.errors) {
      logger.error('❌ GraphQL createProductVariant errors', response.errors);
      return null;
    }

    const result = response.data?.productVariantCreate;
    
    if (result?.userErrors && result.userErrors.length > 0) {
      logger.error('❌ GraphQL createProductVariant user errors', result.userErrors);
      return null;
    }

    if (result?.productVariant) {
      logger.info('✅ Variant created via GraphQL', {
        variantId: result.productVariant.id,
        title: result.productVariant.title
      });
    }

    return result?.productVariant || null;
  }

  async updateInventory(
    shop: string,
    accessToken: string,
    variantId: string,
    quantity: number
  ): Promise<boolean> {
    // D'abord, récupérer l'inventory item ID
    const getInventoryQuery = `
      query getInventoryItem($id: ID!) {
        productVariant(id: $id) {
          inventoryItem {
            id
          }
        }
      }
    `;

    const inventoryResponse = await this.executeQuery<{
      productVariant: {
        inventoryItem: { id: string };
      };
    }>(shop, accessToken, getInventoryQuery, {
      id: variantId.startsWith('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`
    });

    const inventoryItemId = inventoryResponse.data?.productVariant?.inventoryItem?.id;
    
    if (!inventoryItemId) {
      logger.error('❌ Could not find inventory item ID');
      return false;
    }

    // Ensuite, récupérer l'ID de location
    const getLocationsQuery = `
      query getLocations {
        locations(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    `;

    const locationsResponse = await this.executeQuery<{
      locations: {
        edges: Array<{
          node: { id: string };
        }>;
      };
    }>(shop, accessToken, getLocationsQuery);

    const locationId = locationsResponse.data?.locations?.edges?.[0]?.node?.id;
    
    if (!locationId) {
      logger.error('❌ Could not find location ID');
      return false;
    }

    // Enfin, mettre à jour l'inventaire
    const updateInventoryQuery = `
      mutation inventorySetOnHandQuantities($input: InventorySetOnHandQuantitiesInput!) {
        inventorySetOnHandQuantities(input: $input) {
          inventoryAdjustmentGroup {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const updateResponse = await this.executeQuery<{
      inventorySetOnHandQuantities: {
        inventoryAdjustmentGroup: { id: string };
        userErrors: Array<{ field: string; message: string }>;
      };
    }>(shop, accessToken, updateInventoryQuery, {
      input: {
        setQuantities: [
          {
            inventoryItemId,
            locationId,
            quantity
          }
        ]
      }
    });

    if (updateResponse.data?.inventorySetOnHandQuantities?.userErrors?.length > 0) {
      logger.error('❌ GraphQL inventory update errors', 
        updateResponse.data.inventorySetOnHandQuantities.userErrors);
      return false;
    }

    logger.info('✅ Inventory updated via GraphQL', {
      variantId,
      quantity
    });

    return true;
  }
}

export const shopifyGraphQLService = new ShopifyGraphQLService();
