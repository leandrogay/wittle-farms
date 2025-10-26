const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/config/secrets.env') });

// =====================
// Configuration
// =====================
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const PROJECTS_ENDPOINT = `${API_BASE_URL}/projects`;
const TASKS_ENDPOINT = `${API_BASE_URL}/tasks`;

// Safety configuration
const DRY_RUN = process.argv.includes('--dry-run'); // Add --dry-run flag for testing
const FORCE = process.argv.includes('--force'); // Add --force flag to skip confirmation

// =====================
// Static Data
// =====================

// System Solutioning Department ID from environment variables
const SYSTEM_SOLUTIONING = process.env.SYSTEM_SOLUTIONING_DEPT_ID || "68e48ade10fbb4910a50f302";

// System Solutioning users template (IDs will be fetched dynamically)
const systemSolutioningUsersTemplate = [
  {
    name: "director.report.test",
    email: "director.report.test@gmail.com",
    role: "Director",
    department: SYSTEM_SOLUTIONING,
    password: "directorReport1!"
  },
  {
    name: "sys.soln.manager",
    email: "sys.soln.manager@gmail.com",
    role: "Manager",
    department: SYSTEM_SOLUTIONING,
    password: "sysManager1!"
  },
  {
    name: "sys.soln.staff",
    email: "sys.soln.staff@gmail.com",
    role: "Staff",
    department: SYSTEM_SOLUTIONING,
    password: "sysStaff1!"
  }
];

// This will be populated with actual user data including current IDs
let systemSolutioningUsers = [];

const STATUSES = ['To Do', 'In Progress', 'Done'];
const PRIORITIES = ['Low', 'Medium', 'High'];
const DEFAULT_REMINDERS = [10080, 4320, 1440]; // 7d, 3d, 1d

const availableFiles = [
  'bug_report.txt',
  'meeting_notes.md',
  'requirements.txt',
  'design_mockup.json',
  'code_review.md'
];

// =====================
// Project Templates (2 projects for easier testing)
// =====================
const projectTemplates = [
  {
    name: "Cloud Migration Initiative",
    description: "Migrate legacy systems to cloud infrastructure with focus on performance and security.",
    departments: [SYSTEM_SOLUTIONING],
    deadlineOffset: 5, // 5 days from now (future)
    teamSize: 3 // All team members
  },
  {
    name: "Automation Overhaul", 
    description: "Implement automated workflows to reduce manual processes and improve efficiency.",
    departments: [SYSTEM_SOLUTIONING],
    deadlineOffset: -3, // 3 days ago (overdue)
    teamSize: 2 // Manager and Staff
  }
];

// =====================
// Task Templates (8 tasks total with proper assignments)
// =====================
const taskTemplates = [
  // Cloud Migration Initiative tasks (4 tasks)
  { title: "Cloud Infrastructure Setup", description: "Provision AWS resources and configure networking.", notes: "Director leading setup", projectIndex: 0, assignedTo: [0] }, // Director
  { title: "Data Migration Planning", description: "Plan database migration strategy.", notes: "Manager coordinating", projectIndex: 0, assignedTo: [1] }, // Manager
  { title: "Security Configuration", description: "Implement cloud security policies.", notes: "Staff implementing", projectIndex: 0, assignedTo: [2] }, // Staff
  { title: "Go-Live Planning", description: "Coordinate final cutover to cloud.", notes: "All hands on deck", projectIndex: 0, assignedTo: [0, 1, 2] }, // All team members
  
  // Automation Overhaul tasks (4 tasks)
  { title: "Process Analysis", description: "Analyze current manual processes.", notes: "Manager analyzing", projectIndex: 1, assignedTo: [1] }, // Manager
  { title: "Script Development", description: "Develop automation scripts and tools.", notes: "Staff coding", projectIndex: 1, assignedTo: [2] }, // Staff
  { title: "User Training", description: "Train staff on new automated processes.", notes: "Director and Manager training", projectIndex: 1, assignedTo: [0, 1] }, // Director + Manager
  { title: "Production Deployment", description: "Deploy automation to production.", notes: "All team coordinating", projectIndex: 1, assignedTo: [0, 1, 2] } // All team members
];

