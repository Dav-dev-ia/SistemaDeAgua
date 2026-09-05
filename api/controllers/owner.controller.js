const prisma = require('../lib/prisma');
const { toSnakeCaseObj } = require('../lib/transformers');

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
        meter: user.apartment.meters.find(m => m.isActive) ? {
          id: user.apartment.meters.find(m => m.isActive).id,
          code: user.apartment.meters.find(m => m.isActive).code,
          is_inverted: user.apartment.meters.find(m => m.isActive).isInverted,
          is_active: user.apartment.meters.find(m => m.isActive).isActive
        } : null
      },

      stats: {
        total_debt_bs: Math.round(totalDebt * 100) / 100,
        total_paid_bs: Math.round(totalPaid * 100) / 100,
        pending_periods: allocations.filter(a => a.status === 'PENDIENTE').length
      },
      allocations: allocations.map(a => {
        const mapped = toSnakeCaseObj(a);
        mapped.pending_amount_bs = Math.max(0, Math.round((a.amountDueBs - a.amountPaidBs) * 100) / 100);
        return mapped;
      })
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

    res.json({ ok: true, payments: toSnakeCaseObj(payments) });
  } catch (error) {
    console.error('Error en getPaymentHistory:', error);
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};
