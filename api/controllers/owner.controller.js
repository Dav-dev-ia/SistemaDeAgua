const prisma = require('../lib/prisma');

exports.getDashboard = async (req, res) => {
  try {
    const userId = req.user.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { apartment: true }
    });

    if (!user || !user.apartment) {
      return res.status(400).json({ ok: false, message: 'Usuario sin departamento asignado' });
    }

    const allocations = await prisma.allocation.findMany({
      where: { apartmentId: user.apartment.id },
      include: { period: true },
      orderBy: { id: 'desc' }
    });

    res.json({
      ok: true,
      apartment: user.apartment,
      allocations
    });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Error en el servidor' });
  }
};
