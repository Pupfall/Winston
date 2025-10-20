import axios from 'axios';
import { Provider } from './Provider';
import {
  DomainSearchResult,
  DomainPurchaseRequest,
  DomainPurchaseResult,
  DomainStatusResult,
  ProviderConfig,
} from '../types';

export class PorkbunProvider extends Provider {
  private baseUrl = 'https://porkbun.com/api/json/v3';

  constructor(config: ProviderConfig) {
    super(config);
  }

  private getAuthPayload() {
    return {
      apikey: this.config.apiKey,
      secretapikey: this.config.secretKey,
    };
  }

  async search(domain: string): Promise<DomainSearchResult> {
    try {
      const response = await axios.post(`${this.baseUrl}/pricing/get`, {
        ...this.getAuthPayload(),
      });

      if (response.data.status !== 'SUCCESS') {
        throw new Error(response.data.message || 'Failed to fetch pricing');
      }

      const tld = domain.split('.').pop();
      const pricing = response.data.pricing[tld || ''];

      // Check availability
      const availResponse = await axios.post(`${this.baseUrl}/domain/check/${domain}`, {
        ...this.getAuthPayload(),
      });

      const available = availResponse.data.status === 'SUCCESS' &&
                       availResponse.data.available === 1;

      return {
        domain,
        available,
        price: pricing?.registration ? parseFloat(pricing.registration) : undefined,
        currency: 'USD',
        provider: this.getName(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Porkbun API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  async purchase(request: DomainPurchaseRequest): Promise<DomainPurchaseResult> {
    try {
      const response = await axios.post(`${this.baseUrl}/domain/create/${request.domain}`, {
        ...this.getAuthPayload(),
        years: request.years || 1,
        // Porkbun can use default contact info from account
      });

      return {
        success: response.data.status === 'SUCCESS',
        domain: request.domain,
        orderId: response.data.orderId?.toString(),
        message: response.data.message,
        provider: this.getName(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          domain: request.domain,
          message: error.response?.data?.message || error.message,
          provider: this.getName(),
        };
      }
      throw error;
    }
  }

  async status(domain: string): Promise<DomainStatusResult> {
    try {
      const response = await axios.post(`${this.baseUrl}/domain/listAll`, {
        ...this.getAuthPayload(),
      });

      if (response.data.status !== 'SUCCESS') {
        throw new Error(response.data.message || 'Failed to fetch domain list');
      }

      const domainInfo = response.data.domains?.find(
        (d: { domain: string }) => d.domain === domain
      );

      if (!domainInfo) {
        return {
          domain,
          registered: false,
          provider: this.getName(),
        };
      }

      return {
        domain,
        registered: true,
        expiryDate: domainInfo.expireDate,
        status: domainInfo.status,
        provider: this.getName(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Porkbun API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }
}
