const express = require('express');
const router = express.Router();
const controller = require('../controllers/project.controller');

// Routes without authorization middleware (checks handled in controllers)
router.get('/', controller.getAllProjects);
router.get('/manual', controller.getManualProjects);
// NEW: approved projects library (public)
router.get('/library', controller.getApprovedProjects);
// More specific route comes before "/:id"
router.get('/:id/estimation', controller.calculateProjectEstimation);
router.get('/:id', controller.getProjectById);
router.post('/', controller.createProject);
router.post('/recommend', controller.recommendConstructionCostsAndCreateProject);
router.put('/:id', controller.updateProject);
router.delete('/:id', controller.deleteProject);
// Admin-only enforced inside controller
router.delete('/', controller.deleteAllProjects);

module.exports = router;


// const express = require('express');
// const router = express.Router();
// const { authenticate, authorizeRoles } = require('../middlewares/auth.middleware');
// const projectController = require('../controllers/project.controller');

// // Hanya user yang login
// router.get('/project/:id', authenticate, projectController.getById);

// // Hanya admin atau superadmin
// router.post('/project', authenticate, authorizeRoles('admin', 'superadmin'), projectController.create);

// // Hanya superadmin
// router.delete('/project/:id', authenticate, authorizeRoles('superadmin'), projectController.delete);
