import { Router } from 'express';
import mongoose from 'mongoose';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween.js';

dayjs.extend(isBetween);

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Director Reports
 *     description: Aggregated, department-level analytics for directors
 */

/**
 * @openapi
 * /api/director/report:
 *   get:
 *     summary: Department-level report for Directors
 *     description: >
 *       Returns aggregated metrics for a single department, including time performance,
 *       scope (projects/tasks), overdue breakdowns, milestones, and team performance.
 *     tags: [Director Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         required: true
 *         description: MongoDB ObjectId of the department to report on
 *         schema:
 *           type: string
 *           example: "66a1e9d5f4b5f2a5c1d3b9e0"
 *     responses:
 *       200:
 *         description: Report generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DirectorReport'
 *       400:
 *         description: Department ID missing or invalid
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       500:
 *         description: Failed to generate report
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *
 *     examples:
 *       success:
 *         summary: Sample report payload
 *         value:
 *           avgTaskCompletionDays: 3.4
 *           avgProjectCompletionDays: 18.0
 *           productivityTrend: "Improving"
 *           completionRateThisMonth: 60.0
 *           completionRateLastMonth: 0.0
 *           projectScope:
 *             totalProjects: 5
 *             projectStatusCounts: { "To Do": 1, "In Progress": 2, "Done": 1, "Overdue": 1 }
 *             projectStatusPercentages: { "To Do": 20.0, "In Progress": 40.0, "Done": 20.0, "Overdue": 20.0 }
 *             milestones:
 *               - projectId: "66a..."
 *                 projectName: "Website Revamp"
 *                 milestone: "Project Status"
 *                 status: "In Progress"
 *                 deadline: "2025-12-31T00:00:00.000Z"
 *                 overdueResponsibility:
 *                   - departmentId: "66b..."
 *                     departmentName: "Design"
 *                     overdueTaskCount: 2
 *                     overdueTasks:
 *                       - taskId: "77a..."
 *                         taskName: "Hero Banner"
 *                         deadline: "2025-10-10T00:00:00.000Z"
 *                         daysPastDue: 5
 *                 hasOverdueFromOtherDepts: true
 *           taskScope:
 *             totalTasks: 27
 *             taskStatusCounts: { "To Do": 8, "In Progress": 11, "Done": 6, "Overdue": 2 }
 *             taskStatusPercentages: { "To Do": 29.6, "In Progress": 40.7, "Done": 22.2, "Overdue": 7.4 }
 *             overdueCount: 2
 *             overduePercentage: 7.4
 *             overdueTasksByProject:
 *               - projectId: "66a..."
 *                 projectName: "Website Revamp"
 *                 overdueTasks:
 *                   - taskId: "77a..."
 *                     taskName: "Hero Banner"
 *                     deadline: "2025-10-10T00:00:00.000Z"
 *                     assignedMembers:
 *                       - { id: "55a...", name: "Alice", role: "designer" }
 *                     daysPastDue: 5
 *                 overdueCount: 1
 *           teamPerformance:
 *             teamSize: 4
 *             departmentTeam:
 *               - userId: "55a..."
 *                 name: "Alice"
 *                 role: "designer"
 *                 tasksInvolved: 6
 *                 todoTasks: 2
 *                 inProgressTasks: 3
 *                 completedTasks: 1
 *                 overdueTasks: 0
 *                 overdueRate: 0
 *           departmentInfo:
 *             departmentId: "66a1e9d5f4b5f2a5c1d3b9e0"
 *             departmentName: "Engineering"
 */
