export interface DomainSearchResult {
  domain: string;
  available: boolean;
  price?: number;
  currency?: string;
  provider: string;
}

export interface DomainPurchaseRequest {
  domain: string;
  years?: number;
  contact?: ContactInfo;
}

export interface ContactInfo {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface DomainPurchaseResult {
  success: boolean;
  domain: string;
  orderId?: string;
  message?: string;
  provider: string;
}

export interface DomainStatusResult {
  domain: string;
  registered: boolean;
  expiryDate?: string;
  status?: string;
  provider: string;
}

export interface ProviderConfig {
  name: string;
  apiKey: string;
  secretKey?: string;
  apiUser?: string;
  username?: string;
  clientIp?: string;
}

export type ProviderName = 'porkbun' | 'namecheap';
