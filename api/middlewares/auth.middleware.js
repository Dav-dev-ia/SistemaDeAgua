const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET_KEY;

if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET_KEY no está definida en las variables de entorno.');
  // No detenemos el proceso para no romper Vercel en cold start, pero los tokens fallarán
}

exports.verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ ok: false, message: 'Token expirado. Por favor inicia sesión de nuevo.' });
    }
    return res.status(401).json({ ok: false, message: 'Token inválido' });
  }
};

exports.requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ ok: false, message: 'Acceso denegado. Se requiere rol de administrador.' });
  }
};

// OWNER o ADMIN pueden acceder (admin puede ver datos de cualquier propietario)
exports.requireOwner = (req, res, next) => {
  if (req.user && (req.user.role === 'OWNER' || req.user.role === 'ADMIN')) {
    next();
  } else {
    res.status(403).json({ ok: false, message: 'Acceso denegado.' });
  }
};

exports.requireAdminOrSelf = (req, res, next) => {
  const targetId = parseInt(req.params.userId || req.params.id);
  if (req.user.role === 'ADMIN' || req.user.sub === targetId) {
    next();
  } else {
    res.status(403).json({ ok: false, message: 'Acceso denegado.' });
  }
};
