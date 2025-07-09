const prisma = require('../config/db');

exports.createProject = async (req, res) => {
  try {
    const project = await prisma.project.create({ data: req.body }); // Ensure req.body is sanitized
    res.status(201).json(project);
  } catch (error) {
    res.status(400).json({ error: 'Failed to create project' });
  }
};

exports.getAllProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany();
    res.json(projects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
};

exports.getProjectById = async (req, res) => {
  const { id } = req.params;
  try {
    const project = await prisma.project.findUnique({
      where: { id: parseInt(id) }, // Prevent SQL injection by using parameterized queries
      include: { constructionCosts: true },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch project' });
  }
};
