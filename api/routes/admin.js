const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { verifyToken, requireAdmin } = require('../middlewares/auth.middleware');

router.use(verifyToken, requireAdmin);

router.get('/dashboard', adminController.getDashboard);
router.get('/blocks', adminController.getBlocks);
router.get('/apartments', adminController.getApartments);
router.post('/apartments', adminController.createApartment);

router.get('/periods', adminController.getPeriods);
router.post('/periods', adminController.createPeriod);
router.post('/periods/:id/readings', adminController.saveReadings);
router.post('/periods/:id/settle', adminController.settlePeriod);
router.get('/periods/:id/allocations', adminController.getAllocations);

router.post('/allocations/:id/payments', adminController.registerPayment);

module.exports = router;