// =====================
// Strategic Task Status Distribution (8 tasks total)
// =====================
const taskStatusDistribution = [
  // Cloud Migration Initiative (Future deadline) - ALL COMPLETED for productivity trend
  'Done',         // Cloud Infrastructure Setup (Director) - completed
  'Done',         // Data Migration Planning (Manager) - completed
  'Done',         // Security Configuration (Staff) - completed
  'Done',         // Go-Live Planning (All) - completed
  
  // Automation Overhaul (Overdue deadline) - MIXED STATUS for overdue scenarios
  'Done',         // Process Analysis (Manager)
  'In Progress',  // Script Development (Staff)
  'To Do',        // User Training (Director + Manager) - overdue
  'To Do'         // Production Deployment (All) - overdue
];

// =====================
// Deadline offsets for specific overdue scenarios (8 tasks)
// =====================
const taskDeadlineOffsets = [
  // Cloud Migration Initiative (all completed) - past deadlines but all done
  -5,   // Cloud Infrastructure Setup (completed, was due 5 days ago)
  -7,   // Data Migration Planning (completed, was due 7 days ago)
  -3,   // Security Configuration (completed, was due 3 days ago)
  -1,   // Go-Live Planning (completed, was due 1 day ago)
  
  // Automation Overhaul (mixed status) - overdue scenarios for incomplete tasks
  -10,  // Process Analysis (completed, was overdue by 10 days)
  -5,   // Script Development (overdue by 5 days, still in progress)
  -2,   // User Training (overdue by 2 days, not started)
  -1    // Production Deployment (overdue by 1 day, not started)
];

// =====================
// Deterministic Helpers
// =====================
function getDeterministicDeadline(offsetDays) {
  const now = new Date();
  return new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000).toISOString();
}

function pick(array, index) {
  return array[index % array.length];
}

function getDeterministicTeamMembers(index, teamSize) {
  const teamMembers = systemSolutioningUsers.map(u => u._id);
  const startIndex = index % teamMembers.length;
  const selected = [];
  for (let i = 0; i < teamSize; i++) {
    const memberIndex = (startIndex + i) % teamMembers.length;
    selected.push(teamMembers[memberIndex]);
  }
  return selected;
}

function getDeterministicReminders(index) {
  return DEFAULT_REMINDERS;
}

function getDeterministicAttachments(index) {
  const numFiles = (index % 3) + 1; // 1-3 files
  return availableFiles.slice(0, numFiles).map(createFileFromPath);
}

// =====================
// File Helpers
// =====================
function createFileFromPath(filename) {
  const filePath = path.join(__dirname, 'dummy-files', filename);
  try {
    const buffer = fs.readFileSync(filePath);
    return {
      filename,
      buffer,
      mimetype: getContentType(filename),
      originalname: filename,
      size: buffer.length
    };
  } catch (error) {
    const content = getDummyContent(filename);
    const buffer = Buffer.from(content, 'utf-8');
    return {
      filename,
      buffer,
      mimetype: getContentType(filename),
      originalname: filename,
      size: buffer.length
    };
  }
}

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.pdf': 'application/pdf'
  };
  return types[ext] || 'application/octet-stream';
}

function getDummyContent(filename) {
  const contents = {
    'bug_report.txt': 'Bug Report: Cloud migration issue.',
    'meeting_notes.md': '# Meeting Notes\nDiscussed automation overhaul.',
    'requirements.txt': 'Requirements: Cloud, Automation, Performance',
    'design_mockup.json': '{"design": "optimized"}',
    'code_review.md': '# Code Review\nAll tasks reviewed.'
  };
  return contents[filename] || `Dummy content for ${filename}`;
}

