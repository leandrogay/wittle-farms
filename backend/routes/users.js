import { Router } from 'express';
import User from '../models/User.js';

const router = Router();

/*
 * CREATE Task
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

/*
 * READ All Users (with optional filters)
 * GET /api/users
 */
router.get('/', async (req, res) => {
  try {
    const { role } = req.query;
    const filter = {};
    if (role) filter.role = role;

    const users = await User.find(filter)
      .lean();

    res.json(users);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/*
* READ Single User 
* GET /api/users/:id
*/
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .lean();

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json(user);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/*
 * UPDATE User
 * PUT /api/users/:id
 */
router.put('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json(user);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/*
 * DELTE User
 * DELETE /api/users/:id
 */
router.delete('/:id', async (req, res) => {
   try {
      const user = await User.findByIdAndDelete(req.params.id);
  
      if (!user) return res.status(404).json({ error: 'User not found' });
  
      res.json({ message: 'User deleted successfully' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

export default router; 