const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/bootstrap-admin', authController.bootstrapAdmin);

module.exports = router;
