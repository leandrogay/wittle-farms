import { Router } from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';

const router = Router();

// Populate helper - centralized user population logic
const populateUser = (query) => query.populate('department', 'name');


/**
 * @openapi
 * /api/users:
 *   post:
 *     tags: [Users]
 *     summary: Create a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Fields for the new user (must match your User model)
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Validation error
 */
/**
 * CREATE User
 * POST /api/users
 */
router.post('/', async (req, res) => {
  try {
    const user = await User.create(req.body);
    res.status(201).json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


/**
 * @openapi
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: List users
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *         description: Optional role filter
 *     responses:
 *       200:
 *         description: OK
 *       500:
 *         description: Server error
 */
/**
 * READ All Users (with optional filters)
 * GET /api/users
 */
router.get('/', async (req, res) => {
  try {
    const { role } = req.query;
    const filter = {};
    if (role) filter.role = role;

    const users = await populateUser(User.find(filter)).lean();
    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/**
 * @openapi
 * /api/users/username/{username}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user by username
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
/**
 * READ Single User by username
 * GET /api/users/username/:username
 */
router.get('/username/:username', async (req, res) => {
  try {
    const user = await populateUser(User.findOne({name: req.params.username})).lean();
    if (!user) return res.status(404).json({error: 'User not found'});
    res.status(200).json(user);
  } catch (e) {
    res.status(500).json({error: e.message});
  }
});


/**
 * @openapi
 * /api/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           description: MongoDB ObjectId
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Invalid user id
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
/**
 * READ Single User
 * GET /api/users/:id
 */
router.get('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const user = await populateUser(User.findById(req.params.id)).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


/**
 * @openapi
 * /api/users/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update a user
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           description: MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Fields to update (validated by the model)
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Invalid user id or validation error
 *       404:
 *         description: User not found
 */
/**
 * UPDATE User
 * PUT /api/users/:id
 */
router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const user = await populateUser(
      User.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      )
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});


/**
 * @openapi
 * /api/users/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           description: MongoDB ObjectId
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       400:
 *         description: Invalid user id
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
/**
 * DELETE User
 * DELETE /api/users/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted successfully' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;