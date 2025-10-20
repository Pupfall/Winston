/**
 * Winston API Entry Point
 *
 * IMPORTANT: dotenv must be loaded BEFORE any other imports
 * to ensure environment variables are available to all modules
 */

// Load environment variables FIRST (before any other imports)
import dotenv from 'dotenv';
dotenv.config();

// Log environment variable loading status
console.log('🔧 Environment variables loaded');
console.log(`   PORKBUN_API_KEY: ${process.env.PORKBUN_API_KEY ? '✓ Set' : '✗ Missing'}`);
console.log(`   PORKBUN_SECRET_KEY: ${process.env.PORKBUN_SECRET_KEY ? '✓ Set' : '✗ Missing'}`);
console.log(`   DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '✗ Missing'}`);
console.log(`   USE_HTTPS: ${process.env.USE_HTTPS || 'false'}`);
console.log('');

// Now import everything else AFTER dotenv is configured
import fs from 'fs';
import https from 'https';
import http from 'http';
import { createApp } from './app';
import { validateConfig, PORT, NODE_ENV, getAllowedTlds, MAX_PER_TXN_USD, MAX_DAILY_USD } from './config';

async function startServer() {
  try {
    // Validate configuration before starting
    validateConfig();

    const app = createApp();
    const useHttps = process.env.USE_HTTPS === 'true';
    const port = parseInt(process.env.PORT || (useHttps ? '443' : '3000'), 10);

    if (useHttps) {
      // HTTPS mode with mkcert certificates
      try {
        const cert = fs.readFileSync('certs/localhost.pem');
        const key = fs.readFileSync('certs/localhost-key.pem');

        https.createServer({ key, cert }, app).listen(port, () => {
          console.log(`✅ Winston API running on https://localhost${port !== 443 ? ':' + port : ''}`);
          console.log(`   Environment: ${NODE_ENV}`);
          console.log(`\n📡 Endpoints:`);
          console.log(`   GET  https://localhost${port !== 443 ? ':' + port : ''}/`);
          console.log(`   GET  https://localhost${port !== 443 ? ':' + port : ''}/health`);
          console.log(`   GET  https://localhost${port !== 443 ? ':' + port : ''}/metrics`);
          console.log(`   POST https://localhost${port !== 443 ? ':' + port : ''}/search`);
          console.log(`   POST https://localhost${port !== 443 ? ':' + port : ''}/buy`);
          console.log(`   GET  https://localhost${port !== 443 ? ':' + port : ''}/status/:domain`);
          console.log(`\n⚙️  Configuration:`);
          console.log(`   Allowed TLDs: ${getAllowedTlds().join(', ')}`);
          console.log(`   Max per transaction: $${MAX_PER_TXN_USD}`);
          console.log(`   Max daily: $${MAX_DAILY_USD}`);
          console.log(`\n🔒 Note: Using HTTPS with mkcert certificates`);
          if (port === 443) {
            console.log(`         Run with: sudo npm run dev`);
          }
        });
      } catch (error) {
        console.error('❌ Failed to start HTTPS server:');
        console.error('   Make sure certificates exist in certs/ directory');
        console.error('   Run: mkdir -p certs && cd certs && mkcert localhost');
        throw error;
      }
    } else {
      // HTTP mode (default)
      http.createServer(app).listen(port, () => {
        console.log(`✅ Winston API running on http://localhost:${port}`);
        console.log(`   Environment: ${NODE_ENV}`);
        console.log(`\n📡 Endpoints:`);
        console.log(`   GET  http://localhost:${port}/`);
        console.log(`   GET  http://localhost:${port}/health`);
        console.log(`   GET  http://localhost:${port}/metrics`);
        console.log(`   POST http://localhost:${port}/search`);
        console.log(`   POST http://localhost:${port}/buy`);
        console.log(`   GET  http://localhost:${port}/status/:domain`);
        console.log(`\n⚙️  Configuration:`);
        console.log(`   Allowed TLDs: ${getAllowedTlds().join(', ')}`);
        console.log(`   Max per transaction: $${MAX_PER_TXN_USD}`);
        console.log(`   Max daily: $${MAX_DAILY_USD}`);
      });
    }
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