// =====================
// API Helpers
// =====================
async function clearExistingData() {
  console.log('🗑️  Clearing existing System Solutioning data...\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No data will be deleted');
  }
  
  try {
    // Get all projects and filter to only System Solutioning department projects
    const allProjects = await axios.get(PROJECTS_ENDPOINT);
    const systemSolutioningProjects = allProjects.data.filter(project => {
      return project.department && 
             Array.isArray(project.department) && 
             project.department.some(d => String(d._id) === String(SYSTEM_SOLUTIONING));
    });
    
    // Get project IDs for task filtering
    const systemSolutioningProjectIds = systemSolutioningProjects.map(p => String(p._id));
    
    // Get all tasks and filter to only tasks on System Solutioning projects
    const allTasks = await axios.get(TASKS_ENDPOINT);
    const systemSolutioningTasks = allTasks.data.filter(task => {
      const projectId = task.assignedProject ? 
        (typeof task.assignedProject === 'object' ? task.assignedProject._id : task.assignedProject) 
        : null;
      return projectId && systemSolutioningProjectIds.includes(String(projectId));
    });
    
    if (DRY_RUN) {
      console.log(`🧪 WOULD DELETE ${systemSolutioningTasks.length} tasks on System Solutioning projects:`);
      systemSolutioningTasks.forEach(task => console.log(`   - ${task.title} (${task._id})`));
      console.log(`🧪 WOULD DELETE ${systemSolutioningProjects.length} System Solutioning projects:`);
      systemSolutioningProjects.forEach(project => console.log(`   - ${project.name} (${project._id})`));
    } else {
      // Delete tasks on System Solutioning projects
      for (const task of systemSolutioningTasks) {
        await axios.delete(`${TASKS_ENDPOINT}/${task._id}`);
      }
      console.log(`✅ Cleared ${systemSolutioningTasks.length} tasks on System Solutioning projects`);
      
      // Delete System Solutioning projects
      for (const project of systemSolutioningProjects) {
        await axios.delete(`${PROJECTS_ENDPOINT}/${project._id}`);
      }
      console.log(`✅ Cleared ${systemSolutioningProjects.length} System Solutioning projects`);
    }
  } catch (error) {
    console.log('ℹ️  No existing data to clear or error accessing data:', error.message);
  }
  
  console.log('');
}

async function createProject(projectData) {
  // Ensure ObjectIds are properly formatted
  const formattedData = {
    ...projectData,
    department: Array.isArray(projectData.department) 
      ? projectData.department.map(d => String(d))
      : [String(projectData.department)],
    createdBy: String(projectData.createdBy),
    teamMembers: projectData.teamMembers.map(id => String(id))
  };
  
  const response = await axios.post(PROJECTS_ENDPOINT, formattedData, {
    headers: { 'Content-Type': 'application/json' }
  });
  return response.data;
}

