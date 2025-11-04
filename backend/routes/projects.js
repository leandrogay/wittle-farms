import { Router } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project.js';

const router = Router();

/**
 * @openapi
 * /api/projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a project
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Project fields (must match your Project model)
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Validation error
 */
/**
 * CREATE Project
 * POST /api/projects
 */
router.post('/', async (req, res) => {
  try {
    const doc = await Project.create(req.body);

    const project = await Project.findById(doc._id)
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email')
      .populate('department', 'name description')

    res.status(201).json(project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/projects:
 *   get:
 *     tags: [Projects]
 *     summary: List projects
 *     parameters:
 *       - in: query
 *         name: teamMember
 *         schema: { type: string }
 *         description: Filter by team member (ObjectId)
 *       - in: query
 *         name: createdBy
 *         schema: { type: string }
 *         description: Filter by creator (ObjectId)
 *       - in: query
 *         name: department
 *         schema: { type: string }
 *         description: Filter by department (ObjectId)
 *     responses:
 *       200:
 *         description: OK
 *       500:
 *         description: Server error
 */
/**
 * READ All Projects (with optional filters)
 * GET /api/projects?teamMember=USER_ID
 */
router.get('/', async (req, res) => {
  try {
    const { teamMember, createdBy, department } = req.query;
    const filter = {};

    if (createdBy) filter.createdBy = new mongoose.Types.ObjectId(createdBy);
    if (teamMember) filter.teamMembers = new mongoose.Types.ObjectId(teamMember);
    if (department) filter.department = new mongoose.Types.ObjectId(department);
    const projects = await Project.find(filter)
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email')
      .populate('department', 'name description')
      .lean();
    res.json(projects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get a project by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           description: Project ID (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
/**
* READ Single Project
* GET /api/projects/:id
*/
router.get('/:id', async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email')
      .populate('department', 'name description')
      .lean();

    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/projects/user/{userId}:
 *   get:
 *     tags: [Projects]
 *     summary: Get projects for a user (creator or team member)
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           description: User ID (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Invalid user id
 *       404:
 *         description: No projects found for this user
 *       500:
 *         description: Server error
 */
/**
 * READ Project with User
 * GET /api/projects/user/:id
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate ObjectId
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const filter = {
      $or: [{ createdBy: userId }, { teamMembers: userId }]
    };

    const projects = await Project.find(filter)
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email')
      .populate('department', 'name description')
      .lean();

    if (!projects || projects.length === 0) {
      return res.status(404).json({ error: 'No projects found for this user' });
    }

    return res.json(projects);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});


/**
 * @openapi
 * /api/projects/{id}:
 *   put:
 *     tags: [Projects]
 *     summary: Update a project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           description: Project ID (MongoDB ObjectId)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Fields to update (validated by the Project model)
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Invalid request or validation error
 *       404:
 *         description: Project not found
 */
/**
 * UPDATE Project
 * PUT /api/projects/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('createdBy', 'name email')
      .populate('teamMembers', 'name email')
      .populate('department', 'name description')

    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/**
 * @openapi
 * /api/projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Delete a project
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           description: Project ID (MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: Project deleted successfully
 *       404:
 *         description: Project not found
 *       500:
 *         description: Server error
 */
/**
 * DELETE Project
 * DELETE /api/projects/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.id);

    if (!project) return res.status(404).json({ error: 'Project not found' });

    res.json({ message: 'Project deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;