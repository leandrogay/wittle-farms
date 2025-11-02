/**
 * backend/tests/seniorManagerReport.test.js
 *
 * Comprehensive unit tests for the (SM/HR) Company-Wide Report Generation functionality.
 * Tests the /api/senior-manager/report endpoint with 100% coverage including:
 * - Company-wide metrics calculations (productivity trends, project scope, task scope)
 * - Department performance breakdown analysis
 * - Project breakdown with completion and overdue rates
 * - Time performance analysis across all departments
 * - Error scenarios and edge cases
 * - Database integration with in-memory MongoDB
 * 
 * Based on the JIRA user story: (SM/HR) Company-Wide Report Generation
 * Test Cases: TC-001 through TC-006 covering comprehensive company-wide reporting
 */

import express from "express";
import mongoose from "mongoose";
import request from "supertest";
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables from secrets.env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../config/secrets.env') });

// Import the senior manager router and models
import seniorManagerRouter from "../routes/senior-manager.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import User from "../models/User.js";
import Department from "../models/Department.js";

dayjs.extend(isBetween);

describe("Senior Manager Company-Wide Report API", () => {
  let mongoServer;
  let app;
  let testDepartments = {};
  let testUsers = {};
  let testProjects = {};
  let testTasks = {};

  // Test data setup for company-wide reporting
  const setupTestData = async () => {
    // Create multiple test departments
    const systemSolutioning = await Department.create({
      name: "System Solutioning",
      description: "Technology and systems department"
    });
    
    const sales = await Department.create({
      name: "Sales",
      description: "Sales and marketing department"
    });
    
    const hr = await Department.create({
      name: "Human Resources",
      description: "HR department"
    });

    testDepartments = {
      systemSolutioning: systemSolutioning._id,
      sales: sales._id,
      hr: hr._id
    };

    // Create test users across different departments and roles
    const seniorManager = await User.create({
      name: "Test Senior Manager",
      email: "senior.manager@test.com",
      role: "Senior Manager",
      department: testDepartments.systemSolutioning,
      password: process.env.TEST_SENIOR_MANAGER_PASSWORD
    });

    const hrManager = await User.create({
      name: "Test HR Manager",
      email: "hr.manager@test.com",
      role: "HR",
      department: testDepartments.hr,
      password: process.env.TEST_HR_PASSWORD
    });

    const director1 = await User.create({
      name: "Test Director 1",
      email: "director1@test.com",
      role: "Director",
      department: testDepartments.systemSolutioning,
      password: process.env.TEST_DIRECTOR_PASSWORD
    });

    const director2 = await User.create({
      name: "Test Director 2",
      email: "director2@test.com",
      role: "Director",
      department: testDepartments.sales,
      password: process.env.TEST_DIRECTOR_PASSWORD
    });

    const manager1 = await User.create({
      name: "Test Manager 1",
      email: "manager1@test.com",
      role: "Manager",
      department: testDepartments.systemSolutioning,
      password: process.env.TEST_MANAGER_PASSWORD
    });

    const manager2 = await User.create({
      name: "Test Manager 2",
      email: "manager2@test.com",
      role: "Manager",
      department: testDepartments.sales,
      password: process.env.TEST_MANAGER_PASSWORD
    });

    const staff1 = await User.create({
      name: "Test Staff 1",
      email: "staff1@test.com",
      role: "Staff",
      department: testDepartments.systemSolutioning,
      password: process.env.TEST_STAFF_PASSWORD
    });

    const staff2 = await User.create({
      name: "Test Staff 2",
      email: "staff2@test.com",
      role: "Staff",
      department: testDepartments.sales,
      password: process.env.TEST_STAFF_PASSWORD
    });

    const staff3 = await User.create({
      name: "Test Staff 3",
      email: "staff3@test.com",
      role: "Staff",
      department: testDepartments.hr,
      password: process.env.TEST_STAFF_PASSWORD
    });

    testUsers = {
      seniorManager: seniorManager._id,
      hrManager: hrManager._id,
      director1: director1._id,
      director2: director2._id,
      manager1: manager1._id,
      manager2: manager2._id,
      staff1: staff1._id,
      staff2: staff2._id,
      staff3: staff3._id
    };

    // Create test projects across different departments with varying statuses
    const now = dayjs();
    
    // System Solutioning Department Projects
    const completedProject1 = await Project.create({
      name: "Completed System Project",
      department: [testDepartments.systemSolutioning],
      description: "Fully completed project in System Solutioning",
      deadline: now.subtract(5, 'day').toDate(),
      createdBy: testUsers.manager1,
      teamMembers: [testUsers.staff1],
      createdAt: now.subtract(60, 'day').toDate()
    });

    const activeProject1 = await Project.create({
      name: "Active System Project",
      department: [testDepartments.systemSolutioning],
      description: "Ongoing project in System Solutioning",
      deadline: now.add(30, 'day').toDate(),
      createdBy: testUsers.manager1,
      teamMembers: [testUsers.staff1],
      createdAt: now.subtract(20, 'day').toDate()
    });

    const overdueProject1 = await Project.create({
      name: "Overdue System Project",
      department: [testDepartments.systemSolutioning],
      description: "Overdue project in System Solutioning",
      deadline: now.subtract(15, 'day').toDate(),
      createdBy: testUsers.manager1,
      teamMembers: [testUsers.staff1],
      createdAt: now.subtract(90, 'day').toDate()
    });

    // Sales Department Projects
    const completedProject2 = await Project.create({
      name: "Completed Sales Project",
      department: [testDepartments.sales],
      description: "Fully completed project in Sales",
      deadline: now.subtract(10, 'day').toDate(),
      createdBy: testUsers.manager2,
      teamMembers: [testUsers.staff2],
      createdAt: now.subtract(45, 'day').toDate()
    });

    const activeProject2 = await Project.create({
      name: "Active Sales Project",
      department: [testDepartments.sales],
      description: "Ongoing project in Sales",
      deadline: now.add(45, 'day').toDate(),
      createdBy: testUsers.manager2,
      teamMembers: [testUsers.staff2],
      createdAt: now.subtract(15, 'day').toDate()
    });

    // HR Department Project (smaller scale)
    const hrProject = await Project.create({
      name: "HR Process Improvement",
      department: [testDepartments.hr],
      description: "HR internal project",
      deadline: now.add(60, 'day').toDate(),
      createdBy: testUsers.hrManager,
      teamMembers: [testUsers.staff3],
      createdAt: now.subtract(10, 'day').toDate()
    });

    testProjects = {
      completedProject1: completedProject1._id,
      activeProject1: activeProject1._id,
      overdueProject1: overdueProject1._id,
      completedProject2: completedProject2._id,
      activeProject2: activeProject2._id,
      hrProject: hrProject._id
    };

    // Create test tasks with varying statuses and completion patterns
    
    // Completed System Project Tasks (all done)
    const completedTask1 = await Task.create({
      title: "System Task 1 - Completed",
      description: "Completed system task",
      status: "Done",
      priority: 7,
      deadline: now.subtract(8, 'day').toDate(),
      assignedProject: testProjects.completedProject1,
      assignedTeamMembers: [testUsers.staff1],
      createdBy: testUsers.manager1,
      completedAt: now.subtract(12, 'day').toDate(),
      createdAt: now.subtract(65, 'day').toDate()
    });

    const completedTask2 = await Task.create({
      title: "System Task 2 - Completed",
      description: "Another completed system task",
      status: "Done",
      priority: 5,
      deadline: now.subtract(6, 'day').toDate(),
      assignedProject: testProjects.completedProject1,
      assignedTeamMembers: [testUsers.staff1],
      createdBy: testUsers.manager1,
      completedAt: now.subtract(8, 'day').toDate(),
      createdAt: now.subtract(55, 'day').toDate()
    });

    // Active System Project Tasks (mixed statuses)
    const activeTask1 = await Task.create({
      title: "System Task 3 - To Do",
      description: "Pending system task",
      status: "To Do",
      priority: 6,
      deadline: now.add(20, 'day').toDate(),
      assignedProject: testProjects.activeProject1,
      assignedTeamMembers: [testUsers.staff1],
      createdBy: testUsers.manager1,
      createdAt: now.subtract(18, 'day').toDate()
    });

    const activeTask2 = await Task.create({
      title: "System Task 4 - In Progress",
      description: "Ongoing system task",
      status: "In Progress",
      priority: 8,
      deadline: now.add(25, 'day').toDate(),
      assignedProject: testProjects.activeProject1,
      assignedTeamMembers: [testUsers.staff1],
      createdBy: testUsers.manager1,
      createdAt: now.subtract(15, 'day').toDate()
    });

    const activeTask3 = await Task.create({
      title: "System Task 5 - Done",
      description: "Recently completed system task",
      status: "Done",
      priority: 4,
      deadline: now.add(30, 'day').toDate(),
      assignedProject: testProjects.activeProject1,
      assignedTeamMembers: [testUsers.staff1],
      createdBy: testUsers.manager1,
      completedAt: now.subtract(3, 'day').toDate(),
      createdAt: now.subtract(12, 'day').toDate()
    });

    // Overdue System Project Tasks (overdue scenarios)
    const overdueTask1 = await Task.create({
      title: "System Task 6 - Overdue",
      description: "Overdue system task",
      status: "In Progress",
      priority: 9,
      deadline: now.subtract(20, 'day').toDate(),
      assignedProject: testProjects.overdueProject1,
      assignedTeamMembers: [testUsers.staff1],
      createdBy: testUsers.manager1,
      createdAt: now.subtract(85, 'day').toDate()
    });

    const overdueTask2 = await Task.create({
      title: "System Task 7 - Long Overdue",
      description: "Long overdue system task",
      status: "To Do",
      priority: 10,
      deadline: now.subtract(25, 'day').toDate(),
      assignedProject: testProjects.overdueProject1,
      assignedTeamMembers: [testUsers.staff1],
      createdBy: testUsers.manager1,
      createdAt: now.subtract(80, 'day').toDate()
    });

    // Completed Sales Project Tasks (all done)
    const salesTask1 = await Task.create({
      title: "Sales Task 1 - Completed",
      description: "Completed sales task",
      status: "Done",
      priority: 6,
      deadline: now.subtract(12, 'day').toDate(),
      assignedProject: testProjects.completedProject2,
      assignedTeamMembers: [testUsers.staff2],
      createdBy: testUsers.manager2,
      completedAt: now.subtract(15, 'day').toDate(),
      createdAt: now.subtract(50, 'day').toDate()
    });

    const salesTask2 = await Task.create({
      title: "Sales Task 2 - Completed",
      description: "Another completed sales task",
      status: "Done",
      priority: 7,
      deadline: now.subtract(14, 'day').toDate(),
      assignedProject: testProjects.completedProject2,
      assignedTeamMembers: [testUsers.staff2],
      createdBy: testUsers.manager2,
      completedAt: now.subtract(18, 'day').toDate(),
      createdAt: now.subtract(48, 'day').toDate()
    });

    const salesTask3 = await Task.create({
      title: "Sales Task 3 - Completed",
      description: "Third completed sales task",
      status: "Done",
      priority: 5,
      deadline: now.subtract(16, 'day').toDate(),
      assignedProject: testProjects.completedProject2,
      assignedTeamMembers: [testUsers.staff2],
      createdBy: testUsers.manager2,
      completedAt: now.subtract(20, 'day').toDate(),
      createdAt: now.subtract(46, 'day').toDate()
    });

    // Active Sales Project Tasks (mixed statuses)
    const activeSalesTask1 = await Task.create({
      title: "Sales Task 4 - In Progress",
      description: "Ongoing sales task",
      status: "In Progress",
      priority: 8,
      deadline: now.add(35, 'day').toDate(),
      assignedProject: testProjects.activeProject2,
      assignedTeamMembers: [testUsers.staff2],
      createdBy: testUsers.manager2,
      createdAt: now.subtract(12, 'day').toDate()
    });

    const activeSalesTask2 = await Task.create({
      title: "Sales Task 5 - To Do",
      description: "Pending sales task",
      status: "To Do",
      priority: 4,
      deadline: now.add(40, 'day').toDate(),
      assignedProject: testProjects.activeProject2,
      assignedTeamMembers: [testUsers.staff2],
      createdBy: testUsers.manager2,
      createdAt: now.subtract(10, 'day').toDate()
    });

    // HR Project Tasks (smaller scale)
    const hrTask1 = await Task.create({
      title: "HR Task 1 - To Do",
      description: "HR process task",
      status: "To Do",
      priority: 3,
      deadline: now.add(50, 'day').toDate(),
      assignedProject: testProjects.hrProject,
      assignedTeamMembers: [testUsers.staff3],
      createdBy: testUsers.hrManager,
      createdAt: now.subtract(8, 'day').toDate()
    });

    testTasks = {
      completedTask1: completedTask1._id,
      completedTask2: completedTask2._id,
      activeTask1: activeTask1._id,
      activeTask2: activeTask2._id,
      activeTask3: activeTask3._id,
      overdueTask1: overdueTask1._id,
      overdueTask2: overdueTask2._id,
      salesTask1: salesTask1._id,
      salesTask2: salesTask2._id,
      salesTask3: salesTask3._id,
      activeSalesTask1: activeSalesTask1._id,
      activeSalesTask2: activeSalesTask2._id,
      hrTask1: hrTask1._id
    };
  };

  beforeAll(async () => {
    // Start in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri);

    // Setup Express app
    app = express();
    app.use(express.json());
    app.use("/api/senior-manager", seniorManagerRouter);
  });

  beforeEach(async () => {
    // Clear all collections
    await Promise.all([
      Department.deleteMany({}),
      User.deleteMany({}),
      Project.deleteMany({}),
      Task.deleteMany({})
    ]);

    // Setup fresh test data
    await setupTestData();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  describe("GET /api/senior-manager/report", () => {
    
    describe("Company-Wide Performance Metrics (TC-001)", () => {
      it("should verify company-wide performance metrics calculation", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('productivityTrend');
        expect(response.body).toHaveProperty('projectCompletionRateThisMonth');
        expect(response.body).toHaveProperty('projectCompletionRateLastMonth');
        
        // Based on test data: 2 completed projects out of 6 total = 33.3%
        // Should be 'Stable' trend (between 0% and 50%)
        expect(response.body.productivityTrend).toBe('Stable');
        expect(response.body.projectCompletionRateThisMonth).toBe(33.3);
        expect(response.body.projectCompletionRateLastMonth).toBe(0);
        
        // Verify company scope metrics
        expect(response.body.companyScope).toHaveProperty('totalProjects', 6);
        expect(response.body.companyScope).toHaveProperty('totalTasks', 13);
        expect(response.body.companyScope).toHaveProperty('totalEmployees', 9);
        expect(response.body.companyScope).toHaveProperty('totalDepartments', 3);
      });

      it("should calculate project status percentages correctly", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        const projectStatusPercentages = response.body.companyScope.projectStatusPercentages;
        expect(projectStatusPercentages).toHaveProperty('To Do');
        expect(projectStatusPercentages).toHaveProperty('In Progress');
        expect(projectStatusPercentages).toHaveProperty('Done');
        expect(projectStatusPercentages).toHaveProperty('Overdue');
        
        // Verify percentages sum to 100%
        const totalPercentage = Object.values(projectStatusPercentages).reduce((sum, val) => sum + val, 0);
        expect(Math.abs(totalPercentage - 100)).toBeLessThan(0.1); // Allow for rounding
      });

      it("should calculate task status percentages correctly", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        const taskStatusPercentages = response.body.companyScope.taskStatusPercentages;
        expect(taskStatusPercentages).toHaveProperty('To Do');
        expect(taskStatusPercentages).toHaveProperty('In Progress');
        expect(taskStatusPercentages).toHaveProperty('Done');
        expect(taskStatusPercentages).toHaveProperty('Overdue');
        
        // Based on test data: 6 completed tasks (not 5), 3 to do, 3 in progress, 2 overdue
        expect(taskStatusPercentages['Done']).toBeCloseTo(46.2, 1); // 6/13 ≈ 46.2%
        expect(taskStatusPercentages['To Do']).toBeCloseTo(23.1, 1); // 3/13 ≈ 23.1%
        expect(taskStatusPercentages['In Progress']).toBeCloseTo(15.4, 1); // 2/13 ≈ 15.4%
        expect(taskStatusPercentages['Overdue']).toBeCloseTo(15.4, 1); // 2/13 ≈ 15.4%
      });
    });

    describe("Company Project Status Metrics (TC-002)", () => {
      it("should verify company project status metrics", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        const projectStatusCounts = response.body.companyScope.projectStatusCounts;
        
        // Based on test data:
        // - 2 completed projects (all tasks done)
        // - 2 active projects (mixed task statuses = 'In Progress')
        // - 1 overdue project (past deadline, not all tasks done)
        // - 1 HR project with only 'To Do' tasks = 'To Do' status
        expect(projectStatusCounts['Done']).toBe(2);
        expect(projectStatusCounts['In Progress']).toBe(2);
        expect(projectStatusCounts['Overdue']).toBe(1);
        expect(projectStatusCounts['To Do']).toBe(1);
        
        // Total should equal 6 projects
        const totalProjects = Object.values(projectStatusCounts).reduce((sum, val) => sum + val, 0);
        expect(totalProjects).toBe(6);
      });

      it("should handle project status calculations with edge cases", async () => {
        // Create a project with no tasks
        const emptyProject = await Project.create({
          name: "Empty Project",
          department: [testDepartments.systemSolutioning],
          description: "Project with no tasks",
          deadline: dayjs().add(30, 'day').toDate(),
          createdBy: testUsers.manager1,
          teamMembers: [testUsers.staff1]
        });

        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // Empty project should be counted as 'To Do'
        expect(response.body.companyScope.totalProjects).toBe(7);
        expect(response.body.companyScope.projectStatusCounts['To Do']).toBe(2);
      });
    });

    describe("Company Tasks Status (TC-003)", () => {
      it("should verify company tasks status breakdown", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        const taskStatusCounts = response.body.companyScope.taskStatusCounts;
        
        // Based on test data:
        // - 6 Done tasks (2 from completed project 1, 3 from completed project 2, 1 from active project 1)
        // - 3 To Do tasks (1 from active project 1, 1 from active project 2, 1 from HR project)
        // - 2 In Progress tasks (1 from active project 1, 1 from active project 2)
        // - 2 Overdue tasks (2 from overdue project)
        expect(taskStatusCounts['Done']).toBe(6);
        expect(taskStatusCounts['To Do']).toBe(3);
        expect(taskStatusCounts['In Progress']).toBe(2);
        expect(taskStatusCounts['Overdue']).toBe(2);
        
        // Total should equal 13 tasks
        const totalTasks = Object.values(taskStatusCounts).reduce((sum, val) => sum + val, 0);
        expect(totalTasks).toBe(13);
      });

      it("should correctly identify overdue tasks", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // Should identify tasks past deadline and not completed
        const overdueCount = response.body.companyScope.taskStatusCounts['Overdue'];
        expect(overdueCount).toBe(2); // Based on our test data
        
        // Overdue percentage should be calculated correctly
        const overduePercentage = response.body.companyScope.taskStatusPercentages['Overdue'];
        expect(overduePercentage).toBeCloseTo(15.4, 1); // 2/13 ≈ 15.4%
      });
    });

    describe("Department Performance Breakdown (TC-004)", () => {
      it("should verify department performance breakdown metrics", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('departmentMetrics');
        expect(Array.isArray(response.body.departmentMetrics)).toBe(true);
        expect(response.body.departmentMetrics).toHaveLength(3);
        
        // Find System Solutioning department metrics
        const systemDept = response.body.departmentMetrics.find(
          dept => dept.departmentName === "System Solutioning"
        );
        expect(systemDept).toBeDefined();
        expect(systemDept.teamSize).toBe(4); // seniorManager, director1, manager1, staff1
        expect(systemDept.projectStatusCounts).toHaveProperty('Done');
        expect(systemDept.projectStatusCounts).toHaveProperty('In Progress');
        expect(systemDept.projectStatusCounts).toHaveProperty('Overdue');
        
        // Find Sales department metrics
        const salesDept = response.body.departmentMetrics.find(
          dept => dept.departmentName === "Sales"
        );
        expect(salesDept).toBeDefined();
        expect(salesDept.teamSize).toBe(3); // director2, manager2, staff2
        
        // Find HR department metrics
        const hrDept = response.body.departmentMetrics.find(
          dept => dept.departmentName === "Human Resources"
        );
        expect(hrDept).toBeDefined();
        expect(hrDept.teamSize).toBe(2); // hrManager, staff3
      });

      it("should calculate department-level task and project percentages", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        const systemDept = response.body.departmentMetrics.find(
          dept => dept.departmentName === "System Solutioning"
        );
        
        // Verify task status percentages sum to 100%
        const taskPercentages = Object.values(systemDept.taskStatusPercentages);
        const taskTotal = taskPercentages.reduce((sum, val) => sum + val, 0);
        expect(Math.abs(taskTotal - 100)).toBeLessThan(0.1);
        
        // Verify project status percentages sum to 100% (allow small rounding errors)
        const projectPercentages = Object.values(systemDept.projectStatusPercentages);
        const projectTotal = projectPercentages.reduce((sum, val) => sum + val, 0);
        expect(Math.abs(projectTotal - 100)).toBeLessThan(0.2);
      });
    });

    describe("Project Performance Overview (TC-005)", () => {
      it("should verify project performance overview with task volume", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('projectBreakdown');
        expect(Array.isArray(response.body.projectBreakdown)).toBe(true);
        
        // Should include all projects with tasks (excluding empty projects)
        expect(response.body.projectBreakdown.length).toBe(6);
        
        // Projects should be sorted by total tasks descending
        const taskCounts = response.body.projectBreakdown.map(p => p.totalTasks);
        for (let i = 0; i < taskCounts.length - 1; i++) {
          expect(taskCounts[i]).toBeGreaterThanOrEqual(taskCounts[i + 1]);
        }
        
        // Each project should have required metrics
        response.body.projectBreakdown.forEach(project => {
          expect(project).toHaveProperty('projectName');
          expect(project).toHaveProperty('departments');
          expect(project).toHaveProperty('totalTasks');
          expect(project).toHaveProperty('completedTasks');
          expect(project).toHaveProperty('overdueTasks');
          expect(project).toHaveProperty('completionRate');
          expect(project).toHaveProperty('overdueRate');
          
          // Verify completion rate calculation
          if (project.totalTasks > 0) {
            const expectedCompletionRate = Math.round((project.completedTasks / project.totalTasks) * 100 * 10) / 10;
            expect(project.completionRate).toBeCloseTo(expectedCompletionRate, 1);
          }
          
          // Verify overdue rate calculation
          if (project.totalTasks > 0) {
            const expectedOverdueRate = Math.round((project.overdueTasks / project.totalTasks) * 100 * 10) / 10;
            expect(project.overdueRate).toBeCloseTo(expectedOverdueRate, 1);
          }
        });
      });

      it("should display projects ordered by task volume", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        const projectBreakdown = response.body.projectBreakdown;
        
        // Find projects with highest task counts
        const completedProject2 = projectBreakdown.find(p => p.projectName === "Completed Sales Project");
        const activeProject1 = projectBreakdown.find(p => p.projectName === "Active System Project");
        
        expect(completedProject2.totalTasks).toBe(3); // Has 3 tasks
        expect(activeProject1.totalTasks).toBe(3); // Has 3 tasks
        
        // Verify completion rates
        expect(completedProject2.completionRate).toBe(100); // All tasks done
        expect(activeProject1.completionRate).toBeCloseTo(33.3, 1); // 1 of 3 tasks done
      });

      it("should handle projects with zero overdue tasks", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        const hrProject = response.body.projectBreakdown.find(p => p.projectName === "HR Process Improvement");
        expect(hrProject).toBeDefined();
        expect(hrProject.overdueTasks).toBe(0);
        expect(hrProject.overdueRate).toBe(0);
      });
    });

    describe("Company-wide Report Layout (TC-006)", () => {
      it("should verify company-wide report layout with all required sections", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // Verify main report sections
        expect(response.body).toHaveProperty('productivityTrend');
        expect(response.body).toHaveProperty('projectCompletionRateThisMonth');
        expect(response.body).toHaveProperty('projectCompletionRateLastMonth');
        expect(response.body).toHaveProperty('companyScope');
        expect(response.body).toHaveProperty('departmentMetrics');
        expect(response.body).toHaveProperty('projectBreakdown');
        expect(response.body).toHaveProperty('companyInfo');
        
        // Verify company info
        expect(response.body.companyInfo).toHaveProperty('reportGeneratedAt');
        expect(response.body.companyInfo).toHaveProperty('totalDepartments', 3);
        expect(response.body.companyInfo).toHaveProperty('totalEmployees', 9);
        
        // Verify report generated timestamp
        const reportTime = new Date(response.body.companyInfo.reportGeneratedAt);
        const now = new Date();
        const timeDiff = Math.abs(now - reportTime);
        expect(timeDiff).toBeLessThan(60000); // Within 1 minute
      });

      it("should display sections as expected under application layout", async () => {
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // 1. Company-Wide Performance Metrics (Productivity Trend, Company Scale)
        expect(response.body.productivityTrend).toMatch(/^(Improving|Stable|Declining)$/);
        expect(response.body.companyScope.totalProjects).toBeGreaterThan(0);
        expect(response.body.companyScope.totalTasks).toBeGreaterThan(0);
        
        // 2. Company Projects Status (To Do, In Progress, Done, Overdue)
        expect(response.body.companyScope.projectStatusCounts).toHaveProperty('To Do');
        expect(response.body.companyScope.projectStatusCounts).toHaveProperty('In Progress');
        expect(response.body.companyScope.projectStatusCounts).toHaveProperty('Done');
        expect(response.body.companyScope.projectStatusCounts).toHaveProperty('Overdue');
        
        // 3. Company Tasks Status
        expect(response.body.companyScope.taskStatusCounts).toHaveProperty('To Do');
        expect(response.body.companyScope.taskStatusCounts).toHaveProperty('In Progress');
        expect(response.body.companyScope.taskStatusCounts).toHaveProperty('Done');
        expect(response.body.companyScope.taskStatusCounts).toHaveProperty('Overdue');
        
        // 4. Department Performance Breakdown (7 departments and 10 employees)
        // Note: Our test has 3 departments and 9 employees
        expect(response.body.departmentMetrics).toHaveLength(3);
        expect(response.body.companyInfo.totalEmployees).toBe(9);
        
        // 5. Project Performance Overview
        expect(response.body.projectBreakdown).toHaveLength(6);
        
        // Projects should include task volume metrics
        response.body.projectBreakdown.forEach(project => {
          expect(project).toHaveProperty('totalTasks');
          expect(project).toHaveProperty('completedTasks');
          expect(project).toHaveProperty('overdueTasks');
          expect(project).toHaveProperty('completionRate');
          expect(project).toHaveProperty('overdueRate');
        });
      });
    });

    describe("Edge Cases and Error Handling", () => {
      it("should handle empty database gracefully", async () => {
        // Clear all data
        await Promise.all([
          Department.deleteMany({}),
          User.deleteMany({}),
          Project.deleteMany({}),
          Task.deleteMany({})
        ]);
        
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        expect(response.body.companyScope.totalProjects).toBe(0);
        expect(response.body.companyScope.totalTasks).toBe(0);
        expect(response.body.departmentMetrics).toHaveLength(0);
        expect(response.body.projectBreakdown).toHaveLength(0);
        expect(response.body.productivityTrend).toBe('Stable');
      });

      it("should handle departments with no projects", async () => {
        // Create a department with no projects
        const emptyDept = await Department.create({
          name: "Empty Department",
          description: "Department with no projects"
        });

        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        const emptyDeptMetrics = response.body.departmentMetrics.find(
          dept => dept.departmentName === "Empty Department"
        );
        expect(emptyDeptMetrics).toBeDefined();
        expect(emptyDeptMetrics.teamSize).toBe(0);
        expect(emptyDeptMetrics.projectStatusCounts['To Do']).toBe(0);
        expect(emptyDeptMetrics.taskStatusCounts['To Do']).toBe(0);
      });

      it("should handle projects with no tasks", async () => {
        // Create a project with no tasks
        const emptyProject = await Project.create({
          name: "Empty Project",
          department: [testDepartments.systemSolutioning],
          description: "Project with no tasks",
          deadline: dayjs().add(30, 'day').toDate(),
          createdBy: testUsers.manager1,
          teamMembers: [testUsers.staff1]
        });

        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // Project should not appear in project breakdown (filtered out)
        const emptyProjectInBreakdown = response.body.projectBreakdown.find(
          p => p.projectName === "Empty Project"
        );
        expect(emptyProjectInBreakdown).toBeUndefined();
        
        // But should be counted in company totals
        expect(response.body.companyScope.totalProjects).toBe(7);
      });

      it("should handle tasks without completion dates", async () => {
        // Create a completed task without completedAt date
        const taskWithoutCompletionDate = await Task.create({
          title: "Completed Task Without Date",
          description: "Task marked done but no completion date",
          status: "Done",
          priority: 5,
          deadline: dayjs().subtract(5, 'day').toDate(),
          assignedProject: testProjects.activeProject1,
          assignedTeamMembers: [testUsers.staff1],
          createdBy: testUsers.manager1,
          // No completedAt date
          createdAt: dayjs().subtract(20, 'day').toDate()
        });

        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // Should still count as completed in status counts
        expect(response.body.companyScope.taskStatusCounts['Done']).toBe(7);
      });
    });

    describe("Empty Data Edge Cases (TC-007)", () => {
      it("should handle company-wide report with no projects and tasks (empty state)", async () => {
        // Clear all projects and tasks to create "no data" state
        await Task.deleteMany({});
        await Project.deleteMany({});
        
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // Verify company scope shows zero for all metrics
        expect(response.body.companyScope).toMatchObject({
          totalProjects: 0,
          totalTasks: 0,
          projectStatusCounts: {
            "To Do": 0,
            "In Progress": 0,
            "Done": 0,
            "Overdue": 0
          },
          taskStatusCounts: {
            "To Do": 0,
            "In Progress": 0, 
            "Done": 0,
            "Overdue": 0
          },
          projectStatusPercentages: {
            "To Do": 0,
            "In Progress": 0,
            "Done": 0,
            "Overdue": 0
          },
          taskStatusPercentages: {
            "To Do": 0,
            "In Progress": 0,
            "Done": 0,
            "Overdue": 0
          }
        });
        
        // Verify productivity metrics default to zero/stable
        expect(response.body.productivityTrend).toBe("Stable");
        expect(response.body.projectCompletionRateThisMonth).toBe(0);
        expect(response.body.projectCompletionRateLastMonth).toBe(0);
        
        // Verify departments still exist but with zero metrics
        expect(response.body.departmentMetrics).toBeInstanceOf(Array);
        expect(response.body.departmentMetrics.length).toBeGreaterThan(0); // Departments should still exist
        
        // Each department should have zero metrics
        response.body.departmentMetrics.forEach(dept => {
          expect(dept).toMatchObject({
            projectStatusCounts: {
              "To Do": 0,
              "In Progress": 0,
              "Done": 0,
              "Overdue": 0
            },
            projectStatusPercentages: {
              "To Do": 0,
              "In Progress": 0,
              "Done": 0,
              "Overdue": 0
            },
            taskStatusCounts: {
              "To Do": 0,
              "In Progress": 0,
              "Done": 0,
              "Overdue": 0
            },
            taskStatusPercentages: {
              "To Do": 0,
              "In Progress": 0,
              "Done": 0,
              "Overdue": 0
            }
          });
          // Should have department name and id
          expect(dept.departmentName).toBeDefined();
          expect(dept.departmentId).toBeDefined();
        });
        
        // Verify project breakdown is empty
        expect(response.body.projectBreakdown).toBeInstanceOf(Array);
        expect(response.body.projectBreakdown).toHaveLength(0);
        
        // Verify company info still shows departments and users
        expect(response.body.companyInfo.totalDepartments).toBe(3);
        expect(response.body.companyInfo.totalEmployees).toBe(9);
      });

      it("should handle report with departments but no users assigned", async () => {
        // Clear all users except one HR user for authentication
        await User.deleteMany({ role: { $ne: "HR" } });
        await Task.deleteMany({});
        await Project.deleteMany({});
        
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // Should show minimal data
        expect(response.body.companyScope.totalProjects).toBe(0);
        expect(response.body.companyScope.totalTasks).toBe(0);
        expect(response.body.companyInfo.totalEmployees).toBe(1); // Only HR user
        expect(response.body.companyInfo.totalDepartments).toBe(3); // Departments preserved
        expect(response.body.departmentMetrics).toHaveLength(3);
        expect(response.body.projectBreakdown).toHaveLength(0);
      });

      it("should calculate productivity trend as 'Stable' with zero completion rates", async () => {
        // Clear all projects and tasks
        await Task.deleteMany({});
        await Project.deleteMany({});
        
        const response = await request(app).get("/api/senior-manager/report");
        
        expect(response.status).toBe(200);
        
        // When both months have 0% completion, trend should be "Stable"
        expect(response.body.projectCompletionRateThisMonth).toBe(0);
        expect(response.body.projectCompletionRateLastMonth).toBe(0);
        expect(response.body.productivityTrend).toBe("Stable");
      });
    });

    describe("Performance and Scalability", () => {
      it("should handle reasonable dataset sizes efficiently", async () => {
        const startTime = Date.now();
        const response = await request(app).get("/api/senior-manager/report");
        const endTime = Date.now();
        
        expect(response.status).toBe(200);
        expect(endTime - startTime).toBeLessThan(2000); // Should complete within 2 seconds for small dataset
        
        // Verify basic functionality with current dataset
        expect(response.body.companyScope.totalDepartments).toBe(3);
        expect(response.body.companyScope.totalEmployees).toBe(9);
        expect(response.body.companyScope.totalProjects).toBe(6);
      });
    });
  });
});