async function createTask(taskData) {
  // Check if task has attachments that require FormData
  if (taskData.attachments && taskData.attachments.length > 0) {
    // Use FormData for tasks with attachments
    const formData = new FormData();
    
    // Handle special fields that need proper formatting
    const formattedData = {
      ...taskData,
      assignedProject: String(taskData.assignedProject),
      assignedTeamMembers: taskData.assignedTeamMembers.map(id => String(id)),
      createdBy: String(taskData.createdBy)
    };
    
    Object.keys(formattedData).forEach(key => {
      if (key !== 'attachments') {
        const val = formattedData[key];
        if (Array.isArray(val)) {
          val.forEach(item => formData.append(key, item));
        } else {
          formData.append(key, val);
        }
      }
    });
    
    taskData.attachments.forEach(file => {
      formData.append('attachments', file.buffer, {
        filename: file.filename,
        contentType: file.mimetype
      });
    });
    
    const response = await axios.post(TASKS_ENDPOINT, formData, {
      headers: formData.getHeaders()
    });
    return response.data;
  } else {
    // Use JSON for tasks without attachments (more reliable for arrays)
    const jsonData = {
      ...taskData,
      assignedProject: String(taskData.assignedProject),
      assignedTeamMembers: taskData.assignedTeamMembers.map(id => String(id)),
      createdBy: String(taskData.createdBy)
    };
    delete jsonData.attachments; // Remove empty attachments array
    
    const response = await axios.post(TASKS_ENDPOINT, jsonData, {
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data;
  }
}


// Ensure users exist in DB
async function ensureUsersExist() {
  console.log('👥 Managing System Solutioning department users...\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No users will be modified');
  }
  
  // ONLY delete users within System Solutioning department that aren't in our list
  try {
    const res = await axios.get(`${API_BASE_URL}/users`);
    const allUsers = res.data || [];
    
    // Filter to only System Solutioning users
    const systemSolutioningExistingUsers = allUsers.filter(user => 
      String(user.department) === String(SYSTEM_SOLUTIONING)
    );
    
    const allowedEmails = systemSolutioningUsersTemplate.map(u => u.email);
    const usersToDelete = systemSolutioningExistingUsers.filter(user => 
      !allowedEmails.includes(user.email)
    );
    
    if (DRY_RUN) {
      console.log(`🧪 WOULD DELETE ${usersToDelete.length} extra System Solutioning users:`);
      usersToDelete.forEach(user => console.log(`   - ${user.email} (${user._id})`));
    } else {
      for (const user of usersToDelete) {
        await axios.delete(`${API_BASE_URL}/users/${user._id}`);
        console.log(`🗑️ Deleted extra System Solutioning user: ${user.email}`);
      }
    }
    
    console.log(`✅ System Solutioning department check complete (${systemSolutioningExistingUsers.length} users checked)`);
  } catch (err) {
    console.log('⚠️ Error checking System Solutioning users:', err.message);
  }
  
  // Ensure our required users exist and populate systemSolutioningUsers with actual data
  systemSolutioningUsers = []; // Clear the array
  
  for (const userTemplate of systemSolutioningUsersTemplate) {
    try {
      const res = await axios.get(`${API_BASE_URL}/users`);
      const existingUser = res.data?.find(u => u.email === userTemplate.email);
      
      if (existingUser) {
        console.log(`✅ User exists: ${userTemplate.email}`);
        // Add to systemSolutioningUsers with actual ID from database
        systemSolutioningUsers.push({
          ...userTemplate,
          _id: existingUser._id
        });
        
        if (!DRY_RUN) {
          // Update only department field to avoid password hashing issues
          try {
            await axios.put(`${API_BASE_URL}/users/${existingUser._id}`, {
              department: userTemplate.department
            });
            console.log(`✅ Updated user: ${userTemplate.email}`);
          } catch (updateErr) {
            console.log(`⚠️ Failed to update user: ${userTemplate.email}`);
          }
        }
      } else {
        // User doesn't exist, create them using auth/register to ensure password hashing
        if (DRY_RUN) {
          console.log(`🧪 WOULD CREATE user: ${userTemplate.email}`);
          // For dry run, use a placeholder ID
          systemSolutioningUsers.push({
            ...userTemplate,
            _id: "dry-run-placeholder-id"
          });
        } else {
          try {
            // Create user with auth/register for proper password hashing
            const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
              name: userTemplate.name,
              email: userTemplate.email,
              password: userTemplate.password,
              role: userTemplate.role
            });
            console.log(`✅ Created user: ${userTemplate.email}`);
            
            const userId = registerResponse.data.user.id; // Note: register returns 'id', not '_id'
            
            // Add to systemSolutioningUsers with actual ID from creation
            systemSolutioningUsers.push({
              ...userTemplate,
              _id: userId
            });
            
            // Update department separately since auth/register doesn't handle it
            if (userTemplate.department) {
              try {
                await axios.put(`${API_BASE_URL}/users/${userId}`, {
                  department: userTemplate.department
                });
                console.log(`✅ Updated department for user: ${userTemplate.email}`);
              } catch (deptErr) {
                console.log(`⚠️ Failed to update department for user: ${userTemplate.email}`, deptErr.message);
              }
            }
          } catch (err) {
            console.log(`❌ Failed to create user: ${userTemplate.email}`, err.message);
          }
        }
      }
    } catch (error) {
      console.log(`❌ Error processing user: ${user.email}`, error.message);
    }
  }
  
  console.log('');
}

