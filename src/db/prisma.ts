/**
 * Prisma Client Singleton
 *
 * Best practice: reuse a single PrismaClient instance across the application
 * to avoid connection pool exhaustion.
 *
 * Usage:
 *   import { prisma } from './db/prisma';
 *   const user = await prisma.user.findUnique({ where: { email: 'user@example.com' } });
 */

import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting database connections due to hot reloading in development.
const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Gracefully disconnect Prisma on process termination
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}

// Handle shutdown signals
process.on('SIGINT', async () => {
  await disconnectPrisma();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await disconnectPrisma();
  process.exit(0);
});
