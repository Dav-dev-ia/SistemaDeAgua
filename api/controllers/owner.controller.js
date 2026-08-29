const prisma = require('../lib/prisma');

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
    period: a.period ? {
      id: a.period.id,
      code: a.period.code,
      status: a.period.status
    } : null,
    payments: (a.payments || []).map(p => ({
      id: p.id,
      amount_bs: p.amountBs,
      payment_method: p.paymentMethod,
      reference: p.reference,
      created_at: p.createdAt,
    })),
  };
};

// ─── Dashboard del propietario: su apartamento y todos sus recibos ────────────
exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { apartment: { include: { meters: true } } }
    });

    if (!user || !user.apartment) {
      return res.status(400).json({ ok: false, message: 'Usuario sin departamento asignado' });
    }

    // Todos los recibos del departamento con el periodo correspondiente
    const allocations = await prisma.allocation.findMany({
      where: { apartmentId: user.apartment.id },
      include: {
        period: true,
        payments: {
          orderBy: { createdAt: 'desc' }
        }
      },
      orderBy: { id: 'desc' }
    });

    // Estadísticas resumidas
    const totalDebt = allocations
      .filter(a => a.status !== 'PAGADO')
      .reduce((sum, a) => sum + (a.amountDueBs - a.amountPaidBs), 0);

    const totalPaid = allocations.reduce((sum, a) => sum + a.amountPaidBs, 0);

    res.json({
      ok: true,
      apartment: {
        id: user.apartment.id,
        block: user.apartment.block,
        number: user.apartment.number,
        owner_name: user.apartment.ownerName,
        phone: user.apartment.phone,
        coefficient: user.apartment.coefficient,
        meter: user.apartment.meters.find(m => m.isActive) || null
      },
      stats: {
        total_debt_bs: Math.round(totalDebt * 100) / 100,
        total_paid_bs: Math.round(totalPaid * 100) / 100,
        pending_periods: allocations.filter(a => a.status === 'PENDIENTE').length
      },
      allocations: allocations.map(mapAllocation)
    });
  } catch (error) {
    console.error('Error en owner getDashboard:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};

// ─── Historial de pagos del propietario ───────────────────────────────────────
exports.getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { apartment: true }
    });

    if (!user || !user.apartment) {
      return res.status(400).json({ ok: false, message: 'Usuario sin departamento asignado' });
    }

    const payments = await prisma.payment.findMany({
      where: {
        allocation: { apartmentId: user.apartment.id }
      },
      include: {
        allocation: { include: { period: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ ok: true, payments });
  } catch (error) {
    console.error('Error en getPaymentHistory:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};
