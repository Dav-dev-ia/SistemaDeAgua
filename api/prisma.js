'use strict';

// ─── PrismaClient singleton para entornos serverless + helpers de transformación ──

const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

function createPrismaClient() {
  let dbUrl = process.env.DATABASE_URL || '';

  if (dbUrl && !dbUrl.includes('connection_limit')) {
    const separator = dbUrl.includes('?') ? '&' : '?';
    dbUrl = `${dbUrl}${separator}connection_limit=1&pool_timeout=30&connect_timeout=30`;
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    datasources: { db: { url: dbUrl } },
  });
}

const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

async function withRetry(operation, retries = 3, delayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;
      const isConnectionError =
        err.code === 'P1001' ||
        err.code === 'P1008' ||
        err.code === 'P1017' ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('connection') ||
        err.message?.includes('timeout') ||
        err.message?.includes('socket');

      if (!isConnectionError || attempt === retries) {
        throw err;
      }

      const wait = delayMs * attempt;
      console.warn(`[DB] Intento ${attempt}/${retries} falló. Reintentando en ${wait}ms... (${err.code || err.message?.substring(0, 50)})`);
      await new Promise((resolve) => setTimeout(resolve, wait));

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

// ─── Transformación camelCase ↔ snake_case ────────────────────────────────────
const toSnakeCase = (str) => str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
const toCamelCase = (str) => str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

const transformKeys = (obj, transformer) => {
  if (Array.isArray(obj)) return obj.map((v) => transformKeys(v, transformer));
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((result, key) => {
      result[transformer(key)] = transformKeys(obj[key], transformer);
      return result;
    }, {});
  }
  return obj;
};

const toSnakeCaseObj = (obj) => transformKeys(obj, toSnakeCase);
const toCamelCaseObj = (obj) => transformKeys(obj, toCamelCase);

module.exports = prisma;
module.exports.withRetry = withRetry;
module.exports.toSnakeCase = toSnakeCase;
module.exports.toCamelCase = toCamelCase;
module.exports.toSnakeCaseObj = toSnakeCaseObj;
module.exports.toCamelCaseObj = toCamelCaseObj;