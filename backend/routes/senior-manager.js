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
 * GET /api/senior-manager/report
 * 
 * Purpose: Generates company-wide report data for Senior Managers/HR
 * 
 * This endpoint fetches and calculates metrics for the entire company:
 * - Time taken (avg completion times across all projects)
 * - Who was involved (all team members across departments)  
 * - Overdue status (company-wide overdue counts/percentages)
 * - Milestones (all project milestones status)
 * - Productivity trends (company-wide trend analysis)
 * - Department-level breakdowns
 * 
 * Returns: Aggregated company-wide report data grouped by departments and projects
 */
router.get('/report', async (req, res) => {
  try {
    // Step 1: Get ALL projects in the company
    const allProjects = await Project.find({})
      .populate('createdBy', 'name email role')
      .populate('teamMembers', 'name email role department')
      .populate('department', 'name')
      .lean();

    // Step 2: Get ALL tasks in the company
    const projectIds = allProjects.map(p => p._id);
    const allTasks = await Task.find({
      assignedProject: { $in: projectIds }
    })
      .populate('assignedTeamMembers', 'name email role department')
      .populate('assignedProject', 'name department')
      .populate('createdBy', 'name email role')
      .lean();

    // Step 3: Get all departments and users for company-wide analysis
    const Department = await import('../models/Department.js').then(m => m.default);
    const allDepartments = await Department.find({}).select('name').lean();
    
    const allUsers = await User.find({})
      .select('name email role department')
      .populate('department', 'name')
      .lean();

    // Step 4: Calculate company-wide metrics

    // TIME TAKEN METRICS (Company-wide)
    const now = dayjs();
    
    const completedTasks = allTasks.filter(t => t.status === 'Done');
    
    // Average task completion time (only for completed tasks with both createdAt and completedAt)
    const tasksWithCompletionTime = completedTasks.filter(t => t.createdAt && t.completedAt);
    const avgTaskCompletionDays = tasksWithCompletionTime.length > 0
      ? tasksWithCompletionTime.reduce((acc, task) => {
          const days = dayjs(task.completedAt).diff(dayjs(task.createdAt), 'day');
          return acc + days;
        }, 0) / tasksWithCompletionTime.length
      : 0;

    // Average project completion time (for completed projects)
    const completedProjects = allProjects.filter(p => {
      const projectTasks = allTasks.filter(t => String(t.assignedProject._id) === String(p._id));
      return projectTasks.length > 0 && projectTasks.every(t => t.status === 'Done');
    });

    const avgProjectCompletionDays = completedProjects.length > 0
      ? completedProjects.reduce((acc, project) => {
          const projectTasks = allTasks.filter(t => String(t.assignedProject._id) === String(project._id));
          if (projectTasks.length === 0) return acc;
          
          const projectStart = dayjs(project.createdAt);
          const projectEnd = dayjs(Math.max(...projectTasks.map(t => new Date(t.completedAt))));
          return acc + projectEnd.diff(projectStart, 'day');
        }, 0) / completedProjects.length
      : 0;

    // PRODUCTIVITY TRENDS (Company-wide)
    const thisMonth = dayjs().startOf('month');
    const lastMonth = dayjs().subtract(1, 'month').startOf('month');
    const lastMonthEnd = dayjs().subtract(1, 'month').endOf('month');

    const thisMonthTasks = allTasks.filter(t => dayjs(t.createdAt).isSame(thisMonth, 'month'));
    const thisMonthCompleted = thisMonthTasks.filter(t => t.status === 'Done').length;
    const completionRateThisMonth = thisMonthTasks.length > 0 
      ? Number(((thisMonthCompleted / thisMonthTasks.length) * 100).toFixed(1)) 
      : 0;

    const lastMonthTasks = allTasks.filter(t => dayjs(t.createdAt).isBetween(lastMonth, lastMonthEnd, 'day', '[]'));
    const lastMonthCompleted = lastMonthTasks.filter(t => t.status === 'Done').length;
    const completionRateLastMonth = lastMonthTasks.length > 0 
      ? Number(((lastMonthCompleted / lastMonthTasks.length) * 100).toFixed(1)) 
      : 0;

    let productivityTrend = "Stable";
    if (completionRateThisMonth > completionRateLastMonth + 5) {
      productivityTrend = "Improving";
    } else if (completionRateThisMonth < completionRateLastMonth - 5) {
      productivityTrend = "Declining";
    }

    // DEPARTMENT-LEVEL BREAKDOWNS
    const departmentMetrics = allDepartments.map(dept => {
      // Get projects for this department
      const deptProjects = allProjects.filter(p => 
        p.department && String(p.department._id) === String(dept._id)
      );
      
      // Get tasks for department projects
      const deptProjectIds = deptProjects.map(p => p._id);
      const deptTasks = allTasks.filter(t => 
        deptProjectIds.some(pid => String(t.assignedProject._id) === String(pid))
      );

      // Get users in this department
      const deptUsers = allUsers.filter(u => 
        u.department && String(u.department._id) === String(dept._id)
      );

      // Calculate department metrics
      const totalProjects = deptProjects.length;
      const totalTasks = deptTasks.length;
      const completedTasks = deptTasks.filter(t => t.status === 'Done').length;
      const overdueTasks = deptTasks.filter(t => {
        if (!t.deadline || t.status === 'Done') return false;
        return now.isAfter(dayjs(t.deadline), 'day');
      }).length;

      // Project status counts for department
      const projectStatusCounts = {
        'To Do': 0,
        'In Progress': 0,
        'Done': 0,
        'Overdue': 0
      };

      deptProjects.forEach(project => {
        const projectTasks = deptTasks.filter(t => String(t.assignedProject._id) === String(project._id));
        
        if (projectTasks.length === 0) {
          projectStatusCounts['To Do']++;
          return;
        }

        const hasOverdueTasks = projectTasks.some(t => {
          if (!t.deadline || t.status === 'Done') return false;
          return now.isAfter(dayjs(t.deadline), 'day');
        });

        if (hasOverdueTasks) {
          projectStatusCounts['Overdue']++;
        } else if (projectTasks.every(t => t.status === 'Done')) {
          projectStatusCounts['Done']++;
        } else if (projectTasks.some(t => t.status === 'In Progress')) {
          projectStatusCounts['In Progress']++;
        } else {
          projectStatusCounts['To Do']++;
        }
      });

      return {
        departmentId: dept._id,
        departmentName: dept.name,
        totalProjects,
        totalTasks,
        completedTasks,
        overdueTasks,
        teamSize: deptUsers.length,
        completionRate: totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0,
        overdueRate: totalTasks > 0 ? Number(((overdueTasks / totalTasks) * 100).toFixed(1)) : 0,
        projectStatusCounts,
        projectStatusPercentages: {
          'To Do': totalProjects > 0 ? Number(((projectStatusCounts['To Do'] / totalProjects) * 100).toFixed(1)) : 0,
          'In Progress': totalProjects > 0 ? Number(((projectStatusCounts['In Progress'] / totalProjects) * 100).toFixed(1)) : 0,
          'Done': totalProjects > 0 ? Number(((projectStatusCounts['Done'] / totalProjects) * 100).toFixed(1)) : 0,
          'Overdue': totalProjects > 0 ? Number(((projectStatusCounts['Overdue'] / totalProjects) * 100).toFixed(1)) : 0
        }
      };
    });

    // COMPANY-WIDE PROJECT SCOPE
    const totalProjects = allProjects.length;
    const companyProjectStatusCounts = {
      'To Do': 0,
      'In Progress': 0,
      'Done': 0,
      'Overdue': 0
    };

    // Calculate project statuses company-wide
    allProjects.forEach(project => {
      const projectTasks = allTasks.filter(t => String(t.assignedProject._id) === String(project._id));
      
      if (projectTasks.length === 0) {
        companyProjectStatusCounts['To Do']++;
        return;
      }

      const hasOverdueTasks = projectTasks.some(t => {
        if (!t.deadline || t.status === 'Done') return false;
        return now.isAfter(dayjs(t.deadline), 'day');
      });

      if (hasOverdueTasks) {
        companyProjectStatusCounts['Overdue']++;
      } else if (projectTasks.every(t => t.status === 'Done')) {
        companyProjectStatusCounts['Done']++;
      } else if (projectTasks.some(t => t.status === 'In Progress')) {
        companyProjectStatusCounts['In Progress']++;
      } else {
        companyProjectStatusCounts['To Do']++;
      }
    });

    // COMPANY-WIDE TASK SCOPE
    const totalTasks = allTasks.length;
    const companyTaskStatusCounts = {
      'To Do': allTasks.filter(t => t.status === 'To Do').length,
      'In Progress': allTasks.filter(t => t.status === 'In Progress').length,
      'Done': allTasks.filter(t => t.status === 'Done').length,
      'Overdue': allTasks.filter(t => {
        if (!t.deadline || t.status === 'Done') return false;
        return now.isAfter(dayjs(t.deadline), 'day');
      }).length
    };

    // PROJECT-LEVEL BREAKDOWN (Top projects by task count)
    const projectBreakdown = allProjects.map(project => {
      const projectTasks = allTasks.filter(t => String(t.assignedProject._id) === String(project._id));
      const completedTasks = projectTasks.filter(t => t.status === 'Done').length;
      const overdueTasks = projectTasks.filter(t => {
        if (!t.deadline || t.status === 'Done') return false;
        return now.isAfter(dayjs(t.deadline), 'day');
      }).length;

      return {
        projectId: project._id,
        projectName: project.name,
        departmentName: project.department?.name || 'Unassigned',
        totalTasks: projectTasks.length,
        completedTasks,
        overdueTasks,
        completionRate: projectTasks.length > 0 ? Number(((completedTasks / projectTasks.length) * 100).toFixed(1)) : 0,
        overdueRate: projectTasks.length > 0 ? Number(((overdueTasks / projectTasks.length) * 100).toFixed(1)) : 0
      };
    })
    .filter(p => p.totalTasks > 0) // Only include projects with tasks
    .sort((a, b) => b.totalTasks - a.totalTasks); // Sort by total tasks descending

    // Build response
    const reportData = {
      // Time performance metrics
      avgTaskCompletionDays: Number(avgTaskCompletionDays.toFixed(1)),
      avgProjectCompletionDays: Number(avgProjectCompletionDays.toFixed(1)),
      productivityTrend,
      completionRateThisMonth,
      completionRateLastMonth,
      
      // Company-wide scope
      companyScope: {
        totalProjects,
        totalTasks,
        totalEmployees: allUsers.length,
        totalDepartments: allDepartments.length,
        projectStatusCounts: companyProjectStatusCounts,
        projectStatusPercentages: {
          'To Do': totalProjects > 0 ? Number(((companyProjectStatusCounts['To Do'] / totalProjects) * 100).toFixed(1)) : 0,
          'In Progress': totalProjects > 0 ? Number(((companyProjectStatusCounts['In Progress'] / totalProjects) * 100).toFixed(1)) : 0,
          'Done': totalProjects > 0 ? Number(((companyProjectStatusCounts['Done'] / totalProjects) * 100).toFixed(1)) : 0,
          'Overdue': totalProjects > 0 ? Number(((companyProjectStatusCounts['Overdue'] / totalProjects) * 100).toFixed(1)) : 0
        },
        taskStatusCounts: companyTaskStatusCounts,
        taskStatusPercentages: {
          'To Do': totalTasks > 0 ? Number(((companyTaskStatusCounts['To Do'] / totalTasks) * 100).toFixed(1)) : 0,
          'In Progress': totalTasks > 0 ? Number(((companyTaskStatusCounts['In Progress'] / totalTasks) * 100).toFixed(1)) : 0,
          'Done': totalTasks > 0 ? Number(((companyTaskStatusCounts['Done'] / totalTasks) * 100).toFixed(1)) : 0,
          'Overdue': totalTasks > 0 ? Number(((companyTaskStatusCounts['Overdue'] / totalTasks) * 100).toFixed(1)) : 0
        }
      },
      
      // Department breakdowns
      departmentMetrics,
      
      // Project breakdowns
      projectBreakdown,
      
      // Company info
      companyInfo: {
        reportGeneratedAt: new Date().toISOString(),
        totalDepartments: allDepartments.length,
        totalEmployees: allUsers.length
      }
    };

    res.json(reportData);

  } catch (error) {
    console.error('Error generating senior manager report:', error);
    res.status(500).json({ 
      error: 'Failed to generate company-wide report',
      details: error.message 
    });
  }
});

export default router;