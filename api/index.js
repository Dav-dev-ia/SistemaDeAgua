'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const c = require('./controllers');
const prisma = require('./prisma');

const app = express();

// ─── Validación crítica de variables de entorno ───────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'JWT_SECRET_KEY'];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`[FATAL] Variables de entorno faltantes: ${missingEnv.join(', ')}`);
}

app.set('trust proxy', 1);

// ─── CORS restringido a orígenes conocidos ────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5000',
  'http://127.0.0.1:5173',
  /^https:\/\/cobro-agua[^/]*\.vercel\.app$/,
  /^https:\/\/sistema-de-agua[^/]*\.vercel\.app$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const allowed = allowedOrigins.some((o) =>
      o instanceof RegExp ? o.test(origin) : o === origin
    );
    if (allowed) return cb(null, true);
    return cb(new Error('CORS origin not allowed'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(helmet());

// ─── Rate limiters ────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV !== 'production';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas peticiones. Intenta nuevamente en unos minutos.' },
  skip: (req) => isDev || req.ip === '127.0.0.1' || req.ip === '::1',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos de autenticación. Espera 15 minutos.' },
  skip: (req) => isDev || req.ip === '127.0.0.1' || req.ip === '::1',
});

app.use(limiter);

// ─── Auth middlewares ─────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET_KEY;

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, message: 'Token expirado. Por favor inicia sesión de nuevo.' });
    }
    return res.status(401).json({ ok: false, message: 'Token inválido' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'ADMIN') return next();
  return res.status(403).json({ ok: false, message: 'Acceso denegado. Se requiere rol de administrador.' });
}

function requireOwner(req, res, next) {
  if (req.user && (req.user.role === 'OWNER' || req.user.role === 'ADMIN')) return next();
  return res.status(403).json({ ok: false, message: 'Acceso denegado.' });
}

function requireAdminNotSelf(req, res, next) {
  if (req.user.role === 'ADMIN' && String(req.params.id) !== String(req.user.sub)) return next();
  return res.status(403).json({ ok: false, message: 'No puedes desactivar tu propia cuenta.' });
}

// ─── Health / Ping ────────────────────────────────────────────────────────────
const healthHandler = async (req, res) => {
  const health = {
    ok: true,
    status: 'operational',
    timestamp: new Date().toISOString(),
    env: { database: !!process.env.DATABASE_URL, jwt: !!process.env.JWT_SECRET_KEY },
  };
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
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

app.get('/api/health', healthHandler);
app.get('/health', healthHandler);
app.get('/api/ping', pingHandler);
app.get('/ping', pingHandler);

// ─── Auth ─────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', authLimiter, c.login);
app.post('/auth/login', authLimiter, c.login);
app.post('/api/auth/register', c.register);
app.post('/auth/register', c.register);
app.post('/api/auth/bootstrap-admin', c.bootstrapAdmin);
app.post('/auth/bootstrap-admin', c.bootstrapAdmin);
app.get('/api/auth/profile', verifyToken, c.getProfile);
app.get('/auth/profile', verifyToken, c.getProfile);

// ─── Admin (solo rol ADMIN) ───────────────────────────────────────────────────
const adminAuth = [verifyToken, requireAdmin];

app.get('/api/admin/dashboard', ...adminAuth, c.getDashboard);
app.get('/admin/dashboard', ...adminAuth, c.getDashboard);
app.get('/api/admin/blocks', ...adminAuth, c.getBlocks);
app.get('/admin/blocks', ...adminAuth, c.getBlocks);
app.get('/api/admin/users', ...adminAuth, c.getUsers);
app.get('/admin/users', ...adminAuth, c.getUsers);
app.patch('/api/admin/users/:id', ...adminAuth, requireAdminNotSelf, c.updateUser);
app.patch('/admin/users/:id', ...adminAuth, requireAdminNotSelf, c.updateUser);

app.get('/api/admin/apartments', ...adminAuth, c.getApartments);
app.get('/admin/apartments', ...adminAuth, c.getApartments);
app.post('/api/admin/apartments', ...adminAuth, c.createApartment);
app.post('/admin/apartments', ...adminAuth, c.createApartment);
app.put('/api/admin/apartments/:id', ...adminAuth, c.updateApartment);
app.put('/admin/apartments/:id', ...adminAuth, c.updateApartment);
app.delete('/api/admin/apartments/:id', ...adminAuth, c.deleteApartment);
app.delete('/admin/apartments/:id', ...adminAuth, c.deleteApartment);

app.get('/api/admin/periods', ...adminAuth, c.getPeriods);
app.get('/admin/periods', ...adminAuth, c.getPeriods);
app.post('/api/admin/periods', ...adminAuth, c.createPeriod);
app.post('/admin/periods', ...adminAuth, c.createPeriod);
app.post('/api/admin/periods/:id/readings', ...adminAuth, c.saveReadings);
app.post('/admin/periods/:id/readings', ...adminAuth, c.saveReadings);
app.post('/api/admin/periods/:id/settle', ...adminAuth, c.settlePeriod);
app.post('/admin/periods/:id/settle', ...adminAuth, c.settlePeriod);
app.get('/api/admin/periods/:id/allocations', ...adminAuth, c.getAllocations);
app.get('/admin/periods/:id/allocations', ...adminAuth, c.getAllocations);

app.post('/api/admin/allocations/:id/payments', ...adminAuth, c.registerPayment);
app.post('/admin/allocations/:id/payments', ...adminAuth, c.registerPayment);

// ─── Owner (OWNER o ADMIN) ────────────────────────────────────────────────────
app.get('/api/owner/dashboard', verifyToken, requireOwner, c.ownerGetDashboard);
app.get('/owner/dashboard', verifyToken, requireOwner, c.ownerGetDashboard);
app.get('/api/owner/payments', verifyToken, requireOwner, c.ownerGetPaymentHistory);
app.get('/owner/payments', verifyToken, requireOwner, c.ownerGetPaymentHistory);

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

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ ok: false, message: 'JSON inválido en el cuerpo de la petición.' });
  }

  if (err.code && (err.code.startsWith('P') || err.code === 'ECONNREFUSED')) {
    console.error('[DB ERROR] Código:', err.code);
    return res.status(503).json({
      ok: false,
      message: 'Error de conexión a la base de datos. La base de datos puede estar iniciando (5-10s). Intenta de nuevo.',
      retry: true,
    });
  }

  res.status(500).json({ ok: false, message: 'Error interno del servidor' });
});

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`\n Servidor AguaPago corriendo en http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Login: POST http://localhost:${PORT}/api/auth/login\n`);
  });
}