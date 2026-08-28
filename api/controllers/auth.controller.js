const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const JWT_SECRET = process.env.JWT_SECRET_KEY || 'dev-jwt-secret-change-in-production';

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: 'Usuario y contraseña son obligatorios' });
    }

    const user = await prisma.user.findUnique({ where: { username } });

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
      { expiresIn: '8h' }
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
    console.error(error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

exports.register = async (req, res) => {
  try {
    const { username, full_name, password, block, number } = req.body;
    const blockUpper = (block || '').toUpperCase();

    if (!username || !full_name || !password || !blockUpper || !number) {
      return res.status(400).json({ ok: false, message: 'Todos los campos son obligatorios' });
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ ok: false, message: 'El usuario ya existe' });
    }

    const apartment = await prisma.apartment.findUnique({
      where: {
        uq_apartment_block_number: { block: blockUpper, number: String(number) }
      }
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

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        fullName: full_name,
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
    console.error(error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

exports.bootstrapAdmin = async (req, res) => {
  try {
    const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (existingAdmin) {
      return res.status(400).json({ ok: false, message: 'Ya existe un usuario administrador' });
    }

    const { username = 'admin', full_name = 'Administrador General', password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        fullName: full_name,
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
        role: user.role,
        is_active: user.isActive,
        apartment_id: user.apartmentId
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};
