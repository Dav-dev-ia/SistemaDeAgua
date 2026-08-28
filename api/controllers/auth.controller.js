const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET_KEY;
const JWT_EXPIRES = '8h';

// ─── Login ────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: 'Usuario y contraseña son obligatorios' });
    }

    const user = await prisma.user.findUnique({ where: { username: String(username).trim() } });

    // Mismo mensaje para usuario inválido y contraseña incorrecta (seguridad)
    if (!user || !user.isActive) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

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
    console.error('Error en login:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
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

    const existingUser = await prisma.user.findUnique({ where: { username: String(username).trim() } });
    if (existingUser) {
      return res.status(400).json({ ok: false, message: 'El usuario ya existe' });
    }

    const apartment = await prisma.apartment.findUnique({
      where: { uq_apartment_block_number: { block: blockUpper, number: numberStr } }
    });

    if (!apartment) {
      return res.status(400).json({ ok: false, message: 'No existe el departamento indicado. Contacta al administrador.' });
    }

    const existingOwner = await prisma.user.findFirst({
      where: { apartmentId: apartment.id, role: 'OWNER' }
    });

    if (existingOwner) {
      return res.status(400).json({ ok: false, message: 'Ese departamento ya tiene un usuario registrado' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username: String(username).trim(),
        fullName: String(full_name).trim(),
        passwordHash,
        role: 'OWNER',
        isActive: true,
        apartmentId: apartment.id
      }
    });

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
    console.error('Error en register:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

// ─── Bootstrap Admin (solo si NO existe ya un admin) ─────────────────────────
// NOTA: Esta ruta debe deshabilitarse en producción después de crear el primer admin
exports.bootstrapAdmin = async (req, res) => {
  try {
    // Verificar clave secreta de bootstrap para evitar uso malicioso
    const { bootstrap_key, username = 'admin', full_name = 'Administrador General', password } = req.body;

    const expectedKey = process.env.BOOTSTRAP_KEY || 'bootstrap-secret-2026';
    if (bootstrap_key !== expectedKey) {
      return res.status(403).json({ ok: false, message: 'Clave de bootstrap incorrecta' });
    }

    const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (existingAdmin) {
      return res.status(400).json({ ok: false, message: 'Ya existe un usuario administrador' });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        username: String(username).trim(),
        fullName: String(full_name).trim(),
        passwordHash,
        role: 'ADMIN',
        isActive: true
      }
    });

    res.status(201).json({
      ok: true,
      message: 'Administrador creado correctamente',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error en bootstrapAdmin:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

// ─── Obtener perfil del usuario autenticado ───────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
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
    });

    if (!user) return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });

    res.json({ ok: true, user });
  } catch (error) {
    console.error('Error en getProfile:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};
