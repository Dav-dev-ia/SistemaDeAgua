const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');

// ─── Helpers: mapeadores a snake_case para el frontend ────────────────────────
const mapApartment = (apt) => ({
  id: apt.id,
  block: apt.block,
  number: apt.number,
  owner_name: apt.ownerName,
  phone: apt.phone,
  coefficient: apt.coefficient,
  is_active: apt.isActive,
  created_at: apt.createdAt,
  meter: apt.meters && apt.meters.length > 0 ? {
    id: apt.meters[0].id,
    code: apt.meters[0].code,
    is_inverted: apt.meters[0].isInverted,
    is_active: apt.meters[0].isActive,
  } : null,
  user: apt.users && apt.users.length > 0 ? {
    id: apt.users[0].id,
    username: apt.users[0].username,
  } : null
});

const mapPeriod = (p) => ({
  id: p.id,
  code: p.code,
  status: p.status,
  total_common_amount_bs: p.totalCommonAmountBs,
  general_total_consumption_m3: p.generalTotalConsumptionM3,
  total_individual_consumption_m3: p.totalIndividualConsumptionM3,
  common_difference_m3: p.commonDifferenceM3,
  distributed_total_bs: p.distributedTotalBs,
  created_at: p.createdAt,
  closed_at: p.closedAt,
});

