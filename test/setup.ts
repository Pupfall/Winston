/**
 * Jest test setup
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.PORKBUN_API_KEY = 'test_key';
process.env.PORKBUN_SECRET_KEY = 'test_secret';
process.env.NAMECHEAP_API_USER = 'test_user';
process.env.NAMECHEAP_API_KEY = 'test_key';
process.env.NAMECHEAP_USERNAME = 'test_user';
process.env.NAMECHEAP_CLIENT_IP = '127.0.0.1';
process.env.MAX_PER_TXN_USD = '1000';
process.env.MAX_DAILY_USD = '5000';
