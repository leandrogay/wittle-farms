import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../../app.js';
import Department from '../../models/Department.js';

// ---- Mock the Department model (constructor + statics) ----
vi.mock('../../models/Department.js', () => {
  // We'll export a callable constructor function and attach static methods to it.
  const DeptConstructor = vi.fn();
  // Attach the mongoose-like static methods we need
  DeptConstructor.find = vi.fn();
  DeptConstructor.findById = vi.fn();
  DeptConstructor.findByIdAndUpdate = vi.fn();
  DeptConstructor.findByIdAndDelete = vi.fn();
  return { default: DeptConstructor };
});

describe('Department Routes', () => {
  const mockDept = {
    _id: '68e48a4a10fbb4910a50f2fd',
    name: 'Sales Division',
    description: 'Handles sales operations',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  const mockDepts = [
    { ...mockDept },
    {
      _id: '68e48bcf10fbb4910a50f30f',
      name: 'HR and Admin',
      description: 'People ops & admin',
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---------- CREATE ----------
  describe('POST /api/departments', () => {
    it('should create a new department successfully', async () => {
      const payload = { name: 'Engineering', description: 'Builds products' };
      const savedDoc = {
        _id: '68f1111110fbb4910a50f3aa',
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      Department.mockImplementation(({ name, description }) => {
        const instance = {
          name,
          description,
          save: vi.fn().mockImplementation(async () => {
            Object.assign(instance, savedDoc);
            return instance;
          }),
        };
        return instance;
      });

      const res = await request(app)
        .post('/api/departments')
        .send(payload)
        .expect(201);

      expect(res.body).toMatchObject({
        _id: savedDoc._id,
        name: payload.name,
        description: payload.description,
      });
      expect(Department).toHaveBeenCalledTimes(1);
      expect(Department).toHaveBeenCalledWith(payload);
    });


    it('should return 400 when validation fails (e.g., missing name)', async () => {
      const payload = { description: 'No name provided' };

      Department.mockImplementation(() => {
        return {
          save: vi.fn().mockRejectedValue(new Error('Department validation failed: name: Path `name` is required.')),
        };
      });

      const res = await request(app)
        .post('/api/departments')
        .send(payload)
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  // ---------- READ ALL ----------
  describe('GET /api/departments', () => {
    it('should return all departments sorted by createdAt desc', async () => {
      // Mock: Department.find().sort({createdAt:-1}) -> mockDepts
      const mockQuery = {
        sort: vi.fn().mockResolvedValue(mockDepts),
      };
      Department.find.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/departments')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(Department.find).toHaveBeenCalledWith();
      expect(mockQuery.sort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should handle database errors', async () => {
      const mockQuery = {
        sort: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      };
      Department.find.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/departments')
        .expect(500);

      expect(res.body.message).toBeDefined();
    });
  });

  // ---------- READ ONE ----------
  describe('GET /api/departments/:id', () => {
    it('should return a department by id', async () => {
      Department.findById.mockResolvedValue(mockDept);

      const res = await request(app)
        .get(`/api/departments/${mockDept._id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        _id: mockDept._id,
        name: mockDept.name,
        description: mockDept.description,
      });
      expect(Department.findById).toHaveBeenCalledWith(mockDept._id);
    });

    it('should return 404 when department not found', async () => {
      Department.findById.mockResolvedValue(null);

      const res = await request(app)
        .get('/api/departments/68e48a4a10fbb4910a50ffff')
        .expect(404);

      expect(res.body.message).toBe('Department not found');
    });

    it('should return 500 on invalid ObjectId or db error', async () => {
      Department.findById.mockRejectedValue(new Error('Cast to ObjectId failed'));

      const res = await request(app)
        .get('/api/departments/invalid-id')
        .expect(500);

      expect(res.body.message).toBeDefined();
    });
  });

  // ---------- UPDATE ----------
  describe('PUT /api/departments/:id', () => {
    it('should update a department successfully', async () => {
      const updateData = { name: 'Sales & BizDev', description: 'New desc' };
      const updated = { ...mockDept, ...updateData };

      Department.findByIdAndUpdate.mockResolvedValue(updated);

      const res = await request(app)
        .put(`/api/departments/${mockDept._id}`)
        .send(updateData)
        .expect(200);

      expect(res.body.name).toBe('Sales & BizDev');
      expect(res.body.description).toBe('New desc');
      expect(Department.findByIdAndUpdate).toHaveBeenCalledWith(
        mockDept._id,
        updateData,
        { new: true, runValidators: true },
      );
    });

    it('should return 404 when updating a non-existent department', async () => {
      Department.findByIdAndUpdate.mockResolvedValue(null);

      const res = await request(app)
        .put('/api/departments/68e48a4a10fbb4910a50ffff')
        .send({ name: 'NonExistent' })
        .expect(404);

      expect(res.body.message).toBe('Department not found');
    });

    it('should return 400 on validation error during update', async () => {
      Department.findByIdAndUpdate.mockRejectedValue(new Error('Validation failed'));

      const res = await request(app)
        .put(`/api/departments/${mockDept._id}`)
        .send({ name: '' })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });
  });

  // ---------- DELETE ----------
  describe('DELETE /api/departments/:id', () => {
    it('should delete a department successfully', async () => {
      Department.findByIdAndDelete.mockResolvedValue(mockDept);

      const res = await request(app)
        .delete(`/api/departments/${mockDept._id}`)
        .expect(200);

      expect(res.body.message).toBe('Department deleted successfully');
      expect(Department.findByIdAndDelete).toHaveBeenCalledWith(mockDept._id);
    });

    it('should return 404 when deleting a non-existent department', async () => {
      Department.findByIdAndDelete.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/departments/68e48a4a10fbb4910a50ffff')
        .expect(404);

      expect(res.body.message).toBe('Department not found');
    });

    it('should handle database errors on delete', async () => {
      Department.findByIdAndDelete.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .delete(`/api/departments/${mockDept._id}`)
        .expect(500);

      expect(res.body.message).toBeDefined();
    });
  });
});
