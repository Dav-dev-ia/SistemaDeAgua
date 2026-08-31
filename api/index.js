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
  // No hacemos process.exit() para no romper el cold start de Vercel,
  // pero los endpoints fallarán con mensajes claros
}

const app = express();

// ─── Seguridad CORS: solo permite el frontend de producción y localhost ────────
const allowedOrigins = [
  'https://proyectoagua2.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000'
];

app.use(cors({
  origin: (origin, callback) => {
    // Permite peticiones sin origin (Postman, curl, apps móviles)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Origen no permitido por CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '1mb' }));
app.use(helmet()); // Seguridad HTTP headers

// Limitador global (puede ser ajustado por ruta si es necesario)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // Limita a 100 peticiones por ventana por IP
  message: { ok: false, message: 'Demasiadas peticiones. Intenta nuevamente más tarde.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 15, // Solo 15 intentos de login/registro
  message: { ok: false, message: 'Demasiados intentos de autenticación. Espera 15 minutos.' }
});

app.use(limiter);

// ─── Rutas ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/owner', ownerRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API AguaPago operativa (Node.js)', timestamp: new Date().toISOString() });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ ok: false, message: 'Recurso no encontrado' });
});

// ─── Error global ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  // Errores de CORS
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ ok: false, message: 'Origen no permitido' });
  }
  // Errores de Prisma / base de datos
  if (err.code && (err.code.startsWith('P') || err.code === 'ECONNREFUSED')) {
    console.error('[DB ERROR] Código:', err.code);
    return res.status(503).json({ ok: false, message: 'Error de conexión a la base de datos. Intenta de nuevo en unos segundos.' });
  }
  res.status(500).json({ ok: false, message: 'Error interno del servidor' });
});

// Exportamos la app para que Vercel Serverless pueda usarla
module.exports = app;

// Si estamos en entorno local, levantamos el servidor
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Servidor Node.js corriendo en el puerto ${PORT}`);
  });
}
