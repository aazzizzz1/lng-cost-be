const express = require('express');
const router = express.Router();
const controller = require('../controllers/project.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Only authenticated users can see projects
router.get('/', authenticate, controller.getAllProjects);
router.get('/:id', authenticate, controller.getProjectById);
router.post('/', authenticate, controller.createProject);

// Only admin can create project
// router.post('/', authenticate, authorizeRoles('admin'), controller.createProject);

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
