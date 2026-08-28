require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const ownerRoutes = require('./routes/owner');

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/owner', ownerRoutes);

app.get('/api/health', (req, res) => {
  res.json({ ok: true, message: 'API AguaPago operativa (Node.js)' });
});

app.use((req, res, next) => {
  res.status(404).json({ ok: false, message: 'Recurso no encontrado' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ ok: false, message: 'Error interno del servidor' });
});

// Exportamos la app para que Vercel Serverless pueda usarla
module.exports = app;

// Si estamos en entorno local, levantamos el servidor
if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`Servidor Node.js corriendo en el puerto ${PORT}`);
  });
}
