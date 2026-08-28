const prisma = require('../lib/prisma');

exports.getDashboard = async (req, res) => {
  try {
    const totalApartments = await prisma.apartment.count();
    const openPeriod = await prisma.billingPeriod.findFirst({ where: { status: 'OPEN' } });
    const recentPeriods = await prisma.billingPeriod.findMany({
      orderBy: { id: 'desc' },
      take: 5
    });

    // Calcular totales cobrados y pendientes de TODOS los periodos
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
      recent_periods: recentPeriods
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
      distinct: ['block']
    });
    res.json({ ok: true, blocks: blocks.map(b => b.block) });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.getApartments = async (req, res) => {
  try {
    const { block, search } = req.query;
    const where = {};
    if (block) where.block = block;
    if (search) {
      where.OR = [
        { ownerName: { contains: search } },
        { number: { contains: search } }
      ];
    }
    const apartments = await prisma.apartment.findMany({
      where,
      include: { meters: true }
    });
    const mapped = apartments.map(apt => ({
      ...apt,
      meter: apt.meters.length > 0 ? apt.meters[0] : null
    }));
    res.json({ ok: true, apartments: mapped });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.createApartment = async (req, res) => {
  try {
    const { block, number, owner_name, phone, coefficient, meter_code, meter_is_inverted } = req.body;
    const existing = await prisma.apartment.findUnique({
      where: { uq_apartment_block_number: { block: block.toUpperCase(), number: String(number) } }
    });
    if (existing) return res.status(400).json({ ok: false, message: 'El departamento ya existe' });

    const apt = await prisma.apartment.create({
      data: {
        block: block.toUpperCase(),
        number: String(number),
        ownerName: owner_name,
        phone,
        coefficient: parseFloat(coefficient) || 1.0,
        meters: {
          create: {
            code: meter_code,
            isInverted: meter_is_inverted || false
          }
        }
      },
      include: { meters: true }
    });

    res.status(201).json({ ok: true, message: 'Departamento creado', apartment: apt });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.getPeriods = async (req, res) => {
  try {
    const periods = await prisma.billingPeriod.findMany({ orderBy: { id: 'desc' } });
    res.json({ ok: true, periods });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.createPeriod = async (req, res) => {
  try {
    const { code, common_amount, general_readings } = req.body;
    const existing = await prisma.billingPeriod.findUnique({ where: { code } });
    if (existing) return res.status(400).json({ ok: false, message: 'El periodo ya existe' });

    const open = await prisma.billingPeriod.findFirst({ where: { status: 'OPEN' } });
    if (open) return res.status(400).json({ ok: false, message: 'Hay un periodo abierto, ciérralo primero.' });

    const period = await prisma.billingPeriod.create({
      data: {
        code,
        totalCommonAmountBs: parseFloat(common_amount),
        generalMetersJson: JSON.stringify(general_readings || []),
        status: 'OPEN'
      }
    });

    res.status(201).json({ ok: true, message: 'Periodo creado', period });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Guardar Lecturas ─────────────────────────────────────────────────────────
exports.saveReadings = async (req, res) => {
  const { id } = req.params; // period id
  const { readings } = req.body; // [{ apartment_id, previous_reading, current_reading }]

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

      // Buscar medidor activo del departamento
      const meter = await prisma.meter.findFirst({
        where: { apartmentId, isActive: true }
      });

      if (!meter) {
        errors.push({ apartment_id: apartmentId, error: 'No existe medidor activo para este departamento.' });
        continue;
      }

      // Calcular consumo según si el medidor está invertido (igual al Python original)
      let consumptionM3 = meter.isInverted
        ? previousReading - currentReading
        : currentReading - previousReading;

      consumptionM3 = Math.round(consumptionM3 * 100) / 100;

      if (consumptionM3 < 0) {
        errors.push({ apartment_id: apartmentId, error: 'El consumo no puede ser negativo. Revisa las lecturas del medidor.' });
        continue;
      }

      // Crear o actualizar la lectura (upsert)
      const reading = await prisma.reading.upsert({
        where: { uq_period_meter: { periodId: parseInt(id), meterId: meter.id } },
        create: {
          periodId: parseInt(id),
          apartmentId,
          meterId: meter.id,
          previousReading,
          currentReading,
          consumptionM3,
          sourceJson: JSON.stringify({ source: 'manual' })
        },
        update: {
          previousReading,
          currentReading,
          consumptionM3,
          sourceJson: JSON.stringify({ source: 'manual', updated_at: new Date().toISOString() })
        }
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
    if (readings.length === 0) {
      return res.status(400).json({ ok: false, message: 'No hay lecturas registradas para este periodo.' });
    }
    if (period.totalCommonAmountBs <= 0) {
      return res.status(400).json({ ok: false, message: 'Debes registrar el monto total común (factura) del periodo.' });
    }

    // Consumo total individual de todos los departamentos
    const totalConsumption = Math.round(readings.reduce((sum, r) => sum + r.consumptionM3, 0) * 100) / 100;
    if (totalConsumption <= 0) {
      return res.status(400).json({ ok: false, message: 'El consumo total debe ser mayor que cero para distribuir el pago.' });
    }

    // Consumo general del medidor maestro (si existe)
    const generalTotal = parseFloat(period.generalTotalConsumptionM3 ?? 0);
    const commonDifference = generalTotal > 0 ? Math.round((generalTotal - totalConsumption) * 100) / 100 : 0;

    // Eliminar asignaciones anteriores del periodo (re-liquidar)
    await prisma.allocation.deleteMany({ where: { periodId: parseInt(id) } });

    let distributedTotal = 0;
    const allocations = [];

    for (const reading of readings) {
      const percentage = reading.consumptionM3 / totalConsumption;
      const amountDue = Math.round(period.totalCommonAmountBs * percentage * 100) / 100;
      distributedTotal += amountDue;

      const allocation = await prisma.allocation.create({
        data: {
          periodId: parseInt(id),
          apartmentId: reading.apartmentId,
          consumptionM3: reading.consumptionM3,
          percentageShare: Math.round(percentage * 10000) / 100, // como porcentaje con 2 decimales
          amountDueBs: amountDue,
          amountPaidBs: 0,
          status: 'PENDIENTE',
          breakdownJson: JSON.stringify({
            period_code: period.code,
            consumption_m3: reading.consumptionM3,
            total_consumption_m3: totalConsumption,
            share_ratio: Math.round(percentage * 100000000) / 100000000,
            share_percent: Math.round(percentage * 10000) / 100,
            common_total_amount_bs: Math.round(period.totalCommonAmountBs * 100) / 100,
            general_total_consumption_m3: generalTotal,
            common_difference_m3: commonDifference
          })
        }
      });
      allocations.push(allocation);
    }

    // ── Ajuste de redondeo (como en el Python original) ───────────────────────
    // Si la suma no cuadra exactamente con el total de la factura, ajustar el último
    const roundingAdj = Math.round((period.totalCommonAmountBs - distributedTotal) * 100) / 100;
    if (roundingAdj !== 0 && allocations.length > 0) {
      const last = allocations[allocations.length - 1];
      const newAmount = Math.round((last.amountDueBs + roundingAdj) * 100) / 100;
      const prevBreakdown = JSON.parse(last.breakdownJson || '{}');
      await prisma.allocation.update({
        where: { id: last.id },
        data: {
          amountDueBs: newAmount,
          breakdownJson: JSON.stringify({ ...prevBreakdown, rounding_adjustment_bs: roundingAdj })
        }
      });
      distributedTotal = Math.round((distributedTotal + roundingAdj) * 100) / 100;
    }

    // Actualizar estadísticas del periodo
    const updatedPeriod = await prisma.billingPeriod.update({
      where: { id: parseInt(id) },
      data: {
        totalIndividualConsumptionM3: totalConsumption,
        commonDifferenceM3: commonDifference,
        distributedTotalBs: distributedTotal,
        status: 'CALCULATED'
      }
    });

    // Recargar asignaciones con datos del departamento para la respuesta
    const finalAllocations = await prisma.allocation.findMany({
      where: { periodId: parseInt(id) },
      include: { apartment: true }
    });

    res.json({
      ok: true,
      message: 'Periodo liquidado correctamente.',
      period: updatedPeriod,
      summary: {
        total_consumption_m3: totalConsumption,
        general_total_consumption_m3: generalTotal,
        common_difference_m3: commonDifference,
        distributed_total_bs: distributedTotal
      },
      allocations: finalAllocations
    });
  } catch (error) {
    console.error('Error en settlePeriod:', error);
    res.status(500).json({ ok: false, message: 'Error interno al liquidar el periodo.' });
  }
};

// ─── Obtener Asignaciones ─────────────────────────────────────────────────────
exports.getAllocations = async (req, res) => {
  try {
    const { id } = req.params;
    const allocations = await prisma.allocation.findMany({
      where: { periodId: parseInt(id) },
      include: { apartment: true, payments: true }
    });
    res.json({ ok: true, allocations });
  } catch (error) {
    console.error('Error en getAllocations:', error);
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

// ─── Registrar Pago (Cobro Rápido) ────────────────────────────────────────────
exports.registerPayment = async (req, res) => {
  const { id } = req.params; // allocation id
  const { amount_bs, payment_method, reference, notes } = req.body;

  if (!amount_bs || parseFloat(amount_bs) <= 0) {
    return res.status(400).json({ ok: false, message: 'El monto del pago debe ser mayor que cero.' });
  }

  try {
    const allocation = await prisma.allocation.findUnique({
      where: { id: parseInt(id) }
    });

    if (!allocation) return res.status(404).json({ ok: false, message: 'Recibo no encontrado.' });
    if (allocation.status === 'PAGADO') {
      return res.status(400).json({ ok: false, message: 'Este recibo ya está pagado.' });
    }

    const amountPaid = parseFloat(amount_bs);

    // Registrar el pago en la tabla payments
    const payment = await prisma.payment.create({
      data: {
        allocationId: parseInt(id),
        amountBs: amountPaid,
        paymentMethod: payment_method || 'EFECTIVO',
        reference: reference || null,
        notesJson: notes ? JSON.stringify({ notes }) : null,
        registeredByUserId: req.user?.id || null
      }
    });

    // Sumar todos los pagos del recibo para actualizar amountPaidBs
    const allPayments = await prisma.payment.findMany({
      where: { allocationId: parseInt(id) }
    });
    const totalPaid = Math.round(allPayments.reduce((sum, p) => sum + p.amountBs, 0) * 100) / 100;

    // Determinar nuevo estado: PAGADO si cubre la deuda, sino PARCIAL
    const newStatus = totalPaid >= allocation.amountDueBs ? 'PAGADO' : 'PARCIAL';

    const updatedAllocation = await prisma.allocation.update({
      where: { id: parseInt(id) },
      data: {
        amountPaidBs: totalPaid,
        status: newStatus
      },
      include: { apartment: true, payments: true }
    });

    res.json({
      ok: true,
      message: `Pago de ${amountPaid} Bs registrado. Estado: ${newStatus}.`,
      payment,
      allocation: updatedAllocation
    });
  } catch (error) {
    console.error('Error en registerPayment:', error);
    res.status(500).json({ ok: false, message: 'Error interno al registrar pago.' });
  }
};
