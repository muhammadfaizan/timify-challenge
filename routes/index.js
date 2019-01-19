const express = require('express');
const router = express.Router();
const { resourceController, consultationController } = require('../controllers/index');

router.get('/resources', resourceController.getResources);
router.post('/resources', resourceController.createAndUpdateResources);
router.get('/availability', consultationController.findAvailability);
router.get('/consultations', consultationController.getAllConsultations);
router.get('/consultations', consultationController.createConsultation);

module.exports = router;
