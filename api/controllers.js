'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');
const { withRetry } = require('./prisma');
const { distributeInvoice, buildBreakdown, computePending } = require('./calc');

const JWT_SECRET = process.env.JWT_SECRET_KEY;
const JWT_EXPIRES = '8h';

// ─── Caché en memoria para login (tolera cold-starts de Neon) ─────────────────
const loginCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

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
  loginCache.set(username, { user, expiresAt: Date.now() + CACHE_TTL_MS });
}
function invalidateCache(username) {
  loginCache.delete(username);
}

// ─── Helpers de mapeo a snake_case (frontend) ─────────────────────────────────
const toNum = (v) => (v === null || v === undefined ? 0 : Number(v));

const mapApartment = (apt) => ({
  id: apt.id,
  block: apt.block,
  number: apt.number,
  owner_name: apt.ownerName,
  phone: apt.phone,
  coefficient: toNum(apt.coefficient),
  is_active: apt.isActive,
  created_at: apt.createdAt,
  meter: apt.meters && apt.meters.length > 0
    ? { id: apt.meters[0].id, code: apt.meters[0].code, is_inverted: apt.meters[0].isInverted, is_active: apt.meters[0].isActive }
    : null,
  user: apt.users && apt.users.length > 0
    ? { id: apt.users[0].id, username: apt.users[0].username, is_active: apt.users[0].isActive }
    : null,
});

const mapPeriod = (p) => ({
  id: p.id,
  code: p.code,
  status: p.status,
  total_common_amount_bs: toNum(p.totalCommonAmountBs),
  general_total_consumption_m3: toNum(p.generalTotalConsumptionM3),
  total_individual_consumption_m3: toNum(p.totalIndividualConsumptionM3),
  common_difference_m3: toNum(p.commonDifferenceM3),
  distributed_total_bs: toNum(p.distributedTotalBs),
  created_at: p.createdAt,
  closed_at: p.closedAt,
});

const mapPayment = (p) => ({
  id: p.id,
  amount_bs: toNum(p.amountBs),
  payment_method: p.paymentMethod,
  reference: p.reference,
  created_at: p.createdAt,
});

const mapAllocation = (a) => {
  const pending = computePending(a.amountDueBs, a.amountPaidBs);
  return {
    id: a.id,
    period_id: a.periodId,
    apartment_id: a.apartmentId,
    consumption_m3: toNum(a.consumptionM3),
    effective_m3: toNum(a.effectiveM3),
    percentage_share: toNum(a.percentageShare),
    amount_due_bs: toNum(a.amountDueBs),
    amount_paid_bs: toNum(a.amountPaidBs),
    pending_amount_bs: pending,
    status: a.status,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    breakdown: a.breakdownJson ? safeParse(a.breakdownJson) : null,
    apartment: a.apartment ? mapApartment({ ...a.apartment, meters: a.apartment.meters || [] }) : null,
    period: a.period ? mapPeriod(a.period) : null,
    payments: (a.payments || []).map(mapPayment),
  };
};

const safeParse = (str) => {
  try { return JSON.parse(str); } catch { return null; }
};

// ═══════════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════════

async function findUserByUsername(username) {
  return prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });
}

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ ok: false, message: 'Usuario y contraseña son obligatorios' });
    }
    if (!JWT_SECRET) {
      return res.status(500).json({ ok: false, message: 'Error de configuración del servidor' });
    }

    const usernameClean = String(username).trim().toLowerCase();

    let user = getCachedUser(usernameClean);
    let fromCache = !!user;

    if (!user) {
      try {
        user = await withRetry(() => findUserByUsername(usernameClean), 3, 2000);
      } catch (dbError) {
        console.error('[LOGIN] Error de BD tras reintentos:', dbError.message);
        return res.status(503).json({
          ok: false,
          message: 'La base de datos no está disponible temporalmente. Por favor espera unos segundos e intenta de nuevo.',
          retry: true,
        });
      }
    }

    if (!user) {
      invalidateCache(usernameClean);
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }

    if (!user.isActive) {
      invalidateCache(usernameClean);
      return res.status(403).json({
        ok: false,
        message: 'Tu cuenta está pendiente de activación por el administrador.',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ ok: false, message: 'Credenciales inválidas' });
    }

    if (!fromCache) {
      setCachedUser(usernameClean, {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        apartmentId: user.apartmentId,
        passwordHash: user.passwordHash,
      });
    }

    const token = jwt.sign(
      { sub: user.id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});

    console.log(`[LOGIN] OK ${user.username} (${user.role}) - ${fromCache ? 'caché' : 'BD'}`);

    res.json({
      ok: true,
      access_token: token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        is_active: user.isActive,
        apartment_id: user.apartmentId,
      },
    });
  } catch (error) {
    console.error('[LOGIN] Error inesperado:', error.message);
    res.status(500).json({ ok: false, message: 'Error en el servidor. Intenta de nuevo.' });
  }
};

