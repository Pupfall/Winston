import axios from 'axios';
import { Provider } from './Provider';
import {
  DomainSearchResult,
  DomainPurchaseRequest,
  DomainPurchaseResult,
  DomainStatusResult,
  ProviderConfig,
} from '../types';

export class NamecheapProvider extends Provider {
  private baseUrl = 'https://api.namecheap.com/xml.response';
  private sandboxUrl = 'https://api.sandbox.namecheap.com/xml.response';

  constructor(config: ProviderConfig) {
    super(config);
  }

  private getApiUrl() {
    return process.env.NODE_ENV === 'production' ? this.baseUrl : this.sandboxUrl;
  }

  private buildParams(command: string, extraParams: Record<string, string> = {}) {
    return {
      ApiUser: this.config.apiUser || this.config.username,
      ApiKey: this.config.apiKey,
      UserName: this.config.username,
      ClientIp: this.config.clientIp,
      Command: command,
      ...extraParams,
    };
  }

  async search(domain: string): Promise<DomainSearchResult> {
    try {
      const params = this.buildParams('namecheap.domains.check', {
        DomainList: domain,
      });

      const response = await axios.get(this.getApiUrl(), { params });
      const data = response.data;

      // Parse XML response (simplified - in production use xml2js)
      const available = data.includes('Available="true"');
      const priceMatch = data.match(/YourPrice="([^"]+)"/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : undefined;

      return {
        domain,
        available,
        price,
        currency: 'USD',
        provider: this.getName(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Namecheap API error: ${error.message}`);
      }
      throw error;
    }
  }

  async purchase(request: DomainPurchaseRequest): Promise<DomainPurchaseResult> {
    try {
      const contact = request.contact;
      if (!contact) {
        throw new Error('Contact information is required for Namecheap');
      }

      const params = this.buildParams('namecheap.domains.create', {
        DomainName: request.domain,
        Years: (request.years || 1).toString(),
        // Add contact info params
        FirstName: contact.firstName,
        LastName: contact.lastName,
        Address1: contact.address,
        City: contact.city,
        StateProvince: contact.state,
        PostalCode: contact.postalCode,
        Country: contact.country,
        Phone: contact.phone,
        EmailAddress: contact.email,
      });

      const response = await axios.get(this.getApiUrl(), { params });
      const success = response.data.includes('CommandResponse Status="OK"');
      const orderIdMatch = response.data.match(/OrderID="([^"]+)"/);

      return {
        success,
        domain: request.domain,
        orderId: orderIdMatch ? orderIdMatch[1] : undefined,
        message: success ? 'Domain registered successfully' : 'Registration failed',
        provider: this.getName(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          domain: request.domain,
          message: error.message,
          provider: this.getName(),
        };
      }
      throw error;
    }
  }

  async status(domain: string): Promise<DomainStatusResult> {
    try {
      const params = this.buildParams('namecheap.domains.getInfo', {
        DomainName: domain,
      });

      const response = await axios.get(this.getApiUrl(), { params });
      const data = response.data;

      const registered = data.includes('CommandResponse Status="OK"');
      const expiryMatch = data.match(/Expires="([^"]+)"/);
      const statusMatch = data.match(/Status="([^"]+)"/);

      return {
        domain,
        registered,
        expiryDate: expiryMatch ? expiryMatch[1] : undefined,
        status: statusMatch ? statusMatch[1] : undefined,
        provider: this.getName(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Domain not found likely means not registered
        return {
          domain,
          registered: false,
          provider: this.getName(),
        };
      }
      throw error;
    }
  }
}
