const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { withRetry } = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET_KEY;
const JWT_EXPIRES = '8h';

// ─── Caché en memoria para login (reduce roundtrips a Neon en cold starts) ────
// Guarda un hash del resultado por ~5 minutos para tolerancia a latencia de Neon.
// SOLO cachea éxitos; los fallos siempre van a la BD (seguridad).
const loginCache = new Map(); // key: username → { user, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getCachedUser(username) {
  const entry = loginCache.get(username);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    loginCache.delete(username);
    return null;
  }
  return entry.user;
}

function setCachedUser(username, user) {
  loginCache.set(username, {
    user,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function invalidateCache(username) {
  loginCache.delete(username);
}

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: 'Usuario y contraseña son obligatorios' });
    }

    if (!JWT_SECRET) {
      console.error('[LOGIN] JWT_SECRET_KEY no configurada');
      return res.status(500).json({ ok: false, message: 'Error de configuración del servidor' });
    }

    const usernameClean = String(username).trim().toLowerCase();

    // 1. Intentar desde caché primero (para tolerar cold starts de Neon)
    let user = getCachedUser(usernameClean);
    let fromCache = !!user;

    // 2. Si no está en caché, ir a la BD con reintentos
    if (!user) {
      try {
        user = await withRetry(
          () => prisma.user.findUnique({ where: { username: usernameClean } }),
          3,   // 3 reintentos
          2000 // 2s base (se multiplica por intento: 2s, 4s, 6s)
        );
      } catch (dbError) {
        console.error('[LOGIN] Error de BD tras reintentos:', dbError.message);
        return res.status(503).json({
          ok: false,
          message: 'La base de datos no está disponible temporalmente. Por favor espera unos segundos e intenta de nuevo.',
          retry: true
        });
      }
    }

    // 3. Validar usuario
    if (!user || !user.isActive) {
      invalidateCache(usernameClean); // Asegurar que la caché esté limpia
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }

    // 4. Validar contraseña (bcrypt siempre, nunca cachear contraseñas)
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }

    // 5. Guardar en caché para futuros requests (sin el hash de contraseña)
    if (!fromCache) {
      setCachedUser(usernameClean, {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        apartmentId: user.apartmentId,
        passwordHash: user.passwordHash, // Necesario para la comparación de caché
      });
    }

    // 6. Generar JWT
    const token = jwt.sign(
      { sub: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    console.log(`[LOGIN] ✅ ${user.username} (${user.role}) - ${fromCache ? 'caché' : 'BD'}`);

    res.json({
      ok: true,
      access_token: token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        is_active: user.isActive,
        apartment_id: user.apartmentId
      }
    });
  } catch (error) {
    console.error('[LOGIN] Error inesperado:', error.message);
    res.status(500).json({ ok: false, message: 'Error en el servidor. Intenta de nuevo.' });
  }
};

// ─── Registro de propietario ──────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { username, full_name, password, block, number } = req.body;
    const blockUpper = (block || '').toUpperCase().trim();
    const numberStr = String(number || '').trim();

    if (!username || !full_name || !password || !blockUpper || !numberStr) {
      return res.status(400).json({ ok: false, message: 'Todos los campos son obligatorios' });
    }

    if (String(username).length < 3) {
      return res.status(400).json({ ok: false, message: 'El usuario debe tener al menos 3 caracteres' });
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const usernameClean = String(username).trim().toLowerCase();

    // Verificar usuario existente con retry
    let existingUser;
    try {
      existingUser = await withRetry(
        () => prisma.user.findUnique({ where: { username: usernameClean } }),
        3, 2000
      );
    } catch (dbError) {
      return res.status(503).json({ ok: false, message: 'Base de datos no disponible. Intenta en unos segundos.' });
    }

    if (existingUser) {
      return res.status(400).json({ ok: false, message: 'El usuario ya existe' });
    }

    // Buscar departamento
    let apartment;
    try {
      apartment = await withRetry(
        () => prisma.apartment.findUnique({
          where: { uq_apartment_block_number: { block: blockUpper, number: numberStr } }
        }),
        3, 2000
      );
    } catch (dbError) {
      return res.status(503).json({ ok: false, message: 'Base de datos no disponible. Intenta en unos segundos.' });
    }

    if (!apartment) {
      return res.status(400).json({ ok: false, message: 'No existe el departamento indicado. Contacta al administrador.' });
    }

    const existingOwner = await withRetry(
      () => prisma.user.findFirst({ where: { apartmentId: apartment.id, role: 'OWNER' } }),
      3, 2000
    );

    if (existingOwner) {
      return res.status(400).json({ ok: false, message: 'Ese departamento ya tiene un usuario registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await withRetry(
      () => prisma.user.create({
        data: {
          username: usernameClean,
          fullName: String(full_name).trim(),
          passwordHash,
          role: 'OWNER',
          isActive: true,
          apartmentId: apartment.id
        }
      }),
      3, 2000
    );

    res.status(201).json({
      ok: true,
      message: 'Cuenta creada correctamente',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        is_active: user.isActive,
        apartment_id: user.apartmentId
      }
    });
  } catch (error) {
    console.error('[REGISTER] Error:', error.message);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

// ─── Bootstrap Admin (solo si NO existe ya un admin) ─────────────────────────
exports.bootstrapAdmin = async (req, res) => {
  try {
    const { bootstrap_key, username = 'admin', full_name = 'Administrador General', password } = req.body;

    const expectedKey = process.env.BOOTSTRAP_KEY || 'bootstrap-secret-2026';
    if (bootstrap_key !== expectedKey) {
      return res.status(403).json({ ok: false, message: 'Clave de bootstrap incorrecta' });
    }

    const existingAdmin = await withRetry(
      () => prisma.user.findFirst({ where: { role: 'ADMIN' } }),
      3, 2000
    );
    if (existingAdmin) {
      return res.status(400).json({ ok: false, message: 'Ya existe un usuario administrador' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await withRetry(
      () => prisma.user.create({
        data: {
          username: String(username).trim(),
          fullName: String(full_name).trim(),
          passwordHash,
          role: 'ADMIN',
          isActive: true
        }
      }),
      3, 2000
    );

    res.status(201).json({
      ok: true,
      message: 'Administrador creado correctamente',
      user: { id: user.id, username: user.username, full_name: user.fullName, role: user.role }
    });
  } catch (error) {
    console.error('[BOOTSTRAP] Error:', error.message);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

// ─── Obtener perfil del usuario autenticado ───────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const user = await withRetry(
      () => prisma.user.findUnique({
        where: { id: req.user.sub },
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          isActive: true,
          apartmentId: true,
          createdAt: true
        }
      }),
      3, 2000
    );

    if (!user) return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });

    res.json({ ok: true, user });
  } catch (error) {
    console.error('[PROFILE] Error:', error.message);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};
