import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../../app.js';
import User from '../../models/User.js';

// Mock the User model
vi.mock('../../models/User.js', () => {
  return {
    default: {
      create: vi.fn(),
      find: vi.fn(),
      findById: vi.fn(),
      findOne: vi.fn(),
      findByIdAndUpdate: vi.fn(),
      findByIdAndDelete: vi.fn(),
    }
  };
});

describe('User Routes', () => {
  // Mock data
  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    name: 'John Doe',
    email: 'john@test.com',
    role: 'Staff',
    department: '68e48a4a10fbb4910a50f2fd', // Sales Division
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01')
  };

  const mockUsers = [
    mockUser,
    {
      _id: '507f1f77bcf86cd799439013',
      name: 'Jane Smith',
      email: 'jane@test.com',
      role: 'Manager',
      department: '68e48bcf10fbb4910a50f30f', // HR and Admin 
      createdAt: new Date('2024-01-02'),
      updatedAt: new Date('2024-01-02')
    }
  ];

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('POST /api/users', () => {
    it('should create a new user successfully', async () => {
      const newUserData = {
        name: 'Alice Johnson',
        email: 'alice@test.com',
        password: 'password123',
        role: 'Staff'
      };

      const createdUser = {
        _id: '507f1f77bcf86cd799439015',
        ...newUserData,
        department: null,
        passwordHistory: [],
        failedLoginAttempts: 0,
        lockUntil: undefined,
        resetToken: undefined,
        resetTokenExpires: undefined,
        refreshToken: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      User.create.mockResolvedValue(createdUser);

      const res = await request(app)
        .post('/api/users')
        .send(newUserData)
        .expect(201);

      expect(res.body).toMatchObject({
        _id: createdUser._id,
        name: newUserData.name,
        email: newUserData.email,
        role: newUserData.role
      });
      expect(User.create).toHaveBeenCalledWith(newUserData);
      expect(User.create).toHaveBeenCalledTimes(1);
    });

    it('should fail when required fields are missing', async () => {
      const invalidData = {
        name: 'Bob'
        // Missing email and password
      };

      const validationError = new Error('User validation failed: email: Path `email` is required., password: Path `password` is required.');
      User.create.mockRejectedValue(validationError);

      const res = await request(app)
        .post('/api/users')
        .send(invalidData)
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(User.create).toHaveBeenCalledWith(invalidData);
    });

    it('should fail when email is duplicate', async () => {
      const duplicateData = {
        name: 'John Doe',
        email: 'john@test.com',
        password: 'password123'
      };

      const duplicateError = new Error('E11000 duplicate key error collection');
      User.create.mockRejectedValue(duplicateError);

      const res = await request(app)
        .post('/api/users')
        .send(duplicateData)
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/users', () => {
    it('should return an array of all users', async () => {
      // Mock the query chain
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockUsers)
      };
      User.find.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/users')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('John Doe');
      expect(res.body[1].name).toBe('Jane Smith');
      expect(User.find).toHaveBeenCalledWith({});
    });

    it('should filter users by role', async () => {
      const managerOnly = [mockUsers[1]];

      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(managerOnly)
      };
      User.find.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/users?role=Manager')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].role).toBe('Manager');
      expect(User.find).toHaveBeenCalledWith({ role: 'Manager' });
    });

    it('should handle database errors', async () => {
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockRejectedValue(new Error('Database connection failed'))
      };
      User.find.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/users')
        .expect(500);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/users/:id', () => {
    it('should return a single user by id', async () => {
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockUser)
      };
      User.findById.mockReturnValue(mockQuery);

      const res = await request(app)
        .get(`/api/users/${mockUser._id}`)
        .expect(200);

      expect(res.body).toMatchObject({
        _id: mockUser._id,
        name: mockUser.name,
        email: mockUser.email
      });
      expect(User.findById).toHaveBeenCalledWith(mockUser._id);
    });

    it('should return 404 when user not found', async () => {
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null)
      };
      User.findById.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/users/507f1f77bcf86cd799439099')
        .expect(404);

      expect(res.body.error).toBe('User not found');
    });

    it('should handle invalid ObjectId format', async () => {
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockRejectedValue(new Error('Cast to ObjectId failed'))
      };
      User.findById.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/users/invalid-id')
        .expect(500);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /api/users/username/:username', () => {
    it('should return a user by username', async () => {
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockUser)
      };
      User.findOne.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/users/username/John Doe')
        .expect(200);

      expect(res.body.name).toBe('John Doe');
      expect(User.findOne).toHaveBeenCalledWith({ name: 'John Doe' });
    });

    it('should return 404 when username not found', async () => {
      const mockQuery = {
        populate: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(null)
      };
      User.findOne.mockReturnValue(mockQuery);

      const res = await request(app)
        .get('/api/users/username/NonExistent')
        .expect(404);

      expect(res.body.error).toBe('User not found');
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update a user successfully', async () => {
      const updateData = { name: 'John Updated', role: 'Manager' };
      const updatedUser = { ...mockUser, ...updateData };

      const mockQuery = {
        populate: vi.fn().mockResolvedValue(updatedUser)
      };
      User.findByIdAndUpdate.mockReturnValue(mockQuery);

      const res = await request(app)
        .put(`/api/users/${mockUser._id}`)
        .send(updateData)
        .expect(200);

      expect(res.body.name).toBe('John Updated');
      expect(res.body.role).toBe('Manager');
      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        mockUser._id,
        updateData,
        { new: true, runValidators: true }
      );
    });

    it('should return 404 when updating non-existent user', async () => {
      const mockQuery = {
        populate: vi.fn().mockResolvedValue(null)
      };
      User.findByIdAndUpdate.mockReturnValue(mockQuery);

      const res = await request(app)
        .put('/api/users/507f1f77bcf86cd799439099')
        .send({ name: 'Test' })
        .expect(404);

      expect(res.body.error).toBe('User not found');
    });

    it('should handle validation errors on update', async () => {
      const invalidUpdate = { email: 'invalid-email' };

      const mockQuery = {
        populate: vi.fn().mockRejectedValue(new Error('Validation failed'))
      };
      User.findByIdAndUpdate.mockReturnValue(mockQuery);

      const res = await request(app)
        .put(`/api/users/${mockUser._id}`)
        .send(invalidUpdate)
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should delete a user successfully', async () => {
      User.findByIdAndDelete.mockResolvedValue(mockUser);

      const res = await request(app)
        .delete(`/api/users/${mockUser._id}`)
        .expect(200);

      expect(res.body.message).toBe('User deleted successfully');
      expect(User.findByIdAndDelete).toHaveBeenCalledWith(mockUser._id);
    });

    it('should return 404 when deleting non-existent user', async () => {
      User.findByIdAndDelete.mockResolvedValue(null);

      const res = await request(app)
        .delete('/api/users/507f1f77bcf86cd799439099')
        .expect(404);

      expect(res.body.error).toBe('User not found');
    });

    it('should handle database errors on delete', async () => {
      User.findByIdAndDelete.mockRejectedValue(new Error('Database error'));

      const res = await request(app)
        .delete(`/api/users/${mockUser._id}`)
        .expect(500);

      expect(res.body.error).toBeDefined();
    });
  });
});