// Main Generation
async function generateDirectorProjectsAndTasks() {
  console.log('🚀 Starting System Solutioning director project/task generation...\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - Projects and tasks will NOT be created\n');
    return;
  }
  
  const now = new Date();
  const createdProjects = [];
  let totalTasks = 0;
  let taskIndex = 0;

  // Create projects with strategic timing
  for (let i = 0; i < projectTemplates.length; i++) {
    const template = projectTemplates[i];
    try {
      const projectData = {
        name: template.name,
        description: template.description,
        department: template.departments, // Already an array
        deadline: getDeterministicDeadline(template.deadlineOffset),
        createdBy: systemSolutioningUsers[0]._id, // director
        teamMembers: getDeterministicTeamMembers(i, template.teamSize)
      };
      
      const project = await createProject(projectData);
      createdProjects.push(project);
      console.log(`✅ Created project: "${project.name}" (deadline: ${template.deadlineOffset > 0 ? 'future' : 'overdue'})`);
      await new Promise(r => setTimeout(r, 50));
    } catch (error) {
      console.log(`❌ Failed: "${template.name}"`, error.message);
    }
  }

  // Create tasks with strategic distribution for comprehensive metrics
  for (let i = 0; i < taskTemplates.length; i++) {
    const taskTemplate = taskTemplates[i];
    const projectIndex = taskTemplate.projectIndex;
    const project = createdProjects[projectIndex];
    
    if (!project) {
      console.log(`⚠️ Skipping task "${taskTemplate.title}" - project not created`);
      continue;
    }

    try {
      // Calculate strategic dates for metrics testing
      const taskCreatedDate = new Date(now.getTime() - (Math.random() * 30 + 5) * 24 * 60 * 60 * 1000); // 5-35 days ago
      const taskDeadline = getDeterministicDeadline(taskDeadlineOffsets[i]);

      // Use predefined task assignments for proper team performance metrics
      let assignedMembers;
      if (taskTemplate.assignedTo && taskTemplate.assignedTo.length > 0) {
        // Map assignedTo indices to actual user IDs
        assignedMembers = taskTemplate.assignedTo.map(index => systemSolutioningUsers[index]._id);
        console.log(`    📝 Task "${taskTemplate.title}" assigned to ${taskTemplate.assignedTo.length} users: ${assignedMembers.join(', ')}`);
      } else {
        // Fallback to strategic team assignment (rotate through team members)
        const teamMemberCount = (i % 3) + 1; // 1-3 team members per task
        assignedMembers = getDeterministicTeamMembers(i, teamMemberCount);
        console.log(`    📝 Task "${taskTemplate.title}" using fallback assignment: ${assignedMembers.length} users`);
      }

      const taskData = {
        title: taskTemplate.title,
        description: taskTemplate.description,
        notes: taskTemplate.notes,
        assignedProject: project._id,
        assignedTeamMembers: assignedMembers,
        status: taskStatusDistribution[i],
        priority: pick(PRIORITIES, i),
        deadline: taskDeadline,
        createdBy: systemSolutioningUsers[0]._id, // director creates all tasks
        reminderOffsets: getDeterministicReminders(i),
        attachments: getDeterministicAttachments(i),
        createdAt: taskCreatedDate.toISOString()
      };

      const createdTask = await createTask(taskData);
      
      // For Done tasks, ensure completedAt is set by updating status
      if (taskData.status === 'Done') {
        try {
          // Trigger automatic completedAt setting by updating to Done status
          await axios.put(`${TASKS_ENDPOINT}/${createdTask._id}`, { status: 'Done' });
          console.log(`    ✅ Set completion timestamp for "${taskTemplate.title}"`);
        } catch (updateError) {
          console.log(`    ⚠️ Could not trigger completion timestamp for "${taskTemplate.title}"`);
        }
      }

      totalTasks++;
      const statusIcon = taskStatusDistribution[i] === 'Done' ? '✅' : 
                        taskStatusDistribution[i] === 'In Progress' ? '🔄' : 
                        taskDeadlineOffsets[i] < 0 ? '⚠️' : '📝';
      
      console.log(`  ${statusIcon} Created task: "${taskData.title}" (${taskData.status}${taskDeadlineOffsets[i] < 0 ? ', overdue' : ''})`);
      await new Promise(r => setTimeout(r, 50));
    } catch (error) {
      console.log(`  ❌ Failed task: "${taskTemplate.title}"`, error.message);
    }
  }

  console.log('\n📊 Director Metrics Summary:');
  console.log(`   Projects: ${createdProjects.length} (1 completed, 1 overdue)`);
  console.log(`   Tasks: ${totalTasks} (${taskStatusDistribution.filter(s => s === 'Done').length} done, ${taskStatusDistribution.filter(s => s === 'In Progress').length} in progress, ${taskStatusDistribution.filter(s => s === 'To Do').length} to do)`);
  console.log(`   Overdue tasks: ${taskDeadlineOffsets.filter((offset, i) => offset < 0 && taskStatusDistribution[i] !== 'Done').length}`);
  console.log(`   Team members: ${systemSolutioningUsers.length} (Director, Manager, Staff)`);
  console.log(`   Completed projects: Cloud Migration Initiative (for productivity trend testing)`);
  
  console.log('\n🎉 Generation completed for System Solutioning director testing!');
  console.log('   Ready for director report metrics validation.');
}

