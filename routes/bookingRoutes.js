const express = require('express');
const authController = require('../controllers/authController');
const bookingController = require('../controllers/bookingController');
const router = express.Router({ mergeParams: true });

router.get('/checkout-session/:tourID', authController.protect, bookingController.getCheckoutSession);

module.exports = router;