router.get('/report', async (req, res) => {
  try {
    const { departmentId } = req.query;
    
    if (!departmentId) {
      return res.status(400).json({ error: 'Department ID required' });
    }

    if (!mongoose.isValidObjectId(departmentId)) {
      return res.status(400).json({ error: 'Invalid department ID' });
    }

    const departmentProjects = await Project.find({
      department: departmentId
    })
    .populate('createdBy', 'name email role')
    .populate('teamMembers', 'name email role department')
    .populate('department', 'name')
    .lean();

    const projectIds = departmentProjects.map(p => p._id);
    const departmentTasks = await Task.find({
      assignedProject: { $in: projectIds }
    })
    .populate('assignedTeamMembers', 'name email role department')
    .populate('assignedProject', 'name')
    .populate('createdBy', 'name email role')
    .lean();

    const Department = await import('../models/Department.js').then(m => m.default);
    const departmentInfo = await Department.findById(departmentId).select('name').lean();
    
    const departmentUsers = await User.find({
      department: departmentId
    })
    .select('name email role')
    .lean();

    const now = dayjs();
    const departmentProjectTasks = departmentTasks;
    const departmentMemberIds = departmentUsers.map(user => String(user._id));
    const departmentMemberCompletedTasks = departmentTasks.filter(t => 
      t.status === 'Done' && 
      t.assignedTeamMembers.some(member => 
        departmentMemberIds.includes(String(member._id))
      )
    );
    
    const tasksWithCompletionTime = departmentMemberCompletedTasks.filter(t => t.createdAt && t.completedAt);
    const avgTaskCompletionDays = tasksWithCompletionTime.length > 0
      ? tasksWithCompletionTime.reduce((acc, task) => {
          const days = dayjs(task.completedAt).diff(dayjs(task.createdAt), 'day');
          return acc + days;
        }, 0) / tasksWithCompletionTime.length
      : 0;

    const completedProjects = departmentProjects.filter(p => {
      const projectTasks = departmentProjectTasks.filter(t => String(t.assignedProject._id) === String(p._id));
      return projectTasks.length > 0 && projectTasks.every(t => t.status === 'Done');
    });

    const avgProjectCompletionDays = completedProjects.length > 0
      ? completedProjects.reduce((acc, project) => {
          const projectTasks = departmentProjectTasks.filter(t => String(t.assignedProject._id) === String(project._id));
          if (projectTasks.length === 0) return acc;
          const tasksWithCompletedAt = projectTasks.filter(t => t.completedAt);
          if (tasksWithCompletedAt.length === 0) {
            const projectStart = dayjs(project.createdAt);
            const projectEnd = dayjs();
            return acc + projectEnd.diff(projectStart, 'day');
          }
          const projectStart = dayjs(project.createdAt);
          const projectEnd = dayjs(Math.max(...tasksWithCompletedAt.map(t => new Date(t.completedAt))));
          const days = projectEnd.diff(projectStart, 'day');
          return acc + (days >= 0 ? days : 0);
        }, 0) / completedProjects.length
      : 0;

    const departmentTeam = departmentUsers.map(user => {
      const userTasks = departmentProjectTasks.filter(t => 
        t.assignedTeamMembers.some(m => String(m._id) === String(user._id))
      );
      
      const todoTasks = userTasks.filter(t => t.status === 'To Do').length;
      const inProgressTasks = userTasks.filter(t => t.status === 'In Progress').length;
      const completedTasks = userTasks.filter(t => t.status === 'Done').length;
      
      const overdueTasks = userTasks.filter(t => {
        if (!t.deadline || t.status === 'Done') return false;
        return dayjs().isAfter(dayjs(t.deadline), 'day');
      }).length;
      
      const totalTasks = userTasks.length;
      const overdueRate = totalTasks > 0 ? Number(((overdueTasks / totalTasks) * 100).toFixed(1)) : 0;
      
      return {
        userId: user._id,
        name: user.name,
        role: user.role,
        tasksInvolved: totalTasks,
        todoTasks,
        inProgressTasks,
        completedTasks,
        overdueTasks,
        overdueRate
      };
    });

    const projectStatusCounts = { 'To Do': 0, 'In Progress': 0, 'Done': 0, 'Overdue': 0 };
    
    departmentProjects.forEach(project => {
      const projectTasks = departmentTasks.filter(t => String(t.assignedProject._id) === String(project._id));
      
      let status = 'To Do';
      if (projectTasks.length === 0) {
        status = 'To Do';
      } else {
        const allDone = projectTasks.every(t => t.status === 'Done');
        const hasInProgress = projectTasks.some(t => t.status === 'In Progress');
        const allToDo = projectTasks.every(t => t.status === 'To Do');
        const projectOverdue = project.deadline && dayjs().isAfter(dayjs(project.deadline), 'day');
        
        if (projectOverdue && !allDone) {
          status = 'Overdue';
        } else if (allDone) {
          status = 'Done';
        } else if (hasInProgress) {
          status = 'In Progress';
        } else if (allToDo) {
          status = 'To Do';
        } else {
          status = 'In Progress';
        }
      }
      
      projectStatusCounts[status]++;
    });

    const totalProjects = departmentProjects.length;
    const projectStatusPercentages = {
      'To Do': totalProjects > 0 ? Number(((projectStatusCounts['To Do'] / totalProjects) * 100).toFixed(1)) : 0,
      'In Progress': totalProjects > 0 ? Number(((projectStatusCounts['In Progress'] / totalProjects) * 100).toFixed(1)) : 0,
      'Done': totalProjects > 0 ? Number(((projectStatusCounts['Done'] / totalProjects) * 100).toFixed(1)) : 0,
      'Overdue': totalProjects > 0 ? Number(((projectStatusCounts['Overdue'] / totalProjects) * 100).toFixed(1)) : 0
    };

    const taskStatusCounts = { 'To Do': 0, 'In Progress': 0, 'Done': 0, 'Overdue': 0 };
    
    departmentProjectTasks.forEach(task => {
      let status = task.status;
      if (task.deadline && task.status !== 'Done' && dayjs().isAfter(dayjs(task.deadline), 'day')) {
        status = 'Overdue';
      }
      taskStatusCounts[status]++;
    });

    const totalDepartmentTasks = departmentProjectTasks.length;
    const taskStatusPercentages = {
      'To Do': totalDepartmentTasks > 0 ? Number(((taskStatusCounts['To Do'] / totalDepartmentTasks) * 100).toFixed(1)) : 0,
      'In Progress': totalDepartmentTasks > 0 ? Number(((taskStatusCounts['In Progress'] / totalDepartmentTasks) * 100).toFixed(1)) : 0,
      'Done': totalDepartmentTasks > 0 ? Number(((taskStatusCounts['Done'] / totalDepartmentTasks) * 100).toFixed(1)) : 0,
      'Overdue': totalDepartmentTasks > 0 ? Number(((taskStatusCounts['Overdue'] / totalDepartmentTasks) * 100).toFixed(1)) : 0
    };

    const overdueTasks = departmentProjectTasks.filter(t => {
      if (!t.deadline || t.status === 'Done') return false;
      if (!dayjs().isAfter(dayjs(t.deadline), 'day')) return false;
      return true;
    });

    const overdueCount = overdueTasks.length;
    const totalTasks = departmentProjectTasks.length;
    const overduePercentage = totalTasks > 0 ? ((overdueCount / totalTasks) * 100) : 0;

    const overdueTasksByProject = departmentProjects.map(project => {
      const projectOverdueTasks = overdueTasks.filter(t => 
        String(t.assignedProject._id) === String(project._id)
      );

      return {
        projectId: project._id,
        projectName: project.name,
        overdueTasks: projectOverdueTasks.map(task => ({
          taskId: task._id,
          taskName: task.title,
          deadline: task.deadline,
          assignedMembers: task.assignedTeamMembers
            .filter(member => departmentMemberIds.includes(String(member._id)))
            .map(member => ({
              id: member._id,
              name: member.name,
              role: member.role
            })),
          daysPastDue: dayjs().diff(dayjs(task.deadline), 'day')
        })),
        overdueCount: projectOverdueTasks.length
      };
    }).filter(project => project.overdueCount > 0);

    const milestones = await Promise.all(departmentProjects.map(async (project) => {
      const allProjectTasks = await Task.find({
        assignedProject: project._id
      })
      .populate({
        path: 'assignedTeamMembers',
        select: 'name email role department',
        populate: {
          path: 'department',
          select: 'name'
        }
      })
      .lean();

      const projectTasks = departmentProjectTasks.filter(t => String(t.assignedProject._id) === String(project._id));
      
      let status = 'To Do';
      if (projectTasks.length === 0) {
        status = 'To Do';
      } else {
        const allDone = projectTasks.every(t => t.status === 'Done');
        const hasInProgress = projectTasks.some(t => t.status === 'In Progress');
        const allToDo = projectTasks.every(t => t.status === 'To Do');
        const projectOverdue = project.deadline && dayjs().isAfter(dayjs(project.deadline), 'day');
        if (projectOverdue && !allDone) {
          status = 'Overdue';
        } else if (allDone) {
          status = 'Done';
        } else if (hasInProgress) {
          status = 'In Progress';
        } else if (allToDo) {
          status = 'To Do';
        } else {
          status = 'In Progress';
        }
      }

      const overdueTasksInProject = allProjectTasks.filter(t => {
        if (!t.deadline || t.status === 'Done') return false;
        return dayjs().isAfter(dayjs(t.deadline), 'day');
      });

      const overdueByDepartment = {};
      for (const task of overdueTasksInProject) {
        for (const member of task.assignedTeamMembers) {
          if (member.department && member.department._id) {
            const deptId = String(member.department._id);
            const deptName = member.department.name;
            if (!overdueByDepartment[deptId]) {
              overdueByDepartment[deptId] = {
                departmentId: deptId,
                departmentName: deptName,
                overdueTaskCount: 0,
                overdueTasks: []
              };
            }
            const taskAlreadyAdded = overdueByDepartment[deptId].overdueTasks.some(
              existingTask => String(existingTask.taskId) === String(task._id)
            );
            if (!taskAlreadyAdded) {
              overdueByDepartment[deptId].overdueTaskCount++;
              overdueByDepartment[deptId].overdueTasks.push({
                taskId: task._id,
                taskName: task.title,
                deadline: task.deadline,
                daysPastDue: dayjs().diff(dayjs(task.deadline), 'day')
              });
            }
          }
        }
      }

      return {
        projectId: project._id,
        projectName: project.name,
        milestone: `Project Status`,
        status,
        deadline: project.deadline,
        overdueResponsibility: Object.values(overdueByDepartment),
        hasOverdueFromOtherDepts: Object.keys(overdueByDepartment).some(
          deptId => deptId !== String(departmentId)
        )
      };
    }));

    const completedProjectsCount = departmentProjects.filter(project => {
      const projectTasks = departmentProjectTasks.filter(t => String(t.assignedProject._id) === String(project._id));
      return projectTasks.length > 0 && projectTasks.every(t => t.status === 'Done');
    }).length;
    
    const currentCompletionRate = totalProjects > 0 ? (completedProjectsCount / totalProjects) * 100 : 0;
    let productivityTrend = 'Stable';
    let projectCompletionRateThisMonth = currentCompletionRate;
    let projectCompletionRateLastMonth = 0;

    if (currentCompletionRate >= 50) {
      productivityTrend = 'Improving';
    } else if (currentCompletionRate > 0) {
      productivityTrend = 'Stable';
    }
    
    const thisMonthTotalProjects = departmentProjects.filter(p => 
      dayjs(p.createdAt).isAfter(dayjs().startOf('month'))
    ).length;
    
    const lastMonthTotalProjects = departmentProjects.filter(p => 
      dayjs(p.createdAt).isBetween(dayjs().subtract(1, 'month').startOf('month'), dayjs().startOf('month'))
    ).length;

    const reportData = {
      avgTaskCompletionDays: Number(isNaN(avgTaskCompletionDays) ? 0 : avgTaskCompletionDays.toFixed(1)),
      avgProjectCompletionDays: Number(isNaN(avgProjectCompletionDays) ? 0 : avgProjectCompletionDays.toFixed(1)),
      productivityTrend,
      completionRateThisMonth: Number(projectCompletionRateThisMonth.toFixed(1)),
      completionRateLastMonth: Number(projectCompletionRateLastMonth.toFixed(1)),
      projectScope: {
        totalProjects: totalProjects,
        projectStatusCounts: projectStatusCounts,
        projectStatusPercentages: projectStatusPercentages,
        milestones: milestones
      },
      taskScope: {
        totalTasks: totalDepartmentTasks,
        taskStatusCounts: taskStatusCounts,
        taskStatusPercentages: taskStatusPercentages,
        overdueCount,
        overduePercentage: Number(overduePercentage.toFixed(1)),
        overdueTasksByProject
      },
      teamPerformance: {
        teamSize: departmentUsers.length,
        departmentTeam: departmentTeam
      },
      departmentInfo: {
        departmentId: departmentId,
        departmentName: departmentInfo ? departmentInfo.name : 'Unknown Department'
      }
    };

    res.json(reportData);

  } catch (error) {
    console.error('Director report error:', error);
    res.status(500).json({ error: 'Failed to generate director report' });
  }
});

