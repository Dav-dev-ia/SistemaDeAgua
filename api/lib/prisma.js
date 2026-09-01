const { PrismaClient } = require('@prisma/client');

// ─── Singleton pattern para entornos serverless ───────────────────────────────
// Neon free tier puede tardar hasta 5-10s en "despertar" (scale from zero).
// Este cliente implementa reintentos automáticos y connection management.

const globalForPrisma = globalThis;

/**
 * Crea un PrismaClient con la configuración óptima para Neon + Vercel serverless.
 * - connection_limit=1: evita agotar las 5 conexiones del plan free de Neon
 * - connect_timeout=30: da tiempo al "wake up" de Neon (cold start ~5-10s)
 * - pool_timeout=30: espera a que haya una conexión disponible
 * - socket_timeout=30: evita timeouts prematuros en queries largas
 */
function createPrismaClient() {
  // Construir URL con parámetros óptimos para serverless/free tier
  let dbUrl = process.env.DATABASE_URL || '';
  
  // Asegurar parámetros críticos para Neon serverless en la URL del pooler
  if (dbUrl && !dbUrl.includes('connection_limit')) {
    const separator = dbUrl.includes('?') ? '&' : '?';
    dbUrl = `${dbUrl}${separator}connection_limit=1&pool_timeout=30&connect_timeout=30`;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: {
      db: { url: dbUrl },
    },
  });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

// En desarrollo, cachear para evitar múltiples instancias con hot-reload
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Ejecuta una operación de BD con reintentos automáticos.
 * Útil cuando Neon free tier está "durmiendo" (scale-from-zero).
 * 
 * @param {Function} operation - Función async que ejecuta la query Prisma
 * @param {number} retries - Número máximo de reintentos (default: 3)
 * @param {number} delayMs - Delay base entre reintentos en ms (default: 2000)
 */
async function withRetry(operation, retries = 3, delayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const isConnectionError =
        err.code === 'P1001' || // Can't reach database server
        err.code === 'P1008' || // Operations timed out
        err.code === 'P1017' || // Server closed the connection
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('connection') ||
        err.message?.includes('timeout') ||
        err.message?.includes('socket');

      if (!isConnectionError || attempt === retries) {
        throw err;
      }

      const wait = delayMs * attempt; // Backoff exponencial
      console.warn(`[DB] Intento ${attempt}/${retries} falló. Reintentando en ${wait}ms... (${err.code || err.message?.substring(0, 50)})`);
      await new Promise((resolve) => setTimeout(resolve, wait));

      // Reconectar el cliente si hubo error de conexión
      try {
        await prisma.$disconnect();
        await prisma.$connect();
      } catch (reconnectErr) {
        console.warn('[DB] Error al reconectar:', reconnectErr.message?.substring(0, 100));
      }
    }
  }
  throw lastError;
}

module.exports = prisma;
module.exports.withRetry = withRetry;