// Registro de adjudicatario → queda PENDIENTE de activación por el admin
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

    const existingUser = await withRetry(() => findUserByUsername(usernameClean), 3, 2000);
    if (existingUser) return res.status(400).json({ ok: false, message: 'El usuario ya existe' });

    const apartment = await withRetry(
      () => prisma.apartment.findUnique({
        where: { uq_apartment_block_number: { block: blockUpper, number: numberStr } },
      }),
      3, 2000
    );
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

    // Seguridad: las cuentas creadas por autoservicio requieren activación del admin
    const user = await withRetry(
      () => prisma.user.create({
        data: {
          username: usernameClean,
          fullName: String(full_name).trim(),
          passwordHash,
          role: 'OWNER',
          isActive: false,
          apartmentId: apartment.id,
        },
      }),
      3, 2000
    );

    res.status(201).json({
      ok: true,
      message: 'Cuenta creada. El administrador debe activarla antes de que puedas iniciar sesión.',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        is_active: user.isActive,
        apartment_id: user.apartmentId,
      },
    });
  } catch (error) {
    console.error('[REGISTER] Error:', error.message);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

// Bootstrap Admin: exige BOOTSTRAP_KEY (sin fallback hardcodeado)
exports.bootstrapAdmin = async (req, res) => {
  try {
    const { bootstrap_key, username = 'admin', full_name = 'Administrador General', password } = req.body;

    const expectedKey = process.env.BOOTSTRAP_KEY;
    if (!expectedKey) {
      return res.status(503).json({ ok: false, message: 'Bootstrap no configurado en el servidor.' });
    }
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
    const adminUsernameClean = String(username).trim().toLowerCase();

    const user = await withRetry(
      () => prisma.user.create({
        data: {
          username: adminUsernameClean,
          fullName: String(full_name).trim(),
          passwordHash,
          role: 'ADMIN',
          isActive: true,
        },
      }),
      3, 2000
    );

    res.status(201).json({
      ok: true,
      message: 'Administrador creado correctamente',
      user: { id: user.id, username: user.username, full_name: user.fullName, role: user.role },
    });
  } catch (error) {
    console.error('[BOOTSTRAP] Error:', error.message);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await withRetry(
      () => prisma.user.findUnique({
        where: { id: req.user.sub },
        select: {
          id: true, username: true, fullName: true, role: true, isActive: true,
          apartmentId: true, createdAt: true, lastLoginAt: true,
        },
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

// ═══════════════════════════════════════════════════════════════
//  ADMIN
// ═══════════════════════════════════════════════════════════════

exports.getDashboard = async (req, res) => {
  try {
    const totalApartments = await prisma.apartment.count();
    const openPeriod = await prisma.billingPeriod.findFirst({ where: { status: 'OPEN' } });
    const recentPeriods = await prisma.billingPeriod.findMany({ orderBy: { id: 'desc' }, take: 5 });

    const allAllocations = await prisma.allocation.findMany({
      select: { amountDueBs: true, amountPaidBs: true, status: true },
    });
    const totalCollected = Math.round(allAllocations.reduce((s, a) => s + toNum(a.amountPaidBs), 0) * 100) / 100;
    const totalPending = Math.round(
      allAllocations
        .filter((a) => a.status !== 'PAGADO')
        .reduce((s, a) => s + (toNum(a.amountDueBs) - toNum(a.amountPaidBs)), 0) * 100
    ) / 100;

    res.json({
      ok: true,
      stats: {
        total_apartments: totalApartments,
        active_period: openPeriod ? openPeriod.code : 'Ninguno',
        total_collected: totalCollected,
        pending_collection: totalPending,
      },
      recent_periods: recentPeriods.map(mapPeriod),
    });
  } catch (error) {
    console.error('Error en getDashboard:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.getBlocks = async (req, res) => {
  try {
    const blocks = await prisma.apartment.findMany({
      select: { block: true },
      distinct: ['block'],
      orderBy: { block: 'asc' },
    });
    res.json({ ok: true, items: blocks.map((b) => b.block) });
  } catch (error) {
    console.error('Error en getBlocks:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Usuarios (gestión de accesos) ────────────────────────────────
exports.getUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: { apartment: { select: { block: true, number: true, ownerName: true } } },
      orderBy: [{ isActive: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({
      ok: true,
      items: users.map((u) => ({
        id: u.id,
        username: u.username,
        full_name: u.fullName,
        role: u.role,
        is_active: u.isActive,
        apartment_id: u.apartmentId,
        apartment: u.apartment
          ? { block: u.apartment.block, number: u.apartment.number, owner_name: u.apartment.ownerName }
          : null,
        last_login_at: u.lastLoginAt,
        created_at: u.createdAt,
      })),
    });
  } catch (error) {
    console.error('Error en getUsers:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id, 10);
    const { is_active, password, full_name, role } = req.body;

    const data = {};
    if (typeof is_active === 'boolean') data.isActive = is_active;
    if (full_name && String(full_name).trim()) data.fullName = String(full_name).trim();
    if (role === 'ADMIN' || role === 'OWNER') data.role = role;
    if (password) {
      if (String(password).length < 6) {
        return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
      }
      data.passwordHash = await bcrypt.hash(String(password), 12);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ ok: false, message: 'No hay campos para actualizar' });
    }

    const user = await prisma.user.update({ where: { id: userId }, data });
    invalidateCache(user.username);
    res.json({
      ok: true,
      message: 'Usuario actualizado correctamente',
      user: {
        id: user.id,
        username: user.username,
        full_name: user.fullName,
        role: user.role,
        is_active: user.isActive,
      },
    });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    console.error('Error en updateUser:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.getApartments = async (req, res) => {
  try {
    const { block, search, page, limit } = req.query;
    const where = {};
    if (block) where.block = block;
    if (search) {
      where.OR = [
        { ownerName: { contains: search, mode: 'insensitive' } },
        { number: { contains: search, mode: 'insensitive' } },
        { block: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }

    const queryOptions = {
      where,
      include: { meters: { where: { isActive: true } }, users: { where: { role: 'OWNER' } } },
      orderBy: [{ block: 'asc' }, { number: 'asc' }],
    };

    if (page && limit) {
      const take = parseInt(limit, 10);
      const skip = (parseInt(page, 10) - 1) * take;
      queryOptions.take = take;
      queryOptions.skip = skip;

      const totalCount = await prisma.apartment.count({ where });
      const apartments = await prisma.apartment.findMany(queryOptions);
      return res.json({
        ok: true,
        items: apartments.map(mapApartment),
        pagination: { total: totalCount, page: parseInt(page, 10), limit: take },
      });
    }

    const apartments = await prisma.apartment.findMany(queryOptions);
    res.json({ ok: true, items: apartments.map(mapApartment) });
  } catch (error) {
    console.error('Error en getApartments:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.createApartment = async (req, res) => {
  try {
    const { block, number, owner_name, phone, coefficient, meter_code, meter_is_inverted, is_inverted, username, password } = req.body;

    if (!block || !number || !owner_name || !meter_code || !username || !password) {
      return res.status(400).json({ ok: false, message: 'Bloque, número, propietario, medidor, usuario y contraseña son obligatorios.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const cleanUsername = String(username).trim().toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: { username: { equals: cleanUsername, mode: 'insensitive' } },
    });
    if (existingUser) return res.status(400).json({ ok: false, message: 'El nombre de usuario ya está en uso.' });

    const existing = await prisma.apartment.findUnique({
      where: { uq_apartment_block_number: { block: block.toUpperCase(), number: String(number) } },
    });
    if (existing) return res.status(400).json({ ok: false, message: 'El departamento ya existe' });

    const passwordHash = await bcrypt.hash(password, 12);

    const apt = await prisma.apartment.create({
      data: {
        block: block.toUpperCase(),
        number: String(number),
        ownerName: owner_name,
        phone: phone || null,
        coefficient: parseFloat(coefficient) || 1.0,
        meters: { create: { code: meter_code, isInverted: meter_is_inverted || is_inverted || false } },
        users: { create: { username: cleanUsername, fullName: owner_name, passwordHash, role: 'OWNER', isActive: true } },
      },
      include: { meters: true, users: true },
    });

    const lastPeriod = await prisma.billingPeriod.findFirst({ orderBy: { id: 'desc' } });
    if (lastPeriod) {
      const meterId = apt.meters[0].id;
      if (lastPeriod.status === 'OPEN') {
        await prisma.reading.create({
          data: {
            periodId: lastPeriod.id,
            apartmentId: apt.id,
            meterId,
            previousReading: 0,
            currentReading: 0,
            consumptionM3: 0,
            sourceJson: JSON.stringify({ source: 'auto_join' }),
          },
        });
      } else if (lastPeriod.status === 'CALCULATED') {
        await prisma.allocation.create({
          data: {
            periodId: lastPeriod.id,
            apartmentId: apt.id,
            consumptionM3: 0,
            effectiveM3: 0,
            percentageShare: 0,
            amountDueBs: 0,
            amountPaidBs: 0,
            status: 'PAGADO',
            breakdownJson: JSON.stringify({ note: 'Joined after calculation' }),
          },
        });
      }
    }

    res.status(201).json({ ok: true, message: 'Departamento creado exitosamente', apartment: mapApartment(apt) });
  } catch (error) {
    console.error('Error en createApartment:', error);
    res.status(500).json({ ok: false, message: 'Error interno al crear departamento' });
  }
};

exports.updateApartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { block, number, owner_name, phone, coefficient, meter_code, meter_is_inverted, is_inverted, is_active, username, password } = req.body;

    if (!block || !number || !owner_name || !meter_code || !username) {
      return res.status(400).json({ ok: false, message: 'Bloque, número, propietario, medidor y usuario son obligatorios.' });
    }

    const aptId = parseInt(id);
    const existingApt = await prisma.apartment.findUnique({
      where: { id: aptId },
      include: { meters: true, users: true },
    });
    if (!existingApt) return res.status(404).json({ ok: false, message: 'Departamento no encontrado' });

    const duplicateApt = await prisma.apartment.findFirst({
      where: { block: block.toUpperCase(), number: String(number), id: { not: aptId } },
    });
    if (duplicateApt) return res.status(400).json({ ok: false, message: 'Ya existe otro departamento con ese bloque y número.' });

    const cleanUsername = String(username).trim().toLowerCase();
    const duplicateUser = await prisma.user.findFirst({
      where: { username: { equals: cleanUsername, mode: 'insensitive' }, apartmentId: { not: aptId } },
    });
    if (duplicateUser) return res.status(400).json({ ok: false, message: 'El nombre de usuario ya está en uso por otro departamento.' });

    const userUpdateData = { username: cleanUsername, fullName: owner_name };
    if (password && password.trim().length > 0) {
      if (password.length < 6) return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
      userUpdateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const meterId = existingApt.meters.length > 0 ? existingApt.meters[0].id : null;

    const updatedApt = await prisma.$transaction(async (tx) => {
      await tx.apartment.update({
        where: { id: aptId },
        data: {
          block: block.toUpperCase(),
          number: String(number),
          ownerName: owner_name,
          phone: phone || null,
          coefficient: parseFloat(coefficient) || 1.0,
          ...(typeof is_active === 'boolean' ? { isActive: is_active } : {}),
        },
      });

      if (meterId) {
        await tx.meter.update({
          where: { id: meterId },
          data: { code: meter_code, isInverted: meter_is_inverted || is_inverted || false },
        });
      } else {
        await tx.meter.create({
          data: { apartmentId: aptId, code: meter_code, isInverted: meter_is_inverted || is_inverted || false },
        });
      }

      const ownerUser = existingApt.users.find((u) => u.role === 'OWNER');
      if (ownerUser) {
        await tx.user.update({ where: { id: ownerUser.id }, data: userUpdateData });
        if (typeof is_active === 'boolean') {
          await tx.user.update({ where: { id: ownerUser.id }, data: { isActive: is_active } });
        }
      } else {
        if (!password || password.length < 6) {
          throw new Error('Debe proporcionar una contraseña (mín 6 caracteres) para crear el usuario faltante.');
        }
        await tx.user.create({
          data: { ...userUpdateData, role: 'OWNER', isActive: true, apartmentId: aptId },
        });
      }

      return await tx.apartment.findUnique({
        where: { id: aptId },
        include: { meters: true, users: true },
      });
    });

    invalidateCache(cleanUsername);
    res.json({ ok: true, message: 'Departamento actualizado exitosamente', apartment: mapApartment(updatedApt) });
  } catch (error) {
    console.error('Error en updateApartment:', error);
    res.status(500).json({ ok: false, message: error.message || 'Error interno al actualizar departamento' });
  }
};

exports.deleteApartment = async (req, res) => {
  try {
    const { id } = req.params;
    const aptId = parseInt(id);

    const existingApt = await prisma.apartment.findUnique({ where: { id: aptId } });
    if (!existingApt) return res.status(404).json({ ok: false, message: 'Departamento no encontrado' });

    await prisma.$transaction(async (tx) => {
      const allocations = await tx.allocation.findMany({ where: { apartmentId: aptId }, select: { id: true } });
      const allocIds = allocations.map((a) => a.id);
      if (allocIds.length > 0) {
        await tx.payment.deleteMany({ where: { allocationId: { in: allocIds } } });
      }
      await tx.allocation.deleteMany({ where: { apartmentId: aptId } });
      await tx.reading.deleteMany({ where: { apartmentId: aptId } });
      await tx.user.deleteMany({ where: { apartmentId: aptId } });
      await tx.meter.deleteMany({ where: { apartmentId: aptId } });
      await tx.apartment.delete({ where: { id: aptId } });
    });

    res.json({ ok: true, message: 'Departamento eliminado correctamente (junto a todo su historial)' });
  } catch (error) {
    console.error('Error en deleteApartment:', error);
    res.status(500).json({ ok: false, message: 'Error interno al eliminar departamento' });
  }
};

exports.getPeriods = async (req, res) => {
  try {
    const periods = await prisma.billingPeriod.findMany({ orderBy: { id: 'desc' } });
    res.json({ ok: true, items: periods.map(mapPeriod) });
  } catch (error) {
    console.error('Error en getPeriods:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.createPeriod = async (req, res) => {
  try {
    const { code, common_amount, general_total_consumption_m3, price_per_m3, general_readings } = req.body;

    if (!code || !common_amount) {
      return res.status(400).json({ ok: false, message: 'El código y el monto común son obligatorios.' });
    }

    const existing = await prisma.billingPeriod.findUnique({ where: { code } });
    if (existing) return res.status(400).json({ ok: false, message: 'El periodo ya existe' });

    const open = await prisma.billingPeriod.findFirst({ where: { status: 'OPEN' } });
    if (open) return res.status(400).json({ ok: false, message: 'Hay un periodo abierto, ciérralo primero.' });

    const period = await prisma.billingPeriod.create({
      data: {
        code,
        totalCommonAmountBs: parseFloat(common_amount),
        generalTotalConsumptionM3: parseFloat(general_total_consumption_m3 ?? 0),
        generalMetersJson: JSON.stringify(general_readings || []),
        notesJson: JSON.stringify({ pricePerM3: parseFloat(price_per_m3) || 7.5 }),
        status: 'OPEN',
      },
    });

    res.status(201).json({ ok: true, message: 'Periodo creado', period: mapPeriod(period) });
  } catch (error) {
    console.error('Error en createPeriod:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.saveReadings = async (req, res) => {
  const { id } = req.params;
  const { readings } = req.body;

  if (!readings || !Array.isArray(readings) || readings.length === 0) {
    return res.status(400).json({ ok: false, message: 'Debes enviar al menos una lectura.' });
  }

  try {
    const period = await prisma.billingPeriod.findUnique({ where: { id: parseInt(id) } });
    if (!period) return res.status(404).json({ ok: false, message: 'Periodo no encontrado.' });
    if (period.status === 'CLOSED') return res.status(400).json({ ok: false, message: 'El periodo ya está cerrado.' });

    // Cargar medidores activos de todos los dptos en una sola consulta (evita N+1)
    const apartmentIds = readings.map((r) => parseInt(r.apartment_id));
    const meters = await prisma.meter.findMany({
      where: { apartmentId: { in: apartmentIds }, isActive: true },
    });
    const metersByApartment = new Map(meters.map((m) => [m.apartmentId, m]));

    const saved = [];
    const errors = [];
    const upsertPromises = [];

    for (const item of readings) {
      const apartmentId = parseInt(item.apartment_id);
      const previousReading = parseFloat(item.previous_reading ?? 0);
      const currentReading = parseFloat(item.current_reading ?? 0);

      const meter = metersByApartment.get(apartmentId);
      if (!meter) {
        errors.push({ apartment_id: apartmentId, error: 'No existe medidor activo para este departamento.' });
        continue;
      }

      let consumptionM3 = meter.isInverted
        ? previousReading - currentReading
        : currentReading - previousReading;
      consumptionM3 = Math.round(consumptionM3 * 100) / 100;

      if (consumptionM3 < 0) {
        errors.push({ apartment_id: apartmentId, error: 'El consumo no puede ser negativo. Revisa las lecturas.' });
        continue;
      }

      upsertPromises.push(
        prisma.reading.upsert({
          where: { uq_period_meter: { periodId: parseInt(id), meterId: meter.id } },
          create: {
            periodId: parseInt(id), apartmentId, meterId: meter.id, previousReading, currentReading,
            consumptionM3, sourceJson: JSON.stringify({ source: 'manual' }),
          },
          update: {
            previousReading, currentReading, consumptionM3,
            sourceJson: JSON.stringify({ source: 'manual', updated_at: new Date().toISOString() }),
          },
        })
      );
    }

    if (upsertPromises.length > 0) {
      const results = await prisma.$transaction(upsertPromises);
      saved.push(...results);
    }

    res.json({
      ok: true,
      message: `${saved.length} lecturas guardadas correctamente.`,
      saved,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Error en saveReadings:', error);
    res.status(500).json({ ok: false, message: 'Error interno al guardar lecturas.' });
  }
};

// ─── Liquidar Periodo: reparto justo con coeficientes + conciliación con factura ──
exports.settlePeriod = async (req, res) => {
  const { id } = req.params;

  try {
    const periodId = parseInt(id);
    const period = await prisma.billingPeriod.findUnique({
      where: { id: periodId },
      include: { readings: { include: { apartment: true } } },
    });

    if (!period) return res.status(404).json({ ok: false, message: 'Periodo no encontrado.' });
    if (period.status === 'CLOSED') return res.status(400).json({ ok: false, message: 'El periodo ya está cerrado.' });

    const readings = period.readings;
    if (readings.length === 0) return res.status(400).json({ ok: false, message: 'No hay lecturas registradas para este periodo.' });
    if (Number(period.totalCommonAmountBs) <= 0) return res.status(400).json({ ok: false, message: 'Debes registrar el monto total común (factura) del periodo.' });

    const notes = period.notesJson ? safeParse(period.notesJson) : {};
    const pricePerM3 = Number(notes.pricePerM3) || 7.5;
    const invoice = Number(period.totalCommonAmountBs);

    const coefficients = {};
    readings.forEach((r) => {
      coefficients[r.apartmentId] = r.apartment?.coefficient ?? 1;
    });

    let result;
    try {
      result = distributeInvoice({
        invoiceBs: invoice,
        readings: readings.map((r) => ({ apartmentId: r.apartmentId, consumptionM3: r.consumptionM3 })),
        coefficients,
        pricePerM3,
      });
    } catch (calcErr) {
      return res.status(400).json({ ok: false, message: calcErr.message });
    }

    // No borrar asignaciones con pagos (evita pérdida de dinero registrado)
    const existingAllocations = await prisma.allocation.findMany({
      where: { periodId },
      include: { _count: { select: { payments: true } } },
    });
    const paidAllocations = existingAllocations.filter((a) => a._count.payments > 0);
    if (paidAllocations.length > 0) {
      return res.status(400).json({
        ok: false,
        message: 'Este periodo ya tiene pagos registrados. No se puede reliquidar para no perder el historial de cobros.',
      });
    }

    await prisma.allocation.deleteMany({ where: { periodId } });

    const allocationsData = result.allocations.map((item) => ({
      periodId,
      apartmentId: item.apartmentId,
      consumptionM3: item.consumptionM3,
      effectiveM3: item.effectiveM3,
      percentageShare: item.percentageShare,
      amountDueBs: item.amountDueBs,
      amountPaidBs: 0,
      status: 'PENDIENTE',
      breakdownJson: buildBreakdown({
        item,
        summary: result.summary,
        periodCode: period.code,
        generalTotal: Number(period.generalTotalConsumptionM3 || 0),
      }),
    }));

    if (allocationsData.length > 0) {
      await prisma.allocation.createMany({ data: allocationsData });
    }

    const generalTotal = Number(period.generalTotalConsumptionM3 || 0);
    const updatedPeriod = await prisma.billingPeriod.update({
      where: { id: periodId },
      data: {
        totalIndividualConsumptionM3: result.summary.totalConsumptionM3,
        commonDifferenceM3: generalTotal > 0
          ? Math.round((generalTotal - result.summary.totalConsumptionM3) * 100) / 100
          : 0,
        distributedTotalBs: result.summary.distributedTotalBs,
        status: 'CALCULATED',
      },
    });

    const finalAllocations = await prisma.allocation.findMany({
      where: { periodId },
      include: { apartment: { include: { meters: { where: { isActive: true } } } }, payments: true },
    });

    res.json({
      ok: true,
      message: 'Periodo liquidado correctamente.',
      period: mapPeriod(updatedPeriod),
      summary: {
        invoice_bs: result.summary.invoiceBs,
        price_per_m3: result.summary.pricePerM3,
        total_consumption_m3: result.summary.totalConsumptionM3,
        total_effective_m3: result.summary.totalEffectiveM3,
        general_total_consumption_m3: generalTotal,
        common_difference_m3: generalTotal > 0 ? Math.round((generalTotal - result.summary.totalConsumptionM3) * 100) / 100 : 0,
        distributed_total_bs: result.summary.distributedTotalBs,
      },
      allocations: finalAllocations.map(mapAllocation),
    });
  } catch (error) {
    console.error('Error en settlePeriod:', error);
    res.status(500).json({ ok: false, message: 'Error interno al liquidar el periodo.' });
  }
};

exports.getAllocations = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, search } = req.query;
    const periodId = parseInt(id);

    let apartmentWhere;
    if (search) {
      apartmentWhere = {
        OR: [
          { ownerName: { contains: search, mode: 'insensitive' } },
          { number: { contains: search, mode: 'insensitive' } },
          { block: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const where = { periodId };
    if (status) where.status = status;
    if (apartmentWhere) where.apartment = apartmentWhere;

    const allocations = await prisma.allocation.findMany({
      where,
      include: {
        apartment: { include: { meters: { where: { isActive: true } } } },
        payments: true,
      },
      orderBy: [{ apartment: { block: 'asc' } }, { apartment: { number: 'asc' } }],
    });
    res.json({ ok: true, items: allocations.map(mapAllocation) });
  } catch (error) {
    console.error('Error en getAllocations:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.registerPayment = async (req, res) => {
  const { id } = req.params;
  const { amount_bs, payment_method, reference, notes } = req.body;

  const amountPaid = parseFloat(amount_bs);
  if (!amountPaid || amountPaid <= 0) {
    return res.status(400).json({ ok: false, message: 'El monto del pago debe ser mayor que cero.' });
  }

  try {
    const allocation = await prisma.allocation.findUnique({ where: { id: parseInt(id) } });
    if (!allocation) return res.status(404).json({ ok: false, message: 'Recibo no encontrado.' });
    if (allocation.status === 'PAGADO') return res.status(400).json({ ok: false, message: 'Este recibo ya está pagado.' });

    const pendingAmount = computePending(allocation.amountDueBs, allocation.amountPaidBs);
    if (amountPaid > pendingAmount) {
      return res.status(400).json({
        ok: false,
        message: `El pago (${amountPaid.toFixed(2)} Bs) no puede exceder el monto pendiente (${pendingAmount.toFixed(2)} Bs).`,
      });
    }

    const validMethods = ['EFECTIVO', 'TRANSFERENCIA', 'QR'];
    const method = validMethods.includes(payment_method) ? payment_method : 'EFECTIVO';

    await prisma.payment.create({
      data: {
        allocationId: parseInt(id),
        amountBs: amountPaid,
        paymentMethod: method,
        reference: reference || null,
        notesJson: notes ? JSON.stringify({ notes }) : null,
        registeredByUserId: req.user?.sub || null,
      },
    });

    const allPayments = await prisma.payment.findMany({ where: { allocationId: parseInt(id) } });
    const totalPaid = Math.round(allPayments.reduce((s, p) => s + toNum(p.amountBs), 0) * 100) / 100;
    const newStatus = totalPaid >= toNum(allocation.amountDueBs) ? 'PAGADO' : 'PARCIAL';

    const updatedAllocation = await prisma.allocation.update({
      where: { id: parseInt(id) },
      data: { amountPaidBs: totalPaid, status: newStatus },
      include: { apartment: { include: { meters: { where: { isActive: true } } } }, payments: true },
    });

    res.json({
      ok: true,
      message: `Pago de ${amountPaid.toFixed(2)} Bs registrado. Estado: ${newStatus}.`,
      allocation: mapAllocation(updatedAllocation),
    });
  } catch (error) {
    console.error('Error en registerPayment:', error);
    res.status(500).json({ ok: false, message: 'Error interno al registrar pago.' });
  }
};

// ═══════════════════════════════════════════════════════════════
//  OWNER (adjudicatario)
// ═══════════════════════════════════════════════════════════════

exports.ownerGetDashboard = async (req, res) => {
  try {
    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { apartment: { include: { meters: true } } },
    });

    if (!user || !user.apartment) {
      return res.status(400).json({ ok: false, message: 'Usuario sin departamento asignado' });
    }

    const allocations = await prisma.allocation.findMany({
      where: { apartmentId: user.apartment.id },
      include: {
        period: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { id: 'desc' },
    });

    const totalDebt = allocations
      .filter((a) => a.status !== 'PAGADO')
      .reduce((s, a) => s + (toNum(a.amountDueBs) - toNum(a.amountPaidBs)), 0);
    const totalPaid = allocations.reduce((s, a) => s + toNum(a.amountPaidBs), 0);

    const activeMeter = user.apartment.meters.find((m) => m.isActive);

    res.json({
      ok: true,
      apartment: {
        id: user.apartment.id,
        block: user.apartment.block,
        number: user.apartment.number,
        owner_name: user.apartment.ownerName,
        phone: user.apartment.phone,
        coefficient: toNum(user.apartment.coefficient),
        meter: activeMeter
          ? { id: activeMeter.id, code: activeMeter.code, is_inverted: activeMeter.isInverted, is_active: activeMeter.isActive }
          : null,
      },
      stats: {
        total_debt_bs: Math.round(totalDebt * 100) / 100,
        total_paid_bs: Math.round(totalPaid * 100) / 100,
        pending_periods: allocations.filter((a) => a.status === 'PENDIENTE').length,
      },
      allocations: allocations.map(mapAllocation),
    });
  } catch (error) {
    console.error('Error en owner getDashboard:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

exports.ownerGetPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { apartment: true },
    });

    if (!user || !user.apartment) {
      return res.status(400).json({ ok: false, message: 'Usuario sin departamento asignado' });
    }

    const payments = await prisma.payment.findMany({
      where: { allocation: { apartmentId: user.apartment.id } },
      include: { allocation: { include: { period: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      ok: true,
      payments: payments.map((p) => ({
        id: p.id,
        amount_bs: toNum(p.amountBs),
        payment_method: p.paymentMethod,
        reference: p.reference,
        created_at: p.createdAt,
        period: p.allocation?.period?.code || null,
      })),
    });
  } catch (error) {
    console.error('Error en ownerGetPaymentHistory:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};