const mapAllocation = (a) => {
  const pending = Math.round((a.amountDueBs - a.amountPaidBs) * 100) / 100;
  return {
    id: a.id,
    period_id: a.periodId,
    apartment_id: a.apartmentId,
    consumption_m3: a.consumptionM3,
    percentage_share: a.percentageShare,
    amount_due_bs: a.amountDueBs,
    amount_paid_bs: a.amountPaidBs,
    pending_amount_bs: pending > 0 ? pending : 0,
    status: a.status,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    apartment: a.apartment ? mapApartment({ ...a.apartment, meters: [] }) : null,
    period: a.period ? mapPeriod(a.period) : null,
    payments: (a.payments || []).map(p => ({
      id: p.id,
      amount_bs: p.amountBs,
      payment_method: p.paymentMethod,
      reference: p.reference,
      created_at: p.createdAt,
    })),
  };
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const totalApartments = await prisma.apartment.count();
    const openPeriod = await prisma.billingPeriod.findFirst({ where: { status: 'OPEN' } });
    const recentPeriods = await prisma.billingPeriod.findMany({
      orderBy: { id: 'desc' },
      take: 5
    });

    const allAllocations = await prisma.allocation.findMany({
      select: { amountDueBs: true, amountPaidBs: true, status: true }
    });
    const totalCollected = Math.round(
      allAllocations.reduce((sum, a) => sum + a.amountPaidBs, 0) * 100
    ) / 100;
    const totalPending = Math.round(
      allAllocations
        .filter(a => a.status !== 'PAGADO')
        .reduce((sum, a) => sum + (a.amountDueBs - a.amountPaidBs), 0) * 100
    ) / 100;

    res.json({
      ok: true,
      stats: {
        total_apartments: totalApartments,
        active_period: openPeriod ? openPeriod.code : 'Ninguno',
        total_collected: totalCollected,
        pending_collection: totalPending
      },
      recent_periods: recentPeriods.map(mapPeriod)
    });
  } catch (error) {
    console.error('Error en getDashboard:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Bloques ──────────────────────────────────────────────────────────────────
exports.getBlocks = async (req, res) => {
  try {
    const blocks = await prisma.apartment.findMany({
      select: { block: true },
      distinct: ['block'],
      orderBy: { block: 'asc' }
    });
    // Frontend espera { ok, items: [...] }
    res.json({ ok: true, items: blocks.map(b => b.block) });
  } catch (error) {
    console.error('Error en getBlocks:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Listar Departamentos ─────────────────────────────────────────────────────
exports.getApartments = async (req, res) => {
  try {
    const { block, search } = req.query;
    const where = {};
    if (block) where.block = block;
    if (search) {
      where.OR = [
        { ownerName: { contains: search, mode: 'insensitive' } },
        { number: { contains: search, mode: 'insensitive' } },
        { block: { contains: search, mode: 'insensitive' } }
      ];
    }
    const apartments = await prisma.apartment.findMany({
      where,
      include: { 
        meters: { where: { isActive: true } },
        users: { where: { role: 'OWNER' } }
      },
      orderBy: [{ block: 'asc' }, { number: 'asc' }]
    });
    // Frontend espera { ok, items: [...] }
    res.json({ ok: true, items: apartments.map(mapApartment) });
  } catch (error) {
    console.error('Error en getApartments:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Crear Departamento ───────────────────────────────────────────────────────
exports.createApartment = async (req, res) => {
  try {
    const { block, number, owner_name, phone, coefficient, meter_code, meter_is_inverted, is_inverted, username, password } = req.body;

    if (!block || !number || !owner_name || !meter_code || !username || !password) {
      return res.status(400).json({ ok: false, message: 'Bloque, número, propietario, medidor, usuario y contraseña son obligatorios.' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
    }

    const existingUser = await prisma.user.findUnique({ where: { username: String(username).trim() } });
    if (existingUser) return res.status(400).json({ ok: false, message: 'El nombre de usuario ya está en uso.' });

    const existing = await prisma.apartment.findUnique({
      where: { uq_apartment_block_number: { block: block.toUpperCase(), number: String(number) } }
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
        meters: {
          create: {
            code: meter_code,
            isInverted: meter_is_inverted || is_inverted || false
          }
        },
        users: {
          create: {
            username: String(username).trim(),
            fullName: owner_name,
            passwordHash,
            role: 'OWNER',
            isActive: true
          }
        }
      },
      include: { meters: true, users: true }
    });

    // Anexar al periodo activo más reciente para que el Dpto no quede huérfano
    const lastPeriod = await prisma.billingPeriod.findFirst({
      orderBy: { id: 'desc' }
    });

    if (lastPeriod) {
      const meterId = apt.meters[0].id;
      if (lastPeriod.status === 'OPEN') {
        // Crear lectura inicial en 0 para que figure y pueda ingresar datos
        await prisma.reading.create({
          data: {
            periodId: lastPeriod.id,
            apartmentId: apt.id,
            meterId: meterId,
            previousReading: 0,
            currentReading: 0,
            consumptionM3: 0,
            sourceJson: JSON.stringify({ source: 'auto_join' })
          }
        });
      } else if (lastPeriod.status === 'CALCULATED') {
        // Crear un recibo en 0 Bs para que aparezca en el sistema y no genere errores visuales
        await prisma.allocation.create({
          data: {
            periodId: lastPeriod.id,
            apartmentId: apt.id,
            consumptionM3: 0,
            percentageShare: 0,
            amountDueBs: 0,
            amountPaidBs: 0,
            status: 'PAGADO', // Pagado para que no figure como deuda
            breakdownJson: JSON.stringify({ note: 'Joined after calculation' })
          }
        });
      }
    }

    res.status(201).json({ ok: true, message: 'Departamento creado exitosamente', apartment: mapApartment(apt) });
  } catch (error) {
    console.error('Error en createApartment:', error);
    res.status(500).json({ ok: false, message: 'Error interno al crear departamento' });
  }
};

// ─── Listar Periodos ──────────────────────────────────────────────────────────
exports.getPeriods = async (req, res) => {
  try {
    const periods = await prisma.billingPeriod.findMany({ orderBy: { id: 'desc' } });
    // Frontend espera { ok, items: [...] }
    res.json({ ok: true, items: periods.map(mapPeriod) });
  } catch (error) {
    console.error('Error en getPeriods:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Crear Periodo ────────────────────────────────────────────────────────────
exports.createPeriod = async (req, res) => {
  try {
    const { code, common_amount, general_readings, price_per_m3 } = req.body;

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
        generalMetersJson: JSON.stringify(general_readings || []),
        notesJson: JSON.stringify({ pricePerM3: parseFloat(price_per_m3) || 7.5 }),
        status: 'OPEN'
      }
    });

    res.status(201).json({ ok: true, message: 'Periodo creado', period: mapPeriod(period) });
  } catch (error) {
    console.error('Error en createPeriod:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Guardar Lecturas ─────────────────────────────────────────────────────────
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

    const saved = [];
    const errors = [];

    for (const item of readings) {
      const apartmentId = parseInt(item.apartment_id);
      const previousReading = parseFloat(item.previous_reading ?? 0);
      const currentReading = parseFloat(item.current_reading ?? 0);

      const meter = await prisma.meter.findFirst({ where: { apartmentId, isActive: true } });

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

      const reading = await prisma.reading.upsert({
        where: { uq_period_meter: { periodId: parseInt(id), meterId: meter.id } },
        create: { periodId: parseInt(id), apartmentId, meterId: meter.id, previousReading, currentReading, consumptionM3, sourceJson: JSON.stringify({ source: 'manual' }) },
        update: { previousReading, currentReading, consumptionM3, sourceJson: JSON.stringify({ source: 'manual', updated_at: new Date().toISOString() }) }
      });
      saved.push(reading);
    }

    res.json({
      ok: true,
      message: `${saved.length} lecturas guardadas correctamente.`,
      saved,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error en saveReadings:', error);
    res.status(500).json({ ok: false, message: 'Error interno al guardar lecturas.' });
  }
};

// ─── Liquidar Periodo ─────────────────────────────────────────────────────────
exports.settlePeriod = async (req, res) => {
  const { id } = req.params;

  try {
    const period = await prisma.billingPeriod.findUnique({
      where: { id: parseInt(id) },
      include: { readings: { include: { apartment: true } } }
    });

    if (!period) return res.status(404).json({ ok: false, message: 'Periodo no encontrado.' });
    if (period.status === 'CLOSED') return res.status(400).json({ ok: false, message: 'El periodo ya está cerrado.' });

    const readings = period.readings;
    if (readings.length === 0) return res.status(400).json({ ok: false, message: 'No hay lecturas registradas para este periodo.' });
    if (period.totalCommonAmountBs <= 0) return res.status(400).json({ ok: false, message: 'Debes registrar el monto total común (factura) del periodo.' });

    const totalConsumption = Math.round(readings.reduce((sum, r) => sum + r.consumptionM3, 0) * 100) / 100;
    if (totalConsumption <= 0) return res.status(400).json({ ok: false, message: 'El consumo total debe ser mayor que cero.' });

    const generalTotal = parseFloat(period.generalTotalConsumptionM3 ?? 0);
    const commonDifference = generalTotal > 0 ? Math.round((generalTotal - totalConsumption) * 100) / 100 : 0;

    await prisma.allocation.deleteMany({ where: { periodId: parseInt(id) } });

    const notes = period.notesJson ? JSON.parse(period.notesJson) : {};
    const pricePerM3 = notes.pricePerM3 || 7.5;

    let distributedTotal = 0;
    const allocations = [];

    for (const reading of readings) {
      const percentage = reading.consumptionM3 / totalConsumption;
      const amountDue = Math.round(reading.consumptionM3 * pricePerM3 * 100) / 100;
      distributedTotal += amountDue;

      const allocation = await prisma.allocation.create({
        data: {
          periodId: parseInt(id),
          apartmentId: reading.apartmentId,
          consumptionM3: reading.consumptionM3,
          percentageShare: Math.round(percentage * 10000) / 100,
          amountDueBs: amountDue,
          amountPaidBs: 0,
          status: 'PENDIENTE',
          breakdownJson: JSON.stringify({
            period_code: period.code,
            price_per_m3: pricePerM3,
            consumption_m3: reading.consumptionM3,
            total_consumption_m3: totalConsumption,
            share_percent: Math.round(percentage * 10000) / 100,
            common_total_amount_bs: Math.round(period.totalCommonAmountBs * 100) / 100,
            general_total_consumption_m3: generalTotal,
            common_difference_m3: commonDifference
          })
        }
      });
      allocations.push(allocation);
    }

    const updatedPeriod = await prisma.billingPeriod.update({
      where: { id: parseInt(id) },
      data: { totalIndividualConsumptionM3: totalConsumption, commonDifferenceM3: commonDifference, distributedTotalBs: distributedTotal, status: 'CALCULATED' }
    });

    const finalAllocations = await prisma.allocation.findMany({
      where: { periodId: parseInt(id) },
      include: { apartment: { include: { meters: { where: { isActive: true } } } }, payments: true }
    });

    res.json({
      ok: true,
      message: 'Periodo liquidado correctamente.',
      period: mapPeriod(updatedPeriod),
      summary: { total_consumption_m3: totalConsumption, general_total_consumption_m3: generalTotal, common_difference_m3: commonDifference, distributed_total_bs: distributedTotal },
      allocations: finalAllocations.map(mapAllocation)
    });
  } catch (error) {
    console.error('Error en settlePeriod:', error);
    res.status(500).json({ ok: false, message: 'Error interno al liquidar el periodo.' });
  }
};

// ─── Obtener Asignaciones (Cobros) ────────────────────────────────────────────
exports.getAllocations = async (req, res) => {
  try {
    const { id } = req.params;
    const allocations = await prisma.allocation.findMany({
      where: { periodId: parseInt(id) },
      include: { apartment: { include: { meters: { where: { isActive: true } } } }, payments: true },
      orderBy: [{ apartment: { block: 'asc' } }, { apartment: { number: 'asc' } }]
    });
    // Frontend espera { ok, items: [...] }
    res.json({ ok: true, items: allocations.map(mapAllocation) });
  } catch (error) {
    console.error('Error en getAllocations:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Registrar Pago (Cobro Rápido) ────────────────────────────────────────────
exports.registerPayment = async (req, res) => {
  const { id } = req.params;
  const { amount_bs, payment_method, reference, notes } = req.body;

  if (!amount_bs || parseFloat(amount_bs) <= 0) {
    return res.status(400).json({ ok: false, message: 'El monto del pago debe ser mayor que cero.' });
  }

  try {
    const allocation = await prisma.allocation.findUnique({ where: { id: parseInt(id) } });
    if (!allocation) return res.status(404).json({ ok: false, message: 'Recibo no encontrado.' });
    if (allocation.status === 'PAGADO') return res.status(400).json({ ok: false, message: 'Este recibo ya está pagado.' });

    const amountPaid = parseFloat(amount_bs);

    await prisma.payment.create({
      data: {
        allocationId: parseInt(id),
        amountBs: amountPaid,
        paymentMethod: payment_method || 'EFECTIVO',
        reference: reference || null,
        notesJson: notes ? JSON.stringify({ notes }) : null,
        registeredByUserId: req.user?.sub || null
      }
    });

    const allPayments = await prisma.payment.findMany({ where: { allocationId: parseInt(id) } });
    const totalPaid = Math.round(allPayments.reduce((sum, p) => sum + p.amountBs, 0) * 100) / 100;
    const newStatus = totalPaid >= allocation.amountDueBs ? 'PAGADO' : 'PARCIAL';

    const updatedAllocation = await prisma.allocation.update({
      where: { id: parseInt(id) },
      data: { amountPaidBs: totalPaid, status: newStatus },
      include: { apartment: { include: { meters: { where: { isActive: true } } } }, payments: true }
    });

    res.json({
      ok: true,
      message: `Pago de ${amountPaid} Bs registrado. Estado: ${newStatus}.`,
      allocation: mapAllocation(updatedAllocation)
    });
  } catch (error) {
    console.error('Error en registerPayment:', error);
    res.status(500).json({ ok: false, message: 'Error interno al registrar pago.' });
  }
};

// ─── Actualizar Departamento ──────────────────────────────────────────────────
exports.updateApartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { block, number, owner_name, phone, coefficient, meter_code, meter_is_inverted, is_inverted, username, password } = req.body;

    if (!block || !number || !owner_name || !meter_code || !username) {
      return res.status(400).json({ ok: false, message: 'Bloque, número, propietario, medidor y usuario son obligatorios.' });
    }

    const aptId = parseInt(id);
    const existingApt = await prisma.apartment.findUnique({ where: { id: aptId }, include: { meters: true, users: true } });
    if (!existingApt) return res.status(404).json({ ok: false, message: 'Departamento no encontrado' });

    // Check unique block/number
    const duplicateApt = await prisma.apartment.findFirst({
      where: {
        block: block.toUpperCase(),
        number: String(number),
        id: { not: aptId }
      }
    });
    if (duplicateApt) return res.status(400).json({ ok: false, message: 'Ya existe otro departamento con ese bloque y número.' });

    // Check unique username
    const duplicateUser = await prisma.user.findFirst({
      where: {
        username: String(username).trim(),
        apartmentId: { not: aptId }
      }
    });
    if (duplicateUser) return res.status(400).json({ ok: false, message: 'El nombre de usuario ya está en uso por otro departamento.' });

    // Prepare user update data
    const userUpdateData = {
      username: String(username).trim(),
      fullName: owner_name
    };

    if (password && password.trim().length > 0) {
      if (password.length < 6) return res.status(400).json({ ok: false, message: 'La contraseña debe tener al menos 6 caracteres' });
      userUpdateData.passwordHash = await bcrypt.hash(password, 12);
    }

    // Determine meter update
    let meterId = existingApt.meters.length > 0 ? existingApt.meters[0].id : null;

    // Use transaction to update all related entities
    const updatedApt = await prisma.$transaction(async (tx) => {
      // 1. Update apartment
      const a = await tx.apartment.update({
        where: { id: aptId },
        data: {
          block: block.toUpperCase(),
          number: String(number),
          ownerName: owner_name,
          phone: phone || null,
          coefficient: parseFloat(coefficient) || 1.0,
        }
      });

      // 2. Update meter or create if doesn't exist
      if (meterId) {
        await tx.meter.update({
          where: { id: meterId },
          data: { code: meter_code, isInverted: meter_is_inverted || is_inverted || false }
        });
      } else {
        await tx.meter.create({
          data: {
            apartmentId: aptId,
            code: meter_code,
            isInverted: meter_is_inverted || is_inverted || false
          }
        });
      }

      // 3. Update user or create if doesn't exist
      const ownerUser = existingApt.users.find(u => u.role === 'OWNER');
      if (ownerUser) {
        await tx.user.update({
          where: { id: ownerUser.id },
          data: userUpdateData
        });
      } else {
        if (!password || password.length < 6) {
          throw new Error('Debe proporcionar una contraseña (mín 6 caracteres) para crear el usuario faltante.');
        }
        await tx.user.create({
          data: {
            ...userUpdateData,
            role: 'OWNER',
            isActive: true,
            apartmentId: aptId
          }
        });
      }

      return await tx.apartment.findUnique({
        where: { id: aptId },
        include: { meters: true, users: true }
      });
    });

    res.json({ ok: true, message: 'Departamento actualizado exitosamente', apartment: mapApartment(updatedApt) });
  } catch (error) {
    console.error('Error en updateApartment:', error);
    res.status(500).json({ ok: false, message: error.message || 'Error interno al actualizar departamento' });
  }
};

// ─── Eliminar Departamento (Hard Delete) ──────────────────────────────────────
exports.deleteApartment = async (req, res) => {
  try {
    const { id } = req.params;
    const aptId = parseInt(id);

    const existingApt = await prisma.apartment.findUnique({ where: { id: aptId } });
    if (!existingApt) return res.status(404).json({ ok: false, message: 'Departamento no encontrado' });

    await prisma.$transaction(async (tx) => {
      // 1. Encontrar asignaciones para borrar pagos primero
      const allocations = await tx.allocation.findMany({ where: { apartmentId: aptId }, select: { id: true } });
      const allocIds = allocations.map(a => a.id);

      // 2. Borrar pagos de esas asignaciones
      if (allocIds.length > 0) {
        await tx.payment.deleteMany({ where: { allocationId: { in: allocIds } } });
      }

      // 3. Borrar asignaciones (recibos)
      await tx.allocation.deleteMany({ where: { apartmentId: aptId } });

      // 4. Borrar lecturas
      await tx.reading.deleteMany({ where: { apartmentId: aptId } });

      // 5. Borrar usuarios
      await tx.user.deleteMany({ where: { apartmentId: aptId } });

      // 6. Borrar medidores
      await tx.meter.deleteMany({ where: { apartmentId: aptId } });

      // 7. Borrar departamento
      await tx.apartment.delete({ where: { id: aptId } });
    });

    res.json({ ok: true, message: 'Departamento eliminado correctamente (junto a todo su historial)' });
  } catch (error) {
    console.error('Error en deleteApartment:', error);
    res.status(500).json({ ok: false, message: 'Error interno al eliminar departamento' });
  }
};
