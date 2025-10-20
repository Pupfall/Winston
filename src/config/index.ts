import dotenv from 'dotenv';
import { ProviderName } from '../types';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  defaultProvider: (process.env.DEFAULT_PROVIDER || 'porkbun') as ProviderName,

  porkbun: {
    apiKey: process.env.PORKBUN_API_KEY || '',
    secretKey: process.env.PORKBUN_SECRET_KEY || '',
  },

  namecheap: {
    apiUser: process.env.NAMECHEAP_API_USER || '',
    apiKey: process.env.NAMECHEAP_API_KEY || '',
    username: process.env.NAMECHEAP_USERNAME || '',
    clientIp: process.env.NAMECHEAP_CLIENT_IP || '',
  },
};

export function validateConfig() {
  const errors: string[] = [];

  if (config.defaultProvider === 'porkbun') {
    if (!config.porkbun.apiKey) errors.push('PORKBUN_API_KEY is required');
    if (!config.porkbun.secretKey) errors.push('PORKBUN_SECRET_KEY is required');
  }

  if (config.defaultProvider === 'namecheap') {
    if (!config.namecheap.apiKey) errors.push('NAMECHEAP_API_KEY is required');
    if (!config.namecheap.username) errors.push('NAMECHEAP_USERNAME is required');
    if (!config.namecheap.clientIp) errors.push('NAMECHEAP_CLIENT_IP is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
