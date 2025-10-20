# Winston

A TypeScript + Express API for searching and registering domain names through registrar providers (Porkbun).

## Features

- **Provider Abstraction**: Clean `Registrar` interface for multiple providers
- **Bulk Search**: Check availability for multiple domains at once
- **Mock Data**: PorkbunProvider with mock responses (real API integration coming)
- **TLD Allowlist**: Enforce allowed TLDs via environment config
- **Type-safe**: Full TypeScript support
- **Exportable**: App can be imported for CLI/testing
- **GPT Actions compatible**: CORS-enabled for OpenAI GPT integrations

## Quick Start

### Installation

```bash
npm install
```

### Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
PORT=3000
NODE_ENV=development

# Porkbun API Credentials
PORKBUN_API_KEY=your_api_key
PORKBUN_SECRET_KEY=your_secret_key

# TLD Allowlist (comma-separated, leave empty to allow all)
ALLOWLIST_TLDS=com,net,org,io
```

### Running the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### GET /health
Health check endpoint

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-19T12:00:00.000Z",
  "uptime": 123.45
}
```

### POST /search
Search availability for multiple domains

**Body:**
```json
{
  "domains": ["example.com", "mytest.io", "coolsite.net"]
}
```

**Response:**
```json
[
  {
    "domain": "example.com",
    "available": true,
    "price_usd": 12.0,
    "premium": false
  },
  {
    "domain": "mytest.io",
    "available": true,
    "price_usd": 12.0,
    "premium": false
  },
  {
    "domain": "coolsite.net",
    "available": false,
    "price_usd": 12.0,
    "premium": false
  }
]
```

**Example:**
```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"domains": ["example.com", "test.io"]}'
```

### POST /buy
Register a domain

**Body:**
```json
{
  "domain": "example.com",
  "years": 1,
  "privacy": true
}
```

**Response:**
```json
{
  "order_id": "PB1730000000ABC123",
  "charged_total_usd": 12.0,
  "registrar": "porkbun"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/buy \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "years": 1, "privacy": true}'
```

### GET /status/:domain
Check domain registration status

**Example:**
```bash
curl http://localhost:3000/status/example.com
```

**Response (registered):**
```json
{
  "domain": "example.com",
  "state": "active",
  "details": {
    "registered": true,
    "expiryDate": "2026-10-19",
    "autoRenew": true,
    "registrar": "porkbun",
    "nameservers": ["ns1.porkbun.com", "ns2.porkbun.com"]
  }
}
```

**Response (not found):**
```json
{
  "domain": "notregistered.com",
  "state": "not_found",
  "details": {
    "registered": false
  }
}
```

## Programmatic Usage

The Express app can be exported for testing or CLI integration:

```typescript
import { createApp } from './server';

const app = createApp();

// Use in tests, serverless functions, etc.
app.listen(3000);
```

Or use providers directly:

```typescript
import { PorkbunProvider } from './providers/porkbun';

const provider = new PorkbunProvider('api_key', 'secret_key');

// Check availability
const results = await provider.checkAvailability(['example.com', 'test.io']);

// Get quote
const quote = await provider.quote('example.com', 1, true);

// Register domain
const result = await provider.register({
  domain: 'example.com',
  years: 1,
  privacy: true,
});

// Check status
const status = await provider.status('example.com');
```

## Project Structure

```
src/
├── lib/
│   └── validation.ts         # Domain validation utilities
├── providers/
│   ├── types.ts              # Registrar interface & types
│   └── porkbun.ts            # PorkbunProvider (mock data)
├── routes/
│   └── domains.ts            # Domain routes (/search, /buy, /status)
├── server.ts                 # Express app factory
└── index.ts                  # Server entry point
```

## Adding New Providers

1. Create a new provider class extending `Registrar`:

```typescript
import { Registrar, DomainAvailability, DomainQuote, RegistrationOptions, RegistrationResult, DomainStatus } from './types';

export class NewProvider extends Registrar {
  constructor(apiKey: string) {
    super('new-provider');
  }

  async checkAvailability(domains: string[]): Promise<DomainAvailability[]> {
    // Implementation
  }

  async quote(domain: string, years: number, privacy: boolean): Promise<DomainQuote> {
    // Implementation
  }

  async register(options: RegistrationOptions): Promise<RegistrationResult> {
    // Implementation
  }

  async status(domain: string): Promise<DomainStatus> {
    // Implementation
  }
}
```

2. Update [routes/domains.ts](src/routes/domains.ts) to use the new provider

## Mock Data Details

Currently, PorkbunProvider returns mock data:

- **Pricing**: $11.82 base + $0.18 ICANN fee = $12.00 USD
- **Premium**: Domains with < 5 characters are marked as premium (10x price)
- **Availability**: Domains containing "test", "example", "my", or length > 15 are marked available
- **Order IDs**: Generated as `PB{timestamp}{random}`

## TLD Allowlist

Set `ALLOWLIST_TLDS` in `.env` to restrict which TLDs can be searched/registered:

```env
ALLOWLIST_TLDS=com,net,org,io
```

Leave empty to allow all TLDs.

## GPT Actions Integration

Winston is designed to work as a GPT Action:

- **Search**: `POST /search` with `{ domains: string[] }`
- **Buy**: `POST /buy` with `{ domain, years, privacy }`
- **Status**: `GET /status/:domain`

## License

MIT
