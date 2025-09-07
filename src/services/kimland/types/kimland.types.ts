export interface KimlandCredentials {
  email: string;
  username: string;
  password: string;
}

export interface KimlandVariant {
  size: string;
  stock: number;
}

export interface KimlandProduct {
  id: string;
  name: string;
  url: string;
  price: string;
  oldPrice?: string;
  variants: KimlandVariant[];
  imageUrl: string;
}

export interface ProductScore {
  total: number;
  hasLink: number;
  hasImage: number;
  hasTitle: number;
  hasPrice: number;
  skuMatch: number;
  nameMatch: number;
}

export interface PageAnalysis {
  containsSkuInText: boolean;
  hasErrorMessage: boolean;
  hasNoResultsMessage: boolean;
}

export interface CandidateProduct {
  element: Element;
  selector: string;
  score: number;
  scoreDetails: ProductScore;
}