export default router;

/**
 * @openapi
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         error:
 *           type: string
 *           example: "Failed to generate director report"
 *         message:
 *           type: string
 *           example: "Department ID required"
 *
 *     DirectorReport:
 *       type: object
 *       properties:
 *         avgTaskCompletionDays: { type: number, format: float, example: 3.4 }
 *         avgProjectCompletionDays: { type: number, format: float, example: 18.0 }
 *         productivityTrend: { type: string, enum: ["Improving","Stable","Declining"], example: "Improving" }
 *         completionRateThisMonth: { type: number, format: float, example: 60.0 }
 *         completionRateLastMonth: { type: number, format: float, example: 0.0 }
 *         projectScope:
 *           $ref: '#/components/schemas/ProjectScope'
 *         taskScope:
 *           $ref: '#/components/schemas/TaskScope'
 *         teamPerformance:
 *           $ref: '#/components/schemas/TeamPerformance'
 *         departmentInfo:
 *           $ref: '#/components/schemas/DepartmentInfo'
 *
 *     ProjectScope:
 *       type: object
 *       properties:
 *         totalProjects: { type: integer, example: 5 }
 *         projectStatusCounts:
 *           $ref: '#/components/schemas/StatusCounts'
 *         projectStatusPercentages:
 *           $ref: '#/components/schemas/StatusPercentages'
 *         milestones:
 *           type: array
 *           items: { $ref: '#/components/schemas/Milestone' }
 *
 *     TaskScope:
 *       type: object
 *       properties:
 *         totalTasks: { type: integer, example: 27 }
 *         taskStatusCounts:
 *           $ref: '#/components/schemas/StatusCounts'
 *         taskStatusPercentages:
 *           $ref: '#/components/schemas/StatusPercentages'
 *         overdueCount: { type: integer, example: 2 }
 *         overduePercentage: { type: number, format: float, example: 7.4 }
 *         overdueTasksByProject:
 *           type: array
 *           items: { $ref: '#/components/schemas/OverdueByProject' }
 *
 *     StatusCounts:
 *       type: object
 *       properties:
 *         To Do: { type: integer, example: 8 }
 *         In Progress: { type: integer, example: 11 }
 *         Done: { type: integer, example: 6 }
 *         Overdue: { type: integer, example: 2 }
 *
 *     StatusPercentages:
 *       type: object
 *       properties:
 *         To Do: { type: number, format: float, example: 29.6 }
 *         In Progress: { type: number, format: float, example: 40.7 }
 *         Done: { type: number, format: float, example: 22.2 }
 *         Overdue: { type: number, format: float, example: 7.4 }
 *
 *     OverdueByProject:
 *       type: object
 *       properties:
 *         projectId: { type: string }
 *         projectName: { type: string }
 *         overdueTasks:
 *           type: array
 *           items: { $ref: '#/components/schemas/OverdueTaskEntry' }
 *         overdueCount: { type: integer }
 *
 *     OverdueTaskEntry:
 *       type: object
 *       properties:
 *         taskId: { type: string }
 *         taskName: { type: string }
 *         deadline: { type: string, format: date-time }
 *         assignedMembers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id: { type: string }
 *               name: { type: string }
 *               role: { type: string }
 *         daysPastDue: { type: integer, example: 5 }
 *
 *     Milestone:
 *       type: object
 *       properties:
 *         projectId: { type: string }
 *         projectName: { type: string }
 *         milestone: { type: string, example: "Project Status" }
 *         status: { type: string, enum: ["To Do","In Progress","Done","Overdue"] }
 *         deadline: { type: string, format: date-time, nullable: true }
 *         overdueResponsibility:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               departmentId: { type: string }
 *               departmentName: { type: string }
 *               overdueTaskCount: { type: integer }
 *               overdueTasks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     taskId: { type: string }
 *                     taskName: { type: string }
 *                     deadline: { type: string, format: date-time }
 *                     daysPastDue: { type: integer }
 *         hasOverdueFromOtherDepts: { type: boolean }
 *
 *     TeamPerformance:
 *       type: object
 *       properties:
 *         teamSize: { type: integer, example: 4 }
 *         departmentTeam:
 *           type: array
 *           items: { $ref: '#/components/schemas/TeamMemberPerf' }
 *
 *     TeamMemberPerf:
 *       type: object
 *       properties:
 *         userId: { type: string }
 *         name: { type: string }
 *         role: { type: string }
 *         tasksInvolved: { type: integer }
 *         todoTasks: { type: integer }
 *         inProgressTasks: { type: integer }
 *         completedTasks: { type: integer }
 *         overdueTasks: { type: integer }
 *         overdueRate: { type: number, format: float }
 *
 *     DepartmentInfo:
 *       type: object
 *       properties:
 *         departmentId: { type: string }
 *         departmentName: { type: string }
 */
