const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/owner.controller');
const { verifyToken, requireOwner } = require('../middlewares/auth.middleware');

router.use(verifyToken, requireOwner);

router.get('/dashboard', ownerController.getDashboard);

module.exports = router;
