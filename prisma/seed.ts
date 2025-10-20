/**
 * Database Seed Script
 *
 * Creates test data for local development:
 * - Test user: dev@winston.local
 * - API key for authentication
 *
 * Run: npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...\n');

  // Generate API key
  const apiKey = randomUUID();

  // Create or update test user
  const user = await prisma.user.upsert({
    where: { email: 'dev@winston.local' },
    update: {},
    create: {
      email: 'dev@winston.local',
    },
  });

  console.log('✓ Created user:', user.email);
  console.log('  User ID:', user.id);

  // Create or update API key
  const existingKey = await prisma.apiKey.findFirst({
    where: { userId: user.id },
  });

  let key;
  if (existingKey) {
    // Update existing key
    key = await prisma.apiKey.update({
      where: { id: existingKey.id },
      data: { key: apiKey },
    });
    console.log('✓ Updated API key');
  } else {
    // Create new key
    key = await prisma.apiKey.create({
      data: {
        key: apiKey,
        userId: user.id,
      },
    });
    console.log('✓ Created API key');
  }

  console.log('\n' + '='.repeat(80));
  console.log('🎉 Seed complete!\n');
  console.log('Test User:');
  console.log('  Email:', user.email);
  console.log('  User ID:', user.id);
  console.log('\nAPI Key:');
  console.log('  ' + key.key);
  console.log('\n' + '='.repeat(80));
  console.log('\n📋 Usage Examples:\n');
  console.log('# Search for domains');
  console.log(`curl -H "Authorization: Bearer ${key.key}" \\`);
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -X POST http://localhost:3000/search \\');
  console.log('     -d \'{"prompt":"agent ai","tlds":["com","io"]}\'\n');

  console.log('# Check health');
  console.log('curl http://localhost:3000/health\n');

  console.log('# Get API info');
  console.log('curl http://localhost:3000/\n');

  console.log('💡 Tip: Save the API key to your .env file as TEST_API_KEY for easy access\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
