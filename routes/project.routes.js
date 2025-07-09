const express = require('express');
const router = express.Router();
const controller = require('../controllers/project.controller');
const { authenticate } = require('../middlewares/auth.middleware'); // Authentication middleware

// Only authenticated users can see projects
router.get('/', authenticate, controller.getAllProjects); // Ensures only authenticated users can access
router.get('/:id', authenticate, controller.getProjectById); // Prevents unauthorized access to project details
router.post('/', authenticate, controller.createProject); // Ensures only authenticated users can create projects

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
