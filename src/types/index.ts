export interface ShopifyConfig {
  apiKey: string;
  apiSecret: string;
  scopes: string;
  apiVersion: string;
  webhookSecret: string;
  redirectUri: string;
}

export interface FirebaseConfig {
  projectId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  appUrl: string;
  sessionSecret: string;
  shopify: ShopifyConfig;
  firebase: FirebaseConfig;
  collections: {
    shops: string;
    products: string;
    extractions: string;
    analytics: string;
  };
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  logging: {
    level: string;
    file: string;
  };
}

export interface ShopifyProduct {
  id: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  handle: string;
  status: string;
  variants: ShopifyVariant[];
  images?: ShopifyImage[];
  created_at: string;
  updated_at: string;
}

export interface ShopifyVariant {
  id: number;
  title: string;
  option1?: string;
  option2?: string;
  option3?: string;
  price: string;
  sku?: string;
  barcode?: string;
  inventory_quantity?: number;
  inventory_management?: string;
  inventory_policy: string;
  weight?: number;
  compare_at_price?: string;
}

export interface ShopifyImage {
  id: number;
  src: string;
  alt?: string;
  position: number;
  width?: number;
  height?: number;
}

export interface ProcessedProduct {
  id: number;
  title: string;
  reference?: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  variants: ProcessedVariant[];
  total_inventory: number;
  variants_count: number;
  display_summary: string;
  has_ref: boolean;
  total_stock: number;
}

export interface ProcessedVariant {
  id: number;
  title: string;
  sku?: string;
  price: string;
  inventory_quantity: number;
}

export interface ProductsResponse {
  success: boolean;
  products?: ProcessedProduct[];
  stats?: {
    totalCount: number;
    displayedCount: number;
    withRefCount: number;
    totalStock: number;
  };
  metadata?: {
    total_products_fetched: number;
  };
  error?: string;
  message?: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  error?: string;
  install_url?: string;
}

export interface ShopData {
  shop: string;
  id: string;
  name: string;
  domain: string;
  myshopifyDomain: string;
  accessToken: string;
  email: string;
  country: string;
  currency: string;
  planName: string;
  installedAt: Date;
  isActive: boolean;
  scopes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
