# Winston Vercel Deployment - Quick Start

## Files Created

### Core Business Logic
- ✅ [src/winston.ts](src/winston.ts) - Extracted search/buy/status logic from Express routes

### API Routes (Serverless Functions)
- ✅ [api/index.ts](api/index.ts) - `GET /` - API info
- ✅ [api/health.ts](api/health.ts) - `GET /health` - Health check
- ✅ [api/metrics.ts](api/metrics.ts) - `GET /metrics` - Prometheus metrics
- ✅ [api/search.ts](api/search.ts) - `POST /search` - Domain search
- ✅ [api/buy.ts](api/buy.ts) - `POST /buy` - Domain purchase
- ✅ [api/status/[domain].ts](api/status/[domain].ts) - `GET /status/:domain` - Domain status

### Helpers
- ✅ [api/_lib/auth.ts](api/_lib/auth.ts) - Authentication helper
- ✅ [api/_lib/errors.ts](api/_lib/errors.ts) - Error handling

### Configuration
- ✅ [vercel.json](vercel.json) - Vercel deployment config (256MB, 15s timeout)
- ✅ [.vercelignore](.vercelignore) - Files to exclude from deployment
- ✅ [tsconfig.json](tsconfig.json) - Updated to include `api/**/*`
- ✅ [package.json](package.json) - Added `@vercel/node` and `vercel` CLI

### Documentation
- ✅ [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) - Complete deployment guide

## Quick Start Commands

### 1. Local Development
```bash
# Install dependencies
npm install

# Set up database
npx prisma migrate dev
npx prisma generate
npm run db:seed

# Start Vercel dev server
vercel dev
```

Visit: `http://localhost:3000`

### 2. Deploy to Vercel

**Option A: CLI**
```bash
vercel login
vercel          # Preview deployment
vercel --prod   # Production deployment
```

**Option B: Git (Recommended)**
```bash
git add .
git commit -m "Add Vercel serverless deployment"
git push origin main
```

Then import your repo at [vercel.com/new](https://vercel.com/new)

## Environment Variables

Set these in Vercel project settings:

### Required
```
PORKBUN_API_KEY=your_api_key
PORKBUN_SECRET_KEY=your_secret_key
DATABASE_URL=postgresql://...
WINSTON_CONTACT_EMAIL=your@email.com
```

### Optional (with defaults)
```
DRY_RUN=false
MAX_PER_TXN_USD=100
MAX_DAILY_USD=500
RATE_LIMIT_RPM=60
ALLOWED_TLDS=com,net,org,io
```

## Test Endpoints

Once deployed (e.g., `https://winston-xyz.vercel.app`):

```bash
# Health check
curl https://winston-xyz.vercel.app/health

# Search domains
curl -X POST https://winston-xyz.vercel.app/search \
  -H "Content-Type: application/json" \
  -d '{"prompt": "AI chatbot", "tlds": ["com", "io"]}'

# Buy domain (requires API key)
curl -X POST https://winston-xyz.vercel.app/buy \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key" \
  -d '{"domain": "example.com"}'

# Check status
curl https://winston-xyz.vercel.app/status/example.com

# Metrics
curl https://winston-xyz.vercel.app/metrics
```

## Key Features

✅ **Serverless Architecture** - No server management, auto-scaling
✅ **15-second timeout** - Perfect for GPT Actions (within 45s limit)
✅ **256MB memory** - Optimized for domain operations
✅ **JSON responses** - GPT Actions compatible
✅ **Bearer token auth** - Standard OAuth2 flow
✅ **Database persistence** - Idempotency, spend tracking, audit logs
✅ **Rate limiting** - 60 req/min, burst 30
✅ **Prometheus metrics** - Monitoring and observability
✅ **Dual mode** - Can run as Express server OR Vercel serverless

## Architecture Comparison

### Express Mode (Original)
```
npm run dev → http://localhost:3000
├── src/index.ts (entry point)
├── src/server.ts (Express app)
└── src/routes/domains.ts (all routes)
```

### Vercel Mode (New)
```
vercel dev → http://localhost:3000
├── api/search.ts → /search
├── api/buy.ts → /buy
├── api/status/[domain].ts → /status/:domain
└── src/winston.ts (shared logic)
```

Both modes use the same:
- Database layer (`src/db/`)
- Providers (`src/providers/`)
- Business logic (`src/lib/`)
- Configuration (`src/config.ts`)

## Next Steps

1. **Deploy to Vercel**: `vercel --prod`
2. **Set environment variables** in Vercel dashboard
3. **Run database migrations**: `npx prisma migrate deploy`
4. **Test all endpoints** with curl or Postman
5. **Configure GPT Actions** with your Vercel URL
6. **Monitor logs**: `vercel logs --follow`

## Support

- 📖 Full guide: [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md)
- 🔧 HTTPS setup: [HTTPS_SETUP.md](HTTPS_SETUP.md)
- 🐛 Issues: Check Vercel logs and database connectivity

## Production Checklist

- [ ] Environment variables set in Vercel
- [ ] Database provisioned (Vercel Postgres or external)
- [ ] Prisma migrations applied
- [ ] Test API key created (`npm run db:seed`)
- [ ] All endpoints tested
- [ ] GPT Actions schema configured
- [ ] Monitoring set up (logs, metrics)
- [ ] Rate limits configured
- [ ] Spend caps configured
- [ ] DRY_RUN=false for production purchases

---

**Ready to deploy!** 🚀

```bash
vercel --prod
```
