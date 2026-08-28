const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET_KEY || 'dev-jwt-secret-change-in-production';

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
    return res.status(401).json({ ok: false, message: 'Invalid token' });
  }
};

exports.requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    res.status(403).json({ ok: false, message: 'Acceso denegado. Se requiere rol de administrador.' });
  }
};

exports.requireOwner = (req, res, next) => {
  if (req.user && req.user.role === 'OWNER') {
    next();
  } else {
    res.status(403).json({ ok: false, message: 'Acceso denegado. Se requiere rol de propietario.' });
  }
};
