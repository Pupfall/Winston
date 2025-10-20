# Winston Vercel Deployment Guide

This guide covers deploying Winston to Vercel using serverless API routes.

## Architecture

Winston has been refactored for Vercel serverless deployment:

### Express Mode (Original)
- `src/index.ts` - Express server entry point
- `src/server.ts` - Express app configuration
- `src/routes/domains.ts` - Route handlers
- Run with: `npm run dev` or `npm start`

### Vercel Mode (New)
- `api/*.ts` - Serverless API route handlers
- `src/winston.ts` - Core business logic (shared)
- Deploy with: `vercel dev` (local) or `vercel --prod` (production)

## File Structure

```
Winston/
├── api/                    # Vercel API routes
│   ├── _lib/              # Shared utilities
│   │   ├── auth.ts        # Authentication helper
│   │   └── errors.ts      # Error handling
│   ├── index.ts           # GET / - API info
│   ├── health.ts          # GET /health - Health check
│   ├── metrics.ts         # GET /metrics - Prometheus metrics
│   ├── search.ts          # POST /search - Domain search
│   ├── buy.ts             # POST /buy - Domain purchase
│   └── status/
│       └── [domain].ts    # GET /status/:domain - Domain status
├── src/
│   ├── winston.ts         # Core business logic (NEW)
│   ├── providers/         # Domain registrar providers
│   ├── db/                # Database access layer
│   ├── lib/               # Utilities (idempotency, spend tracking)
│   └── ...
├── vercel.json            # Vercel configuration
└── .vercelignore          # Files to exclude from deployment
```

## Prerequisites

1. **Node.js 18+**
2. **Vercel CLI**: `npm install -g vercel`
3. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
4. **Environment Variables** (see below)

## Environment Variables

Set these in Vercel project settings or `.env` file for local development:

### Required
```bash
# Porkbun API credentials
PORKBUN_API_KEY=your_api_key_here
PORKBUN_SECRET_KEY=your_secret_key_here

# Database (use Vercel Postgres or external provider)
DATABASE_URL=postgresql://user:password@host:5432/winston

# Contact information for domain registration
WINSTON_CONTACT_EMAIL=your@email.com
WINSTON_CONTACT_FIRST=FirstName
WINSTON_CONTACT_LAST=LastName
WINSTON_CONTACT_PHONE=+1.5555551234
WINSTON_CONTACT_ADDRESS1=123 Main St
WINSTON_CONTACT_CITY=CityName
WINSTON_CONTACT_STATE=CA
WINSTON_CONTACT_POSTAL=12345
WINSTON_CONTACT_COUNTRY=US
```

### Optional
```bash
# Provider settings
DEFAULT_PROVIDER=porkbun
DRY_RUN=false                    # Set to true to prevent actual purchases

# Spend limits
MAX_PER_TXN_USD=100              # Maximum per transaction
MAX_DAILY_USD=500                # Maximum daily spend

# Rate limiting
RATE_LIMIT_RPM=60                # Requests per minute
RATE_LIMIT_BURST=30              # Burst capacity

# Allowed TLDs (comma-separated)
ALLOWED_TLDS=com,net,org,io,app

# Logging
LOG_LEVEL=info                   # debug, info, warn, error
```

## Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Database
```bash
# Create .env file with DATABASE_URL
cp .env.example .env

# Run migrations
npx prisma migrate dev --name init
npx prisma generate

# Seed database with test API key
npm run db:seed
```

### 3. Run Locally with Vercel Dev
```bash
vercel dev
```

This starts a local Vercel development server at `http://localhost:3000`

### 4. Test Endpoints

**Health Check:**
```bash
curl http://localhost:3000/health
```

**Search Domains:**
```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"prompt": "AI chatbot", "tlds": ["com", "io"]}'
```

**Buy Domain** (requires API key from seed script):
```bash
curl -X POST http://localhost:3000/buy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key_here" \
  -d '{"domain": "example.com"}'
```

**Domain Status:**
```bash
curl http://localhost:3000/status/example.com
```

## Deployment to Vercel

### Option 1: Deploy via CLI

1. **Login to Vercel:**
   ```bash
   vercel login
   ```

2. **Deploy to Preview:**
   ```bash
   vercel
   ```

3. **Deploy to Production:**
   ```bash
   vercel --prod
   ```

### Option 2: Deploy via Git (Recommended)

1. **Push to GitHub:**
   ```bash
   git push origin main
   ```

2. **Import Project in Vercel:**
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repository
   - Configure environment variables
   - Deploy

3. **Automatic Deployments:**
   - Every push to `main` → Production deployment
   - Every PR → Preview deployment

## Environment Variables in Vercel

### Via Web UI:
1. Go to Project Settings → Environment Variables
2. Add each variable (Name + Value)
3. Select environments: Production, Preview, Development
4. Save

### Via CLI:
```bash
vercel env add PORKBUN_API_KEY production
vercel env add PORKBUN_SECRET_KEY production
vercel env add DATABASE_URL production
```

## Database Setup for Production

### Option 1: Vercel Postgres (Recommended)
```bash
vercel postgres create winston-db
vercel link
```

This automatically sets `DATABASE_URL` in your project.

