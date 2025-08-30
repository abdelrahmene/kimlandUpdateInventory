export interface ShopifyVariant {
  id: number;
  product_id?: number;
  title: string;
  price: string;
  sku?: string;
  position?: number;
  inventory_policy?: string;
  compare_at_price?: string | null;
  fulfillment_service?: string;
  inventory_management?: string | null;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  created_at?: string;
  updated_at?: string;
  taxable?: boolean;
  barcode?: string | null;
  grams?: number;
  weight?: number;
  weight_unit?: string;
  inventory_item_id?: number;
  inventory_quantity?: number;
  old_inventory_quantity?: number;
  requires_shipping?: boolean;
}

export interface ShopifyImage {
  id: number;
  product_id?: number;
  position?: number;
  created_at?: string;
  updated_at?: string;
  alt?: string | null;
  width?: number;
  height?: number;
  src: string;
  variant_ids?: number[];
}

export interface ShopifyOption {
  id: number;
  product_id?: number;
  name: string;
  position: number;
  values: string[];
}

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string | null;
  vendor?: string;
  product_type?: string;
  created_at?: string;
  handle?: string;
  updated_at?: string;
  published_at?: string | null;
  template_suffix?: string | null;
  published_scope?: string;
  tags?: string;
  status?: string;
  admin_graphql_api_id?: string;
  variants: ShopifyVariant[];
  options?: ShopifyOption[];
  images?: ShopifyImage[];
  image?: ShopifyImage;
}

export interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

export interface ShopifyProductResponse {
  product: ShopifyProduct;
}

export interface CreateVariantData {
  option1?: string;
  option2?: string;
  option3?: string;
  price?: string;
  sku?: string;
  inventory_quantity?: number;
  inventory_management?: string;
  inventory_policy?: string;
  weight?: number;
  weight_unit?: string;
  requires_shipping?: boolean;
}
