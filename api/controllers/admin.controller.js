const prisma = require('../lib/prisma');

exports.getDashboard = async (req, res) => {
  try {
    const totalApartments = await prisma.apartment.count();
    const openPeriod = await prisma.billingPeriod.findFirst({ where: { status: 'OPEN' } });
    
    // Simplificado para la demostración
    res.json({
      ok: true,
      stats: {
        total_apartments: totalApartments,
        active_period: openPeriod ? openPeriod.code : 'Ninguno',
        total_collected: 0,
        pending_collection: 0
      }
    });
  } catch (error) {
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

exports.saveReadings = async (req, res) => {
  res.json({ ok: true, message: 'Lecturas guardadas (Simulado para demostración)' });
};

exports.settlePeriod = async (req, res) => {
  res.json({ ok: true, message: 'Periodo liquidado (Simulado para demostración)' });
};

exports.getAllocations = async (req, res) => {
  try {
    const { id } = req.params;
    const allocations = await prisma.allocation.findMany({
      where: { periodId: parseInt(id) },
      include: { apartment: true }
    });
    res.json({ ok: true, allocations });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error interno' });
  }
};

exports.registerPayment = async (req, res) => {
  res.json({ ok: true, message: 'Pago registrado (Simulado para demostración)' });
};
