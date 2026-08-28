const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/owner.controller');
const { verifyToken, requireOwner } = require('../middlewares/auth.middleware');

// requireOwner ahora permite ADMIN también
router.use(verifyToken, requireOwner);

router.get('/dashboard', ownerController.getDashboard);
router.get('/payments', ownerController.getPaymentHistory);

module.exports = router;
