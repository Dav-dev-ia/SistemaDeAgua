const { PrismaClient } = require('@prisma/client');

// ─── Singleton pattern para entornos serverless ───────────────────────────────
// En desarrollo, el hot-reload de Node crea múltiples instancias de PrismaClient
// lo que agota las conexiones disponibles. Este patrón lo evita.
// En Vercel, cada invocación es un proceso frío (cold start), pero al menos
// evitamos múltiples clientes dentro de la misma invocación.

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    // connection_limit=1 es óptimo para funciones serverless (Vercel/Neon free tier)
    // evita agotar las 5 conexiones máximas del plan gratuito de Neon
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });

// Solo cachear la instancia en desarrollo (en producción cada cold start es nuevo proceso)
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
