require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const ownerRoutes = require('./routes/owner');

// ─── Validación crítica de variables de entorno ───────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET_KEY'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`[FATAL] Variables de entorno faltantes: ${missingEnv.join(', ')}`);
  console.error('[FATAL] Configúralas en el panel de Vercel > Settings > Environment Variables');
}

const app = express();

// ─── Trust proxy para Vercel (necesario para rate limiting correcto) ──────────
// Vercel usa proxies, sin esto req.ip no funciona bien
app.set('trust proxy', 1);

// ─── Seguridad CORS ────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://proyectoagua2.vercel.app',
  'https://proyecto-agua-2.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
];

// Aceptar cualquier subdominio de vercel.app del proyecto
function isAllowedOrigin(origin) {
  if (!origin) return true; // Postman, curl, etc.
  if (allowedOrigins.includes(origin)) return true;
  // Permitir previews de Vercel (ej: proyecto-agua-2-xxx.vercel.app)
  if (/^https:\/\/proyecto-?agua-?2[^.]*\.vercel\.app$/.test(origin)) return true;
  if (/^https:\/\/proyectoagua2[^.]*\.vercel\.app$/.test(origin)) return true;
  return false;
}

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) return callback(null, true);
    callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(helmet());

// ─── Rate limiters ────────────────────────────────────────────────────────────
// Más permisivo para el free tier (evita bloqueos accidentales)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // 200 requests por 15min por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas peticiones. Intenta nuevamente en unos minutos.' },
  // Saltar si la IP es interna de Vercel
  skip: (req) => req.ip === '127.0.0.1',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 intentos de login por 15min (más tolerante para testing)
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos de autenticación. Espera 15 minutos.' },
  skip: (req) => req.ip === '127.0.0.1',
});

app.use(limiter);

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/owner', ownerRoutes);

// ─── Health check con info de DB ──────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const health = {
    ok: true,
    status: 'operational',
    timestamp: new Date().toISOString(),
    env: {
      database: !!process.env.DATABASE_URL,
      jwt: !!process.env.JWT_SECRET_KEY,
    }
  };

  // Test rápido de BD (sin fallar el health check si la BD está lenta)
  try {
    const prisma = require('./lib/prisma');
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ]);
    health.database = 'connected';
  } catch (err) {
    health.database = 'unavailable';
    health.db_error = err.message?.substring(0, 100);
    // No marcar como error total, el servidor sigue vivo
  }

  res.json(health);
});

// ─── Ping para "wake up" de Neon (sin autenticación) ─────────────────────────
// El frontend puede llamar esto antes del login para despertar a Neon
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Recurso no encontrado' });
});

// ─── Error global ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);

  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ ok: false, message: 'Origen no permitido' });
  }

  // Errores de Prisma / BD
  if (err.code && (err.code.startsWith('P') || err.code === 'ECONNREFUSED')) {
    console.error('[DB ERROR] Código:', err.code);
    return res.status(503).json({
      ok: false,
      message: 'Error de conexión a la base de datos. La base de datos puede estar iniciando (5-10s). Intenta de nuevo.',
      retry: true
    });
  }

  res.status(500).json({ ok: false, message: 'Error interno del servidor' });
});

// Exportar la app para Vercel Serverless
module.exports = app;

// Si estamos en entorno local, levantar el servidor
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor AguaPago corriendo en http://localhost:${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔑 Login: POST http://localhost:${PORT}/api/auth/login\n`);
  });
}
