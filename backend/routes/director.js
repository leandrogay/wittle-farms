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
 * GET /api/director/report
 * 
 * Purpose: Generates department-level report data for Directors
 * 
 * This endpoint fetches and calculates metrics specific to a Director's department:
 * - Time taken (avg completion times)
 * - Who was involved (team members)  
 * - Overdue status (overdue counts/percentages)
 * - Milestones (project milestones status)
 * - Productivity trends (basic trend analysis)
 * 
 * Query params:
 *   - departmentId: The director's department ID (optional, can be inferred from user)
 * 
 * Returns: Aggregated department report data
 */
router.get('/report', async (req, res) => {
  try {
    // TODO: In real implementation, get director's department from authenticated user
    // For now, we'll use query param or default to first department
    const { departmentId } = req.query;
    
    if (!departmentId) {
      return res.status(400).json({ error: 'Department ID required' });
    }

    if (!mongoose.isValidObjectId(departmentId)) {
      return res.status(400).json({ error: 'Invalid department ID' });
    }

    // Step 1: Find all projects associated with this department
    // This includes projects where the department is in the department array
    const departmentProjects = await Project.find({
      department: departmentId
    })
    .populate('createdBy', 'name email role')
    .populate('teamMembers', 'name email role department')
    .populate('department', 'name')
    .lean();

    // Step 2: Get all tasks for these projects
    const projectIds = departmentProjects.map(p => p._id);
    const departmentTasks = await Task.find({
      assignedProject: { $in: projectIds }
    })
    .populate('assignedTeamMembers', 'name email role department')
    .populate('assignedProject', 'name')
    .populate('createdBy', 'name email role')
    .lean();

    // Step 3: Get department information and users in this department
    const Department = await import('../models/Department.js').then(m => m.default);
    const departmentInfo = await Department.findById(departmentId).select('name').lean();
    
    const departmentUsers = await User.find({
      department: departmentId
    })
    .select('name email role')
    .lean();

    // Step 4: Calculate metrics as per Jira user story requirements

    // TIME TAKEN METRICS
    const now = dayjs();
    
    // Get department member IDs for filtering (used in multiple sections)
    const departmentMemberIds = departmentUsers.map(user => String(user._id));
    
    // Filter tasks to only include those assigned to department members
    const departmentMemberTasks = departmentTasks.filter(t =>
      t.assignedTeamMembers.some(member => 
        departmentMemberIds.includes(String(member._id))
      )
    );
    
    const completedTasks = departmentMemberTasks.filter(t => t.status === 'Done');
    
    // Average task completion time (only for completed tasks with both createdAt and completedAt)
    const tasksWithCompletionTime = completedTasks.filter(t => t.createdAt && t.completedAt);
    const avgTaskCompletionDays = tasksWithCompletionTime.length > 0
      ? tasksWithCompletionTime.reduce((acc, task) => {
          const days = dayjs(task.completedAt).diff(dayjs(task.createdAt), 'day');
          return acc + days;
        }, 0) / tasksWithCompletionTime.length
      : 0;

    // Average project completion time (for completed projects)
    const completedProjects = departmentProjects.filter(p => {
      const projectTasks = departmentMemberTasks.filter(t => String(t.assignedProject._id) === String(p._id));
      return projectTasks.length > 0 && projectTasks.every(t => t.status === 'Done');
    });

    const avgProjectCompletionDays = completedProjects.length > 0
      ? completedProjects.reduce((acc, project) => {
          const projectTasks = departmentMemberTasks.filter(t => String(t.assignedProject._id) === String(project._id));
          if (projectTasks.length === 0) return acc;
          
          const projectStart = dayjs(project.createdAt);
          const projectEnd = dayjs(Math.max(...projectTasks.map(t => new Date(t.completedAt))));
          return acc + projectEnd.diff(projectStart, 'day');
        }, 0) / completedProjects.length
      : 0;

    // WHO WAS INVOLVED - Enhanced Team Performance
    const departmentTeam = departmentUsers.map(user => {
      const userTasks = departmentMemberTasks.filter(t => 
        t.assignedTeamMembers.some(m => String(m._id) === String(user._id))
      );
      
      const todoTasks = userTasks.filter(t => t.status === 'To Do').length;
      const inProgressTasks = userTasks.filter(t => t.status === 'In Progress').length;
      const completedTasks = userTasks.filter(t => t.status === 'Done').length;
      
      // Calculate overdue tasks (past deadline and not completed)
      const overdueTasks = userTasks.filter(t => {
        if (!t.deadline || t.status === 'Done') return false;
        return now.isAfter(dayjs(t.deadline), 'day');
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

    // PROJECT SCOPE METRICS
    // Calculate project statuses using the same logic as milestones
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
        const projectOverdue = project.deadline && now.isAfter(dayjs(project.deadline), 'day');
        
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

    // TASK SCOPE METRICS  
    const taskStatusCounts = { 'To Do': 0, 'In Progress': 0, 'Done': 0, 'Overdue': 0 };
    
    departmentMemberTasks.forEach(task => {
      let status = task.status;
      
      // Check if task is overdue (past deadline and not completed)
      if (task.deadline && task.status !== 'Done' && now.isAfter(dayjs(task.deadline), 'day')) {
        status = 'Overdue';
      }
      
      taskStatusCounts[status]++;
    });

    const totalDepartmentTasks = departmentMemberTasks.length;
    const taskStatusPercentages = {
      'To Do': totalDepartmentTasks > 0 ? Number(((taskStatusCounts['To Do'] / totalDepartmentTasks) * 100).toFixed(1)) : 0,
      'In Progress': totalDepartmentTasks > 0 ? Number(((taskStatusCounts['In Progress'] / totalDepartmentTasks) * 100).toFixed(1)) : 0,
      'Done': totalDepartmentTasks > 0 ? Number(((taskStatusCounts['Done'] / totalDepartmentTasks) * 100).toFixed(1)) : 0,
      'Overdue': totalDepartmentTasks > 0 ? Number(((taskStatusCounts['Overdue'] / totalDepartmentTasks) * 100).toFixed(1)) : 0
    };

    // OVERDUE STATUS - Enhanced with detailed breakdown (department-specific)
    // Use the already filtered departmentMemberTasks from above
    const overdueTasks = departmentMemberTasks.filter(t => {
      if (!t.deadline || t.status === 'Done') return false;
      if (!now.isAfter(dayjs(t.deadline), 'day')) return false;
      return true; // Already filtered to department members above
    });

    const overdueCount = overdueTasks.length;
    const totalTasks = departmentMemberTasks.length;
    const overduePercentage = totalTasks > 0 ? ((overdueCount / totalTasks) * 100) : 0;

    // Detailed overdue analysis by project (only department member tasks)
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
          // Only show assigned members who are in this department
          assignedMembers: task.assignedTeamMembers
            .filter(member => departmentMemberIds.includes(String(member._id)))
            .map(member => ({
              id: member._id,
              name: member.name,
              role: member.role
            })),
          daysPastDue: now.diff(dayjs(task.deadline), 'day')
        })),
        overdueCount: projectOverdueTasks.length
      };
    }).filter(project => project.overdueCount > 0); // Only include projects with overdue tasks

    // MILESTONES - Project status with department responsibility tracking
    const milestones = await Promise.all(departmentProjects.map(async (project) => {
      // Get ALL tasks for this project (not just department tasks)
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

      const projectTasks = departmentTasks.filter(t => String(t.assignedProject._id) === String(project._id));
      
      // Determine project status based on task statuses and project deadline
      let status = 'To Do';
      
      if (projectTasks.length === 0) {
        // No tasks in project for this department
        status = 'To Do';
      } else {
        const allDone = projectTasks.every(t => t.status === 'Done');
        const hasInProgress = projectTasks.some(t => t.status === 'In Progress');
        const allToDo = projectTasks.every(t => t.status === 'To Do');
        
        // Check if project deadline has passed
        const projectOverdue = project.deadline && now.isAfter(dayjs(project.deadline), 'day');
        
        if (projectOverdue && !allDone) {
          status = 'Overdue';
        } else if (allDone) {
          status = 'Done';
        } else if (hasInProgress) {
          status = 'In Progress';
        } else if (allToDo) {
          status = 'To Do';
        } else {
          // Mixed states (some done, some to do, no in progress)
          status = 'In Progress';
        }
      }

      // Analyze overdue tasks by department for this project
      const overdueTasksInProject = allProjectTasks.filter(t => {
        if (!t.deadline || t.status === 'Done') return false;
        return now.isAfter(dayjs(t.deadline), 'day');
      });

      // Group overdue tasks by department
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
            
            // Check if this task is already counted for this department
            const taskAlreadyAdded = overdueByDepartment[deptId].overdueTasks.some(
              existingTask => String(existingTask.taskId) === String(task._id)
            );
            
            if (!taskAlreadyAdded) {
              overdueByDepartment[deptId].overdueTaskCount++;
              overdueByDepartment[deptId].overdueTasks.push({
                taskId: task._id,
                taskName: task.title,
                deadline: task.deadline,
                daysPastDue: now.diff(dayjs(task.deadline), 'day')
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
        // Enhanced: Show which departments have overdue tasks
        overdueResponsibility: Object.values(overdueByDepartment),
        hasOverdueFromOtherDepts: Object.keys(overdueByDepartment).some(
          deptId => deptId !== String(departmentId)
        )
      };
    }));

    // PRODUCTIVITY TRENDS (basic comparison)
    // For simplicity, compare this month vs last month completion rates
    const thisMonth = now.startOf('month');
    const lastMonth = now.subtract(1, 'month').startOf('month');
    
    const thisMonthCompleted = completedTasks.filter(t => 
      dayjs(t.completedAt).isAfter(thisMonth)
    ).length;
    
    const lastMonthCompleted = completedTasks.filter(t => 
      dayjs(t.completedAt).isBetween(lastMonth, thisMonth)
    ).length;

    const thisMonthTotal = departmentMemberTasks.filter(t => 
      dayjs(t.createdAt).isAfter(thisMonth)
    ).length;
    
    const completionRateThisMonth = thisMonthTotal > 0 ? (thisMonthCompleted / thisMonthTotal) * 100 : 0;
    const completionRateLastMonth = lastMonthCompleted > 0 ? 
      (lastMonthCompleted / departmentMemberTasks.filter(t => 
        dayjs(t.createdAt).isBetween(lastMonth, thisMonth)
      ).length || 1) * 100 : 0;

    let productivityTrend = 'Stable';
    if (completionRateThisMonth > completionRateLastMonth + 5) {
      productivityTrend = 'Improving';
    } else if (completionRateThisMonth < completionRateLastMonth - 5) {
      productivityTrend = 'Declining';
    }

    // Step 5: Return structured response matching our planned metrics
    const reportData = {
      // Time Performance Metrics
      avgTaskCompletionDays: Number(avgTaskCompletionDays.toFixed(1)),
      avgProjectCompletionDays: Number(avgProjectCompletionDays.toFixed(1)),
      productivityTrend,
      completionRateThisMonth: Number(completionRateThisMonth.toFixed(1)),
      completionRateLastMonth: Number(completionRateLastMonth.toFixed(1)),

      // Project Scope
      projectScope: {
        totalProjects: totalProjects,
        projectStatusCounts: projectStatusCounts,
        projectStatusPercentages: projectStatusPercentages,
        milestones: milestones
      },
      
      // Task Scope
      taskScope: {
        totalTasks: totalDepartmentTasks,
        taskStatusCounts: taskStatusCounts,
        taskStatusPercentages: taskStatusPercentages,
        overdueCount,
        overduePercentage: Number(overduePercentage.toFixed(1)),
        overdueTasksByProject
      },
      
      // Team Performance Overview
      teamPerformance: {
        teamSize: departmentUsers.length,
        departmentTeam: departmentTeam
      },

      // Department Info (for context)
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