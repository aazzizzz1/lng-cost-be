const prisma = require('../config/db');

exports.createProject = async (req, res) => {
  try {
    const project = await prisma.project.create({ data: req.body }); // Ensure req.body is sanitized
    res.status(201).json({
      message: 'Project created successfully.',
      data: project,
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create project', data: null });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    res.json({
      message: 'Objects retrieved successfully.',
      data: projects,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch projects', data: null });
  }
};

exports.getProjectById = async (req, res) => {
  const { id } = req.params;
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(id) }, // Prevent SQL injection by using parameterized queries
      include: { constructionCosts: true },
    });
    if (!project)
      return res.status(404).json({ message: 'Project not found', data: null });
    res.json({
      message: 'Object retrieved successfully.',
      data: project,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch project', data: null });
  }
};