### Option 2: External Postgres (Neon, Supabase, etc.)
1. Create a Postgres database
2. Add `DATABASE_URL` to Vercel environment variables
3. Run migrations:
   ```bash
   npx prisma migrate deploy
   ```

## Configuration

### vercel.json
```json
{
  "version": 2,
  "functions": {
    "api/**/*.ts": {
      "memory": 256,        // Memory limit (MB)
      "maxDuration": 15     // Timeout (seconds) - GPT Actions compatible
    }
  }
}
```

### Function Limits
- **Memory**: 256 MB (configurable up to 3008 MB on Pro plan)
- **Timeout**: 15 seconds (suitable for GPT Actions)
- **Payload**: 4.5 MB request, 4.5 MB response

## GPT Actions Integration

Winston is optimized for OpenAI GPT Actions with:
- 15-second timeout (within GPT Actions 45s limit)
- JSON-only responses
- Bearer token authentication

### GPT Actions Schema Example:

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Winston Domain API",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://your-project.vercel.app"
    }
  ],
  "components": {
    "securitySchemes": {
      "BearerAuth": {
        "type": "http",
        "scheme": "bearer"
      }
    }
  },
  "security": [
    {
      "BearerAuth": []
    }
  ],
  "paths": {
    "/search": {
      "post": {
        "summary": "Search for available domains",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "prompt": {
                    "type": "string",
                    "description": "Search prompt (e.g., 'AI chatbot for healthcare')"
                  },
                  "tlds": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "TLDs to search (e.g., ['com', 'io'])"
                  }
                },
                "required": ["prompt"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Search results",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "domains": {
                      "type": "array",
                      "items": {
                        "type": "object",
                        "properties": {
                          "domain": {"type": "string"},
                          "available": {"type": "boolean"},
                          "price": {"type": "number"},
                          "currency": {"type": "string"}
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/buy": {
      "post": {
        "summary": "Purchase a domain",
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "domain": {
                    "type": "string",
                    "description": "Domain to purchase (e.g., 'example.com')"
                  }
                },
                "required": ["domain"]
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Purchase result",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "domain": {"type": "string"},
                    "domainId": {"type": "number"},
                    "registrar": {"type": "string"},
                    "charged_total_usd": {"type": "number"},
                    "status": {"type": "string"},
                    "message": {"type": "string"}
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

## Monitoring

### View Logs:
```bash
vercel logs
vercel logs --follow  # Real-time logs
```

### Metrics:
Access Prometheus metrics at: `https://your-project.vercel.app/metrics`

### Analytics:
View in Vercel Dashboard:
- Function execution time
- Invocation count
- Error rate
- Bandwidth usage

## Troubleshooting

### Build Fails
```bash
# Check TypeScript compilation locally
npm run build

# View Vercel build logs
vercel logs --output build
```

### Function Timeout
- Increase `maxDuration` in `vercel.json` (max 60s on Pro)
- Optimize slow database queries
- Add caching for repeated operations

### Database Connection Issues
- Verify `DATABASE_URL` is set correctly
- Use connection pooling (Prisma handles this)
- Check database is accessible from Vercel's IP ranges

### Environment Variables Not Loading
- Ensure variables are set for correct environment (Production/Preview)
- Redeploy after adding new variables
- Check variable names match exactly (case-sensitive)

### Rate Limiting Not Working
- Vercel functions are stateless - rate limiting is per-instance
- Use database-backed rate limiting (current implementation)
- Consider using Vercel Edge Config for shared state

## Performance Optimization

### Cold Starts
- Keep dependencies minimal
- Use edge functions for static responses
- Enable "Always On" (Pro plan) for critical functions

### Database Queries
- Use Prisma query optimization
- Add database indexes for frequent queries
- Consider caching with Vercel KV or Redis

### Response Size
- Compress large responses
- Paginate search results
- Use streaming for large datasets

## Security

### API Keys
- Rotate keys regularly
- Use separate keys for dev/prod
- Never commit keys to git

### Database
- Use SSL connections (enabled by default in Vercel Postgres)
- Restrict database access by IP (if using external provider)
- Enable query logging for audit trail

### Rate Limiting
- Enforce on all authenticated endpoints
- Use API key-based rate limiting
- Consider adding IP-based limits for unauthenticated endpoints

## Cost Estimation

### Vercel Pricing (Hobby tier)
- 100 GB-hours function execution/month (free)
- ~60,000 requests/month at 15s avg duration

### Vercel Pricing (Pro tier - $20/month)
- 1000 GB-hours function execution/month
- ~600,000 requests/month at 15s avg duration
- Longer timeout options (up to 60s)

### Database
- Vercel Postgres: From free tier (256 MB) to $20/month (4 GB)
- External providers: Varies (Neon has generous free tier)

## Migration from Express

If you want to switch back to Express mode:

```bash
# Run Express server
npm run dev

# Or in production
npm run build
npm start
```

Both modes can coexist - choose based on your deployment target:
- **Vercel/Serverless**: Use API routes (`api/*.ts`)
- **Traditional hosting/Docker**: Use Express (`src/index.ts`)

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Node.js Runtime](https://vercel.com/docs/functions/runtimes/node-js)
- [Prisma with Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
- [OpenAI GPT Actions](https://platform.openai.com/docs/actions)
