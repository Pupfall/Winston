import {
  DomainSearchResult,
  DomainPurchaseRequest,
  DomainPurchaseResult,
  DomainStatusResult,
  ProviderConfig,
} from '../types';

export abstract class Provider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract search(domain: string): Promise<DomainSearchResult>;
  abstract purchase(request: DomainPurchaseRequest): Promise<DomainPurchaseResult>;
  abstract status(domain: string): Promise<DomainStatusResult>;

  getName(): string {
    return this.config.name;
  }
}
