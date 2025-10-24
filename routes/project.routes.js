const express = require('express');
const router = express.Router();
const controller = require('../controllers/project.controller');

// Routes without authorization middleware (checks handled in controllers)
router.get('/', controller.getAllProjects);
router.get('/manual', controller.getManualProjects);
// NEW: auto-generated projects
router.get('/auto', controller.getAutoProjects);
// NEW: approved projects library (public)
router.get('/library', controller.getApprovedProjects);
// NEW: filters for dropdowns
router.get('/filters', controller.getProjectFilterOptions);
// More specific route comes before "/:id"
router.get('/:id/estimation', controller.calculateProjectEstimation);
router.get('/:id', controller.getProjectById);
router.post('/', controller.createProject);
router.post('/recommend', controller.recommendConstructionCostsAndCreateProject);
router.put('/:id', controller.updateProject);
router.patch('/:id/approval', controller.updateApproval);

// NEW: bulk delete by category (admin-only; enforced in controller)
// Place before "/:id" to avoid being captured by the param route
router.delete('/auto', controller.deleteAutoProjects);
router.delete('/manual', controller.deleteManualProjects);

router.delete('/:id', controller.deleteProject);
// Admin-only enforced inside controller
router.delete('/', controller.deleteAllProjects);

module.exports = router;
