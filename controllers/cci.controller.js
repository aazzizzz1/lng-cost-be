const prisma = require('../config/db');

exports.createCCI = async (req, res) => {
  try {
    const cciData = await prisma.cci.create({ data: req.body });
    res.status(201).json({
      message: 'CCI data created successfully.',
      data: cciData,
    });
  } catch (error) {
    res.status(400).json({ message: 'Failed to create CCI data', error: error.message });
  }
};

exports.getAllCCI = async (req, res) => {
  try {
    const cciData = await prisma.cci.findMany();
    res.json({
      message: 'CCI data retrieved successfully.',
      data: cciData,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch CCI data', error: error.message });
  }
};

// NEW: get CCI by id (admin)
exports.getCCIById = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const cciData = await prisma.cci.findUnique({ where: { id } });
    if (!cciData) return res.status(404).json({ message: 'CCI not found' });
    res.json({ message: 'CCI data retrieved successfully.', data: cciData });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch CCI data', error: error.message });
  }
};

// NEW: update CCI by id (admin)
exports.updateCCI = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    const updated = await prisma.cci.update({
      where: { id },
      data: req.body,
    });
    res.json({ message: 'CCI data updated successfully.', data: updated });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'CCI not found' });
    res.status(400).json({ message: 'Failed to update CCI data', error: error.message });
  }
};

// NEW: delete CCI by id (admin)
exports.deleteCCI = async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: 'Invalid id' });
  try {
    await prisma.cci.delete({ where: { id } });
    res.json({ message: 'CCI data deleted successfully.' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'CCI not found' });
    res.status(400).json({ message: 'Failed to delete CCI data', error: error.message });
  }
};
