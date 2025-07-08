const express = require('express');
const router = express.Router();
const controller = require('../controllers/project.controller');

router.post('/', controller.createProject);
router.get('/', controller.getAllProjects);
router.get('/:id', controller.getProjectById);

module.exports = router;
