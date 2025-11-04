import request from 'supertest';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../app.js';
import User from '../models/User.js';
import express from "express";

// Mock the User model
vi.mock('../models/User.js', () => {
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
        .expect(400);

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

function thenableResult(result) {
  // A minimal "thenable" so `await <query>` works like Mongoose Query
  return { then: (resolve) => resolve(result) };
}

function makeUsersMock() {
  const store = {
    docs: [
      { _id: "65a1bc2de3f4567890abc123", name: "alice", role: "admin" },
      { _id: "65b2cd3ee4f567890abc1234", name: "bob", role: "user" },
    ],
  };

  // For GET / (find + populate + lean)
  const find = vi.fn((filter = {}) => ({
    populate: vi.fn(() => ({
      lean: vi.fn(async () => {
        if (filter.role) return store.docs.filter((d) => d.role === filter.role);
        return store.docs.slice();
      }),
    })),
  }));

  // For GET /username/:username (findOne + populate + lean)
  const findOne = vi.fn((q) => ({
    populate: vi.fn(() => ({
      lean: vi.fn(async () => store.docs.find((d) => d.name === q.name) || null),
    })),
  }));

  // For GET /:id (findById + populate + lean)
  const findById = vi.fn((id) => ({
    populate: vi.fn(() => ({
      lean: vi.fn(async () => store.docs.find((d) => d._id === id) || null),
    })),
  }));

  // For POST / (create)
  const create = vi.fn(async (body) => {
    if (body && body.__forceError) {
      const e = new Error("Validation failed");
      e.name = "ValidationError";
      throw e;
    }
    const doc = { _id: "65c3de4ff5a67890abc12345", ...body };
    store.docs.push(doc);
    return doc;
  });

  // For PUT /:id (findByIdAndUpdate + populate thenable)
  const findByIdAndUpdate = vi.fn((id, body, _opts) => ({
    // populate().then(...) should resolve the updated doc (or null)
    populate: vi.fn(() => thenableResult(
      store.docs.find((d) => d._id === id)
        ? Object.assign({}, store.docs.find((d) => d._id === id), body)
        : null
    )),
  }));

  // For DELETE /:id (findByIdAndDelete)
  const findByIdAndDelete = vi.fn(async (id) => {
    const idx = store.docs.findIndex((d) => d._id === id);
    if (idx === -1) return null;
    const [removed] = store.docs.splice(idx, 1);
    return removed;
  });

  return {
    store,
    fns: {
      find,
      findOne,
      findById,
      create,
      findByIdAndUpdate,
      findByIdAndDelete,
    },
  };
}

/* ---------- Module loader that injects mocks, then imports router ---------- */
async function loadRouter() {
  vi.resetModules();

  const mock = makeUsersMock();
  vi.doMock("../models/User.js", () => ({
    default: mock.fns,
  }));

  const router = (await import("../routes/users.js")).default;

  // Minimal app + error handler so next(err) returns JSON
  const app = express();
  app.use(express.json());
  app.use("/api/users", router);
  app.use((err, _req, res, _next) => {
    res.status(500).json({ error: String(err?.message || err) });
  });

  return { app, mock };
}

/* ============================== TESTS ============================== */

describe("users router", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /* ---- Directly covering your uncovered lines (79–80, 102–103) ---- */

  it("PUT /:id => 400 when id is not a valid ObjectId (covers lines 79–80)", async () => {
    const { app } = await loadRouter();
    const res = await request(app)
      .put("/api/users/not-an-objectid")
      .send({ role: "user" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid user id/i);
  });

  it("DELETE /:id => 400 when id is not a valid ObjectId (covers lines 102–103)", async () => {
    const { app } = await loadRouter();
    const res = await request(app).delete("/api/users/also-bad-id");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid user id/i);
  });

  /* ---- A few extra branches to lift overall coverage nicely ---- */

  it("GET / filters by role when provided", async () => {
    const { app } = await loadRouter();
    const res = await request(app).get("/api/users").query({ role: "user" });
    expect(res.status).toBe(200);
    expect(res.body.every((u) => u.role === "user")).toBe(true);
  });

  it("GET /username/:username returns 404 when not found", async () => {
    const { app } = await loadRouter();
    const res = await request(app).get("/api/users/username/charlie");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  it("GET /:id returns 400 for invalid id; 404 for valid-but-missing id", async () => {
    const { app } = await loadRouter();

    const bad = await request(app).get("/api/users/nothexid");
    expect(bad.status).toBe(400);

    const missing = await request(app).get("/api/users/65ffffffffffffffffffff00"); // valid 24-hex, not in store
    expect(missing.status).toBe(404);
  });

  it("PUT /:id updates and returns populated user when found", async () => {
    const { app, mock } = await loadRouter();
    const target = mock.store.docs[0]; // existing
    const res = await request(app)
      .put(`/api/users/${target._id}`)
      .send({ role: "power-user" });

    expect(res.status).toBe(200);
    // Not strictly populated checking, but ensures the pipeline returned an object
    expect(res.body.role).toBe("power-user");
  });

  it("PUT /:id returns 404 when user not found", async () => {
    const { app } = await loadRouter();
    const res = await request(app)
      .put("/api/users/65eeeeeeeeeeeeeeeeeeeeee")
      .send({ role: "ghost" });
    expect(res.status).toBe(404);
  });

  it("POST / returns 201 on success; 400 on validation error", async () => {
    const { app } = await loadRouter();

    const ok = await request(app)
      .post("/api/users")
      .send({ name: "charlie", role: "user" });
    expect(ok.status).toBe(201);

    const bad = await request(app)
      .post("/api/users")
      .send({ __forceError: true });
    expect(bad.status).toBe(400);
  });

  it("DELETE /:id returns 200 on success; 404 when not found", async () => {
    const { app, mock } = await loadRouter();

    const target = mock.store.docs[1];
    const ok = await request(app).delete(`/api/users/${target._id}`);
    expect(ok.status).toBe(200);
    expect(ok.body.message).toMatch(/deleted/i);

    const miss = await request(app).delete(`/api/users/${target._id}`); // already deleted
    expect(miss.status).toBe(404);
  });

  it("GET / returns 500 when the model throws (covers error path)", async () => {
    vi.resetModules();
    // Force find() to throw
    vi.doMock("../models/User.js", () => ({
      default: {
        find: vi.fn(() => {
          throw new Error("DB read failed");
        }),
      },
    }));
    const router = (await import("../routes/users.js")).default;
    const app = express();
    app.use(express.json());
    app.use("/api/users", router);
    app.use((err, _req, res, _next) => res.status(500).json({ error: err.message }));

    const res = await request(app).get("/api/users");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/db read failed/i);
  });

  // Append to backend/tests/users.test.js

  it("GET /username/:username → 500 when model throws (covers lines 50–51)", async () => {
    const { app, mock } = await loadRouter();

    // Force an error in the findOne pipeline
    mock.fns.findOne = vi.fn(() => {
      throw new Error("findOne exploded");
    });

    const res = await request(app).get("/api/users/username/alice");
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toMatch(/findOne exploded/i);
  });

  it("GET /:id → 500 when model throws (covers lines 67–68)", async () => {
    const { app, mock } = await loadRouter();

    // Use a valid 24-hex id so the route proceeds past ObjectId validation
    const validId = "65a1bc2de3f4567890abc123";

    // Force an error before populate/lean
    mock.fns.findById = vi.fn(() => {
      throw new Error("findById kaboom");
    });

    const res = await request(app).get(`/api/users/${validId}`);
    expect(res.status).toBe(500);
    expect(String(res.body.error)).toMatch(/kaboom/i);
  });

});