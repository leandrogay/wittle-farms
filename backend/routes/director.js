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
    
    // Use ALL tasks from department projects (not just those assigned to dept members)
    // This gives complete visibility into all work happening on department projects
    const departmentProjectTasks = departmentTasks;
    
    // For time metrics, still focus on tasks completed by department members
    const departmentMemberIds = departmentUsers.map(user => String(user._id));
    const departmentMemberCompletedTasks = departmentTasks.filter(t => 
      t.status === 'Done' && 
      t.assignedTeamMembers.some(member => 
        departmentMemberIds.includes(String(member._id))
      )
    );
    
    // Average task completion time (only for completed tasks with both createdAt and completedAt)
    const tasksWithCompletionTime = departmentMemberCompletedTasks.filter(t => t.createdAt && t.completedAt);
    const avgTaskCompletionDays = tasksWithCompletionTime.length > 0
      ? tasksWithCompletionTime.reduce((acc, task) => {
          const days = dayjs(task.completedAt).diff(dayjs(task.createdAt), 'day');
          return acc + days;
        }, 0) / tasksWithCompletionTime.length
      : 0;

    // Average project completion time (for completed projects)
    const completedProjects = departmentProjects.filter(p => {
      const projectTasks = departmentProjectTasks.filter(t => String(t.assignedProject._id) === String(p._id));
      return projectTasks.length > 0 && projectTasks.every(t => t.status === 'Done');
    });

    const avgProjectCompletionDays = completedProjects.length > 0
      ? completedProjects.reduce((acc, project) => {
          const projectTasks = departmentProjectTasks.filter(t => String(t.assignedProject._id) === String(project._id));
          if (projectTasks.length === 0) return acc;
          
          // Filter tasks that have valid completedAt dates
          const tasksWithCompletedAt = projectTasks.filter(t => t.completedAt);
          if (tasksWithCompletedAt.length === 0) {
            // Fallback: use current date if no completedAt dates available
            const projectStart = dayjs(project.createdAt);
            const projectEnd = dayjs(); // use current date as approximation
            return acc + projectEnd.diff(projectStart, 'day');
          }
          
          const projectStart = dayjs(project.createdAt);
          const projectEnd = dayjs(Math.max(...tasksWithCompletedAt.map(t => new Date(t.completedAt))));
          const days = projectEnd.diff(projectStart, 'day');
          return acc + (days >= 0 ? days : 0); // ensure non-negative
        }, 0) / completedProjects.length
      : 0;

    // WHO WAS INVOLVED - Enhanced Team Performance
    const departmentTeam = departmentUsers.map(user => {
      const userTasks = departmentProjectTasks.filter(t => 
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
    
    departmentProjectTasks.forEach(task => {
      let status = task.status;
      
      // Check if task is overdue (past deadline and not completed)
      if (task.deadline && task.status !== 'Done' && now.isAfter(dayjs(task.deadline), 'day')) {
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

    // OVERDUE STATUS - Enhanced with detailed breakdown (all department project tasks)
    const overdueTasks = departmentProjectTasks.filter(t => {
      if (!t.deadline || t.status === 'Done') return false;
      if (!now.isAfter(dayjs(t.deadline), 'day')) return false;
      return true;
    });

    const overdueCount = overdueTasks.length;
    const totalTasks = departmentProjectTasks.length;
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

      const projectTasks = departmentProjectTasks.filter(t => String(t.assignedProject._id) === String(project._id));
      
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

    // PRODUCTIVITY TRENDS (simplified for functional testing)
    // Show current project completion rate and trend
    // Use existing totalProjects variable (already defined above)
    const completedProjectsCount = departmentProjects.filter(project => {
      const projectTasks = departmentProjectTasks.filter(t => String(t.assignedProject._id) === String(project._id));
      return projectTasks.length > 0 && projectTasks.every(t => t.status === 'Done');
    }).length;
    
    const currentCompletionRate = totalProjects > 0 ? (completedProjectsCount / totalProjects) * 100 : 0;
    
    // For functional testing, show simple current vs baseline comparison
    let productivityTrend = 'Stable';
    let projectCompletionRateThisMonth = currentCompletionRate;
    let projectCompletionRateLastMonth = 0; // Baseline comparison
    
    if (currentCompletionRate >= 50) {
      productivityTrend = 'Improving';
    } else if (currentCompletionRate > 0) {
      productivityTrend = 'Stable';
    }
    
    console.log(`DEBUG: ${completedProjectsCount}/${totalProjects} projects completed (${currentCompletionRate.toFixed(1)}%)`);
    console.log(`Trend: ${productivityTrend} (${projectCompletionRateThisMonth.toFixed(1)}% vs ${projectCompletionRateLastMonth.toFixed(1)}%)`);
    
    // Projects created this month and last month for rate calculation
    const thisMonthTotalProjects = departmentProjects.filter(p => 
      dayjs(p.createdAt).isAfter(dayjs().startOf('month'))
    ).length;
    
    const lastMonthTotalProjects = departmentProjects.filter(p => 
      dayjs(p.createdAt).isBetween(dayjs().subtract(1, 'month').startOf('month'), dayjs().startOf('month'))
    ).length;

    // Step 5: Return structured response matching our planned metrics
    const reportData = {
      // Time Performance Metrics
      avgTaskCompletionDays: Number(isNaN(avgTaskCompletionDays) ? 0 : avgTaskCompletionDays.toFixed(1)),
      avgProjectCompletionDays: Number(isNaN(avgProjectCompletionDays) ? 0 : avgProjectCompletionDays.toFixed(1)),
      productivityTrend,
      completionRateThisMonth: Number(projectCompletionRateThisMonth.toFixed(1)),
      completionRateLastMonth: Number(projectCompletionRateLastMonth.toFixed(1)),

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