async function verifyConnection() {
  try {
    console.log('🔍 Verifying API connection...');
    console.log(`   API Base URL: ${API_BASE_URL}`);
    console.log(`   Department ID: ${SYSTEM_SOLUTIONING}`);
    
    await axios.get(PROJECTS_ENDPOINT);
    await axios.get(TASKS_ENDPOINT);
    console.log('✅ API connection successful\n');
    return true;
  } catch (error) {
    console.error('❌ Cannot connect to API:', error.message);
    console.error('   Make sure your server is running at:', API_BASE_URL);
    return false;
  }
}


async function main() {
  console.log('═'.repeat(80));
  console.log('🎭 SYSTEM SOLUTIONING DIRECTOR SEEDER 🎭');
  console.log('═'.repeat(80));
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No data will be modified!');
    console.log('═'.repeat(80));
  }
  
  console.log('\n⚠️  SAFETY NOTICE:');
  console.log('   This script will ONLY affect System Solutioning department data');
  console.log('   Department ID:', SYSTEM_SOLUTIONING);
  console.log('   Users managed:', systemSolutioningUsers.map(u => u.email).join(', '));
  console.log('   Projects/tasks from other departments will NOT be touched\n');
  
  if (!DRY_RUN && !FORCE) {
    console.log('❓ Are you sure you want to proceed? (Press Ctrl+C to cancel)');
    console.log('   Use --dry-run flag to preview changes without making them');
    console.log('   Use --force flag to skip this confirmation');
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second pause
  }
  
  const isConnected = await verifyConnection();
  if (!isConnected) process.exit(1);
  
  await ensureUsersExist();
  await clearExistingData();
  
  if (!DRY_RUN) {
    await generateDirectorProjectsAndTasks();
    console.log('\n✨ All done! Your System Solutioning department is ready for testing.\n');
  } else {
    console.log('\n🧪 DRY RUN completed! Use the script without --dry-run to apply changes.\n');
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { generateDirectorProjectsAndTasks, clearExistingData };