import { Router } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project.js';

const router = Router();

// Helper function for consistent population
const populateProjectFields = (query) => {
  return query
    .populate('createdBy', 'name email')
    .populate('teamMembers', 'name email')
    .populate('department', 'name');
};

/**
 * CREATE Project
 * POST /api/projects
 */
router.post('/', async (req, res) => {
  try {
    const doc = await Project.create(req.body);
    const project = await populateProjectFields(
      Project.findById(doc._id)
    );
    res.status(201).json(project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * READ All Projects (with optional filters)
 * GET /api/projects?teamMember=USER_ID&createdBy=USER_ID&department=DEPT_ID
 */
router.get('/', async (req, res) => {
  try {
    const { teamMember, createdBy, department } = req.query;
    const filter = {};
    
    if (createdBy) {
      filter.createdBy = new mongoose.Types.ObjectId(createdBy);
    }
    
    if (teamMember) {
      filter.teamMembers = new mongoose.Types.ObjectId(teamMember);
    }
    
    if (department) {
      filter.department = new mongoose.Types.ObjectId(department);
    }
    
    const projects = await populateProjectFields(
      Project.find(filter).sort({ createdAt: -1 })
    ).lean();
    
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * READ Single Project
 * GET /api/projects/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await populateProjectFields(
      Project.findById(req.params.id)
    ).lean();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * READ Projects by User (created by or team member)
 * GET /api/projects/user/:userId
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Validate ObjectId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    
    const filter = {
      $or: [
        { createdBy: userId },
        { teamMembers: userId }
      ]
    };
    
    const projects = await populateProjectFields(
      Project.find(filter).sort({ createdAt: -1 })
    ).lean();
    
    if (!projects || projects.length === 0) {
      return res.status(404).json({ error: 'No projects found for this user' });
    }
    
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * UPDATE Project
 * PUT /api/projects/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const project = await populateProjectFields(
      Project.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      )
    );
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * DELETE Project
 * DELETE /api/projects/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ message: 'Project deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;