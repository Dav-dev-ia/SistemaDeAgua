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

// Aceptar subdominios de Vercel y cualquier puerto de localhost/127.0.0.1
function isAllowedOrigin(origin) {
  if (!origin) return true; // Postman, curl, SSR, serverless
  if (allowedOrigins.includes(origin)) return true;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return true;
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return true;
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
const isDev = process.env.NODE_ENV !== 'production';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300, // 300 requests por 15min
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas peticiones. Intenta nuevamente en unos minutos.' },
  skip: (req) => isDev || req.ip === '127.0.0.1' || req.ip === '::1',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // 50 intentos de login por 15min
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos de autenticación. Espera 15 minutos.' },
  skip: (req) => isDev || req.ip === '127.0.0.1' || req.ip === '::1',
});

app.use(limiter);

// ─── Health check con info de DB (disponible en /api/health y /health) ────────
const healthHandler = async (req, res) => {
  const health = {
    ok: true,
    status: 'operational',
    timestamp: new Date().toISOString(),
    env: {
      database: !!process.env.DATABASE_URL,
      jwt: !!process.env.JWT_SECRET_KEY,
    }
  };

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
  }

  res.json(health);
};

const pingHandler = (req, res) => {
  res.json({ ok: true, ts: Date.now() });
};

// ─── Rutas (soporta prefijos con y sin /api para compatibilidad en Vercel) ─────
app.get('/api/health', healthHandler);
app.get('/health', healthHandler);

app.get('/api/ping', pingHandler);
app.get('/ping', pingHandler);

app.use('/api/auth', authLimiter, authRoutes);
app.use('/auth', authLimiter, authRoutes);

app.use('/api/admin', adminRoutes);
app.use('/admin', adminRoutes);

app.use('/api/owner', ownerRoutes);
app.use('/owner', ownerRoutes);


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
