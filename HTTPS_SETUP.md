# HTTPS Setup for Winston

Winston supports HTTPS for local development, which is useful for:
- Testing with GPT Actions (requires HTTPS)
- Secure local development
- Browser security features that require HTTPS

## Prerequisites

- macOS/Linux with Homebrew (or manual mkcert installation)
- Node.js 18+

## Installation Steps

### 1. Install mkcert

```bash
# macOS
brew install mkcert nss

# Linux
# See https://github.com/FiloSottile/mkcert#installation
```

### 2. Install Local CA

```bash
mkcert -install
```

This installs a local Certificate Authority (CA) that your system will trust.

**Note**: On macOS, you'll be prompted for your password to add the CA to the system trust store.

### 3. Generate Certificates

```bash
mkdir -p certs
cd certs
mkcert localhost
```

This creates:
- `certs/localhost.pem` - Certificate
- `certs/localhost-key.pem` - Private key

### 4. Enable HTTPS

Update your `.env` file:

```bash
USE_HTTPS=true
PORT=443  # Or use 8443 to avoid needing sudo
```

### 5. Start Server

**Option A: Port 443 (requires sudo)**

```bash
sudo npm run dev
```

**Option B: Port 8443 (no sudo required)**

```bash
PORT=8443 USE_HTTPS=true npm run dev
```

The server will be available at:
- Port 443: `https://localhost`
- Port 8443: `https://localhost:8443`

## Using with GPT Actions

### GPT Actions Configuration

In your GPT Actions schema:

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "Winston Domain API",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "https://localhost"
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
                  "prompt": { "type": "string" },
                  "tlds": { "type": "array", "items": { "type": "string" } }
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

### Authentication

GPT Actions will prompt the user for their API key (Bearer token).

Get your API key from Winston's database:

```bash
# Run the seed script to get a test API key
npm run db:seed

# Or query the database directly
sqlite3 prisma/dev.db "SELECT key FROM ApiKey LIMIT 1;"
```

## Troubleshooting

### Certificate Not Trusted

If your browser shows a certificate warning:

1. Run `mkcert -install` again
2. Restart your browser
3. Check that the CA is installed: `mkcert -CAROOT`

### Port 443 Permission Denied

**Solution 1**: Use a non-privileged port:
```bash
PORT=8443 USE_HTTPS=true npm run dev
```

**Solution 2**: Grant Node.js permission (macOS):
```bash
sudo setcap 'cap_net_bind_service=+ep' $(which node)
```

**Solution 3**: Use sudo:
```bash
sudo npm run dev
```

### Certificates Expired

mkcert certificates expire after 825 days. Regenerate them:

```bash
cd certs
rm localhost*.pem
mkcert localhost
```

## Development vs Production

**Development (HTTPS with mkcert)**:
- Self-signed certificates for localhost
- Trusted by your local machine only
- Perfect for GPT Actions testing

**Production (HTTPS with Let's Encrypt)**:
- Use a reverse proxy like nginx/Caddy
- Automatic SSL certificate management
- Publicly trusted certificates
- Example with Caddy:
  ```
  winston.example.com {
    reverse_proxy localhost:3000
  }
  ```

## Security Notes

1. **Never commit certificates** - The `certs/` directory is in `.gitignore`
2. **Use environment variables** - Don't hardcode ports or HTTPS settings
3. **Rotate API keys** - Regenerate test keys regularly
4. **Production setup** - Use proper SSL certificates (Let's Encrypt) in production

## Additional Resources

- [mkcert Documentation](https://github.com/FiloSottile/mkcert)
- [GPT Actions Documentation](https://platform.openai.com/docs/actions)
- [Let's Encrypt](https://letsencrypt.org/)
