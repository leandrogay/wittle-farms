import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../app.js';
import Project from '../models/Project.js';

// ---- Mock the Project model ----
vi.mock('../models/Project.js', () => {
  return {
    default: {
      create: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    }
  };
});

// ---- Helpers to mock Mongoose query chains ----
/**
 * Creates a chain for: find().sort().populate().populate().populate().lean()
 */
const makeFindListChain = (result) => {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
  return chain;
};

/**
 * Creates a chain for: findById(...).populate().populate().populate().lean()
 */
const makeFindOneLeanChain = (result) => {
  const chain = {
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
  return chain;
};

/**
 * Creates a chain for: findById(...).populate().populate().populate()  (no .lean())
 * and returns a Promise (await-able) after the final populate call.
 */
const makePopulateOnlyThenable = (resolvedValue) => {
  // build three-step populate chain; the third returns a Promise that resolves to the doc
  const third = {
    populate: vi.fn().mockResolvedValue(resolvedValue),
  };
  const second = {
    populate: vi.fn().mockReturnValue(third),
  };
  const first = {
    populate: vi.fn().mockReturnValue(second),
  };
  return first;
};

describe('Project Routes', () => {
  // Mock data
  const mockProject = {
    _id: '65af1f77bcf86cd799439001',
    name: 'AI Benchmark',
    department: ['68e48a4a10fbb4910a50f2fd'],
    deadline: new Date('2025-12-31T00:00:00.000Z'),
    description: 'Build ASEAN benchmark taxonomy',
    createdBy: '507f1f77bcf86cd799439011',
    teamMembers: ['507f1f77bcf86cd799439013'],
    createdAt: new Date('2025-01-01T00:00:00.000Z'),
    updatedAt: new Date('2025-01-01T00:00:00.000Z'),
  };

  const populatedProject = {
    ...mockProject,
    createdBy: { _id: '507f1f77bcf86cd799439011', name: 'John Doe', email: 'john@test.com' },
    teamMembers: [{ _id: '507f1f77bcf86cd799439013', name: 'Jane Smith', email: 'jane@test.com' }],
    department: [{ _id: '68e48a4a10fbb4910a50f2fd', name: 'Sales Division', description: 'Sales' }],
  };

  const mockProjects = [
    populatedProject,
    {
      ...populatedProject,
      _id: '65af1f77bcf86cd799439002',
      name: 'Security Uplift',
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- POST /api/projects ----
  describe('POST /api/projects', () => {
    it('creates a project and returns the populated document', async () => {
      const payload = {
        name: 'AI Benchmark',
        department: ['68e48a4a10fbb4910a50f2fd'],
        deadline: '2025-12-31',
        description: 'Build ASEAN benchmark taxonomy',
        createdBy: '507f1f77bcf86cd799439011',
        teamMembers: ['507f1f77bcf86cd799439013'],
      };

      const createdDoc = { _id: mockProject._id };
      Project.create.mockResolvedValue(createdDoc);

      // Chain: findById(...).populate().populate().populate() -> resolves to populatedProject
      Project.findById.mockReturnValue(makePopulateOnlyThenable(populatedProject));

      const res = await request(app)
        .post('/api/projects')
        .send(payload)
        .expect(201);

      expect(Project.create).toHaveBeenCalledWith(payload);
      expect(Project.findById).toHaveBeenCalledWith(createdDoc._id);
      expect(res.body._id).toBe(mockProject._id);
      expect(res.body.createdBy.email).toBe('john@test.com');
    });

    it('returns 400 on validation error', async () => {
      Project.create.mockRejectedValue(new Error('Project validation failed: name is required'));

      const res = await request(app)
        .post('/api/projects')
        .send({}) // missing required fields
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  // ---- GET /api/projects (list with optional filters) ----
  describe('GET /api/projects', () => {
    it('returns all projects sorted by createdAt desc', async () => {
      Project.find.mockReturnValue(makeFindListChain(mockProjects));

      const res = await request(app)
        .get('/api/projects')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(Project.find).toHaveBeenCalledWith({});
    });

    it('filters by createdBy, teamMember, department', async () => {
      Project.find.mockReturnValue(makeFindListChain([populatedProject]));

      const res = await request(app)
        .get('/api/projects')
        .query({
          createdBy: '507f1f77bcf86cd799439011',
          teamMember: '507f1f77bcf86cd799439013',
          department: '68e48a4a10fbb4910a50f2fd'
        })
        .expect(200);

      // We can only assert shape because the route wraps IDs in ObjectId instances
      expect(Project.find).toHaveBeenCalledWith(expect.objectContaining({
        createdBy: expect.anything(),
        teamMembers: expect.anything(),
        department: expect.anything(),
      }));
      expect(res.body).toHaveLength(1);
    });

    it('handles database errors', async () => {
      const chain = makeFindListChain([]);
      chain.lean.mockRejectedValue(new Error('Database connection failed'));
      Project.find.mockReturnValue(chain);

      const res = await request(app)
        .get('/api/projects')
        .expect(500);

      expect(res.body.error).toBeDefined();
    });
  });

  // ---- GET /api/projects/:id ----
  describe('GET /api/projects/:id', () => {
    it('returns a single project by id', async () => {
      Project.findById.mockReturnValue(makeFindOneLeanChain(populatedProject));

      const res = await request(app)
        .get(`/api/projects/${mockProject._id}`)
        .expect(200);

      expect(Project.findById).toHaveBeenCalledWith(mockProject._id);
      expect(res.body._id).toBe(mockProject._id);
      expect(res.body.name).toBe('AI Benchmark');
    });

    it('returns 404 when not found', async () => {
      Project.findById.mockReturnValue(makeFindOneLeanChain(null));

      const res = await request(app)
        .get('/api/projects/65af1f77bcf86cd799439099')
        .expect(404);

      expect(res.body.error).toBe('Project not found');
    });

    it('returns 500 on cast/other errors', async () => {
      const chain = makeFindOneLeanChain(null);
      chain.lean.mockRejectedValue(new Error('Cast to ObjectId failed'));
      Project.findById.mockReturnValue(chain);

      const res = await request(app)
        .get('/api/projects/invalid-id')
        .expect(500);

      expect(res.body.error).toBeDefined();
    });
  });

  // ---- GET /api/projects/user/:userId ----
  describe('GET /api/projects/user/:userId', () => {
    it('rejects invalid user id with 400', async () => {
      const res = await request(app)
        .get('/api/projects/user/not-an-objectid')
        .expect(400);

      expect(res.body.error).toBe('Invalid user id');
    });

    it('returns projects for a user (createdBy or teamMembers)', async () => {
      const chain = makeFindListChain([populatedProject]);
      // This route: find(filter).populate(...).populate(...).populate(...).lean()
      Project.find.mockReturnValue(chain);

      const res = await request(app)
        .get('/api/projects/user/507f1f77bcf86cd799439011')
        .expect(200);

      expect(Project.find).toHaveBeenCalledWith({
        $or: [{ createdBy: '507f1f77bcf86cd799439011' }, { teamMembers: '507f1f77bcf86cd799439011' }]
      });
      expect(res.body).toHaveLength(1);
      expect(res.body[0]._id).toBe(mockProject._id);
    });

    it('returns 404 when none found for user', async () => {
      const chain = makeFindListChain([]);
      Project.find.mockReturnValue(chain);

      const res = await request(app)
        .get('/api/projects/user/507f1f77bcf86cd799439011')
        .expect(404);

      expect(res.body.error).toBe('No projects found for this user');
    });

    it('handles database errors', async () => {
      const chain = makeFindListChain([]);
      chain.lean.mockRejectedValue(new Error('DB error'));
      Project.find.mockReturnValue(chain);

      const res = await request(app)
        .get('/api/projects/user/507f1f77bcf86cd799439011')
        .expect(500);

      expect(res.body.error).toBeDefined();
    });
  });

  // ---- PUT /api/projects/:id ----
  describe('PUT /api/projects/:id', () => {
    it('updates a project and returns the populated document', async () => {
      const update = { name: 'AI Benchmark – Updated' };
      const updated = { ...populatedProject, ...update };

      // Route: findByIdAndUpdate(...).populate().populate().populate() -> Promise resolves to updated doc
      Project.findByIdAndUpdate.mockReturnValue(makePopulateOnlyThenable(updated));

      const res = await request(app)
        .put(`/api/projects/${mockProject._id}`)
        .send(update)
        .expect(200);

      expect(Project.findByIdAndUpdate).toHaveBeenCalledWith(
        mockProject._id,
        update,
        { new: true, runValidators: true }
      );
      expect(res.body.name).toBe('AI Benchmark – Updated');
    });

    it('returns 404 if project not found', async () => {
      // Make the third populate resolve to null
      const third = { populate: vi.fn().mockResolvedValue(null) };
      const second = { populate: vi.fn().mockReturnValue(third) };
      const first = { populate: vi.fn().mockReturnValue(second) };
      Project.findByIdAndUpdate.mockReturnValue(first);

      const res = await request(app)
        .put('/api/projects/65af1f77bcf86cd799439099')
        .send({ name: 'X' })
        .expect(404);

      expect(res.body.error).toBe('Project not found');
    });

    it('returns 400 on validation error', async () => {
      const errPop = {
        populate: vi.fn().mockRejectedValue(new Error('Validation failed')),
      };
      Project.findByIdAndUpdate.mockReturnValue(errPop);

      const res = await request(app)
        .put(`/api/projects/${mockProject._id}`)
        .send({ name: '' })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  // ---- DELETE /api/projects/:id ----
  describe('DELETE /api/projects/:id', () => {
    it('deletes a project successfully', async () => {
      Project.findByIdAndDelete.mockResolvedValue(populatedProject);

      const res = await request(app)
        .delete(`/api/projects/${mockProject._id}`)
        .expect(200);

      expect(Project.findByIdAndDelete).toHaveBeenCalledWith(mockProject._id);
      expect(res.body.message).toBe('Project deleted successfully');
    });

    it('returns 404 when project not found', async () => {
      Project.findByIdAndDelete.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/projects/65af1f77bcf86cd799439099')
        .expect(404);

      expect(res.body.error).toBe('Project not found');
    });

    it('handles database errors', async () => {
      Project.findByIdAndDelete.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .delete(`/api/projects/${mockProject._id}`)
        .expect(500);

      expect(res.body.error).toBeDefined();
    });
  });
});
