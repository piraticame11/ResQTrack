const express = require('express');
const router  = express.Router();
const { auth, requireRole } = require('../middleware/auth');
const {
  getMonthlyReport, getAnnualReport, getByPurok,
  getByType, getTypeByMonth, getResponderPerformance,
} = require('../controllers/report.controller');

router.use(auth, requireRole('admin'));

router.get('/monthly',              getMonthlyReport);
router.get('/annual',               getAnnualReport);
router.get('/by-purok',             getByPurok);
router.get('/by-type',              getByType);
router.get('/type-by-month',        getTypeByMonth);
router.get('/responder-performance', getResponderPerformance);

module.exports = router;
