const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/config/secrets.env') });

// =====================
// Configuration
// =====================
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Safety configuration
const DRY_RUN = process.argv.includes('--dry-run'); // Add --dry-run flag for testing
const FORCE = process.argv.includes('--force'); // Add --force flag to skip confirmation

// =====================
// Static Data
// =====================

// Department IDs (from requirements)
const DEPARTMENTS = {
  SYSTEM_SOLUTIONING: "68e48ade10fbb4910a50f302",
  HR_AND_ADMIN: "68e48bcf10fbb4910a50f30f",
  FINANCE: "68e48bd910fbb4910a50f311",
  SALES: "68e48a4a10fbb4910a50f2fd",
  CONSULTANCY: "68e48ac310fbb4910a50f300",
  ENGINEERING_OPERATION: "68e48bac10fbb4910a50f30c",
  IT: "68e48be010fbb4910a50f313"
};

// Fixed users template (passwords from environment variables)
const FIXED_USERS = [
  {
    name: "director.report.test",
    email: "director.report.test@gmail.com",
    password: process.env.TEST_DIRECTOR_PASSWORD,
    role: "Director",
    department: DEPARTMENTS.SYSTEM_SOLUTIONING
  },
  {
    name: "sys.soln.staff",
    email: "sys.soln.staff@gmail.com",
    password: process.env.TEST_STAFF_PASSWORD,
    role: "Staff",
    department: DEPARTMENTS.SYSTEM_SOLUTIONING
  },
  {
    name: "sys.soln.manager",
    email: "sys.soln.manager@gmail.com",
    password: process.env.TEST_MANAGER_PASSWORD,
    role: "Manager",
    department: DEPARTMENTS.SYSTEM_SOLUTIONING
  },
  {
    name: "hr.report.test",
    email: "hr.report.test@gmail.com",
    password: process.env.TEST_HR_PASSWORD,
    role: "HR",
    department: DEPARTMENTS.HR_AND_ADMIN
  },
  {
    name: "littlefarms.inappreminder",
    email: "littlefarms.inappreminder@gmail.com",
    password: process.env.IN_APP_REM_NOTIF_TEST_PASSWORD,
    role: "Senior Manager",
    department: DEPARTMENTS.HR_AND_ADMIN
  },
  {
    name: "littlefarms.resetpw",
    email: "littlefarms.resetpw@gmail.com",
    password: process.env.FORGOTPW_TEST_PASSWORD,
    role: "Staff",
    department: DEPARTMENTS.FINANCE
  },
  {
    name: "wittle.sales.staff",
    email: "wittle.sales.staff@gmail.com",
    password: process.env.TEST_SALES_STAFF_PASSWORD,
    role: "Staff",
    department: DEPARTMENTS.SALES
  },
  {
    name: "wittle.consultancy.staff",
    email: "wittle.consultancy.staff@gmail.com",
    password: process.env.TEST_CONSULTANCY_STAFF_PASSWORD,
    role: "Staff",
    department: DEPARTMENTS.CONSULTANCY
  },
  {
    name: "wittle.engops.staff",
    email: "wittle.engops.staff@gmail.com",
    password: process.env.TEST_ENGOPS_STAFF_PASSWORD,
    role: "Staff",
    department: DEPARTMENTS.ENGINEERING_OPERATION
  },
  {
    name: "wittle.it.staff",
    email: "wittle.it.staff@gmail.com",
    password: process.env.TEST_IT_STAFF_PASSWORD,
    role: "Staff",
    department: DEPARTMENTS.IT
  }
];

// Project templates (7 projects with multiple departments)
const PROJECT_TEMPLATES = [
  {
    name: "Digital Transformation Initiative",
    description: "Company-wide digital transformation and system upgrades",
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING, DEPARTMENTS.IT],
    deadline: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
  },
  {
    name: "Customer Experience Enhancement",
    description: "Improving customer service and sales processes",
    departments: [DEPARTMENTS.SALES, DEPARTMENTS.CONSULTANCY],
    deadline: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days ago (OVERDUE)
  },
  {
    name: "Financial System Modernization",
    description: "Upgrading financial systems and reporting capabilities",
    departments: [DEPARTMENTS.FINANCE, DEPARTMENTS.IT],
    deadline: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days from now
  },
  {
    name: "HR Process Optimization",
    description: "Streamlining HR processes and employee management",
    departments: [DEPARTMENTS.HR_AND_ADMIN, DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(Date.now() + 75 * 24 * 60 * 60 * 1000), // 75 days from now
  },
  {
    name: "Operations Excellence Program",
    description: "Improving operational efficiency across all departments",
    departments: [DEPARTMENTS.ENGINEERING_OPERATION, DEPARTMENTS.CONSULTANCY, DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000), // 100 days from now
  },
  {
    name: "Technology Infrastructure Upgrade",
    description: "Upgrading IT infrastructure and security systems",
    departments: [DEPARTMENTS.IT, DEPARTMENTS.ENGINEERING_OPERATION],
    deadline: new Date(Date.now() + 80 * 24 * 60 * 60 * 1000), // 80 days from now
  },
  {
    name: "Business Intelligence Platform",
    description: "Implementing comprehensive business analytics and reporting",
    departments: [DEPARTMENTS.FINANCE, DEPARTMENTS.SALES, DEPARTMENTS.HR_AND_ADMIN],
    deadline: new Date(Date.now() + 110 * 24 * 60 * 60 * 1000), // 110 days from now
  }
];

// Global variables to store created data
let createdUsers = [];
let createdProjects = [];
let createdTasks = [];

// =====================
// Environment Variables Validation
// =====================
function validateEnvironmentVariables() {
  const requiredPasswords = [
    'TEST_DIRECTOR_PASSWORD',
    'TEST_MANAGER_PASSWORD', 
    'TEST_STAFF_PASSWORD',
    'TEST_HR_PASSWORD',
    'IN_APP_REM_NOTIF_TEST_PASSWORD',
    'FORGOTPW_TEST_PASSWORD',
    'TEST_SALES_STAFF_PASSWORD',
    'TEST_CONSULTANCY_STAFF_PASSWORD',
    'TEST_ENGOPS_STAFF_PASSWORD',
    'TEST_IT_STAFF_PASSWORD'
  ];
  
  const missing = requiredPasswords.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables in secrets.env:');
    missing.forEach(key => console.error(`   ${key}`));
    console.error('\nPlease add these passwords to backend/config/secrets.env');
    return false;
  }
  
  return true;
}

// =====================
// API Helpers
// =====================
async function verifyConnection() {
  try {
    console.log('🔍 Verifying API connection...');
    console.log(`   API Base URL: ${API_BASE_URL}`);
    
    await axios.get(`${API_BASE_URL}/users`);
    console.log('✅ API connection successful\n');
    return true;
  } catch (error) {
    console.error('❌ Cannot connect to API:', error.message);
    console.error('   Make sure your server is running at:', API_BASE_URL);
    return false;
  }
}

// =====================
// Data Cleanup Functions
// =====================
async function cleanupExistingData() {
  console.log('🧹 Cleaning up existing test data...\n');
  console.log('   ⚠️  IMPORTANT: Only deleting Users, Projects, and Tasks collections');
  console.log('   ✅ Preserving: Departments, Notifications, Attachments, Comments');
  console.log('   ✅ MongoDB Collections Preserved: attachments, comments, departments, notifications\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No data will be deleted');
    return;
  }
  
  try {
    // Delete ONLY the 3 specific collections: tasks, projects, users
    // DO NOT touch: attachments, comments, departments, notifications
    
    console.log('   Deleting tasks collection...');
    const tasksResponse = await axios.get(`${API_BASE_URL}/tasks`);
    const allTasks = tasksResponse.data || [];
    for (const task of allTasks) {
      await axios.delete(`${API_BASE_URL}/tasks/${task._id}`);
    }
    console.log(`   ✅ Deleted ${allTasks.length} tasks`);
    
    console.log('   Deleting projects collection...');
    const projectsResponse = await axios.get(`${API_BASE_URL}/projects`);
    const allProjects = projectsResponse.data || [];
    for (const project of allProjects) {
      await axios.delete(`${API_BASE_URL}/projects/${project._id}`);
    }
    console.log(`   ✅ Deleted ${allProjects.length} projects`);
    
    console.log('   Deleting users collection...');
    const usersResponse = await axios.get(`${API_BASE_URL}/users`);
    const allUsers = usersResponse.data || [];
    for (const user of allUsers) {
      await axios.delete(`${API_BASE_URL}/users/${user._id}`);
    }
    console.log(`   ✅ Deleted ${allUsers.length} users`);
    
    console.log('   ✅ MongoDB collections preserved: attachments, comments, departments, notifications');
    
  } catch (error) {
    console.log(`   ⚠️ Error during cleanup: ${error.message}`);
  }
  
  console.log('');
}

// =====================
// User Management Functions
// =====================
async function createFixedUsers() {
  console.log('👥 Creating fixed test users...\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No users will be created');
    // For dry run, use placeholder IDs
    createdUsers = FIXED_USERS.map((user, index) => ({
      ...user,
      _id: `dry-run-user-${index}`
    }));
    console.log(`   Would create ${FIXED_USERS.length} users`);
    return;
  }
  
  for (const userTemplate of FIXED_USERS) {
    try {
      // Create user with auth/register for proper password hashing
      const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
        name: userTemplate.name,
        email: userTemplate.email,
        password: userTemplate.password,
        role: userTemplate.role
      });
      
      console.log(`✅ Created user: ${userTemplate.email} (${userTemplate.role})`);
      
      const userId = registerResponse.data.user.id;
      
      // Update department separately since auth/register doesn't handle it
      if (userTemplate.department) {
        try {
          await axios.put(`${API_BASE_URL}/users/${userId}`, {
            department: userTemplate.department
          });
          console.log(`   ✅ Updated department for: ${userTemplate.email}`);
        } catch (deptErr) {
          console.log(`   ⚠️ Failed to update department for: ${userTemplate.email}`, deptErr.message);
        }
      }
      
      // Store created user data
      createdUsers.push({
        ...userTemplate,
        _id: userId
      });
      
    } catch (err) {
      console.log(`❌ Failed to create user: ${userTemplate.email}`, err.message);
      if (err.response?.data) {
        console.log('   Error details:', err.response.data);
      }
    }
  }
  
  console.log(`\n✅ Successfully created ${createdUsers.length}/${FIXED_USERS.length} users\n`);
}

// =====================
// Project Management Functions
// =====================
async function createProjects() {
  console.log('📁 Creating test projects...\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No projects will be created');
    createdProjects = PROJECT_TEMPLATES.map((project, index) => ({
      ...project,
      _id: `dry-run-project-${index}`,
      createdBy: 'dry-run-creator'
    }));
    console.log(`   Would create ${PROJECT_TEMPLATES.length} projects`);
    return;
  }
  
  // Find a user to be the creator (preferably a Director or Manager)
  const projectCreator = createdUsers.find(u => u.role === 'Director') || 
                        createdUsers.find(u => u.role === 'Manager') || 
                        createdUsers[0];
  
  if (!projectCreator) {
    console.log('❌ No users available to create projects');
    return;
  }
  
  for (const projectTemplate of PROJECT_TEMPLATES) {
    try {
      // Get team members from the project's departments
      const teamMembers = createdUsers
        .filter(user => projectTemplate.departments.includes(user.department))
        .map(user => user._id);
      
      const projectData = {
        name: projectTemplate.name,
        description: projectTemplate.description,
        department: projectTemplate.departments, // Multiple departments
        deadline: projectTemplate.deadline,
        createdBy: projectCreator._id,
        teamMembers: teamMembers
      };
      
      const response = await axios.post(`${API_BASE_URL}/projects`, projectData);
      
      console.log(`✅ Created project: ${projectTemplate.name}`);
      console.log(`   Departments: ${projectTemplate.departments.length} department(s)`);
      console.log(`   Team members: ${teamMembers.length} member(s)`);
      
      createdProjects.push({
        ...projectTemplate,
        _id: response.data._id,
        createdBy: projectCreator._id,
        teamMembers: teamMembers
      });
      
    } catch (err) {
      console.log(`❌ Failed to create project: ${projectTemplate.name}`, err.message);
      if (err.response?.data) {
        console.log('   Error details:', err.response.data);
      }
    }
  }
  
  console.log(`\n✅ Successfully created ${createdProjects.length}/${PROJECT_TEMPLATES.length} projects\n`);
}

// =====================
// Task Management Functions
// =====================
async function createTasks() {
  console.log('📋 Creating test tasks...\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No tasks will be created');
    // Calculate exact task count for dry run
    let taskCount = 0;
    PROJECT_TEMPLATES.forEach((project, projectIndex) => {
      const numTasks = (projectIndex % 3) + 1; // Fixed: 1, 2, 3, 1, 2, 3, 1 tasks per project
      taskCount += numTasks;
    });
    console.log(`   Would create exactly ${taskCount} tasks across ${PROJECT_TEMPLATES.length} projects`);
    return;
  }
  
  if (createdProjects.length === 0) {
    console.log('❌ No projects available to create tasks');
    return;
  }
  
  // Fixed task configurations for predictable testing
  const taskConfigurations = [
    // Digital Transformation Initiative - 1 task
    [
      { status: 'In Progress', priority: 8, assigneeIndex: 0 } // First team member
    ],
    // Customer Experience Enhancement - 2 tasks  
    [
      { status: 'In Progress', priority: 6, assigneeIndex: 0 },      // First team member (will be OVERDUE)
      { status: 'Done', priority: 4, assigneeIndex: 1 }       // Second team member
    ],
    // Financial System Modernization - 3 tasks
    [
      { status: 'Done', priority: 9, assigneeIndex: 0 },      // First team member
      { status: 'In Progress', priority: 7, assigneeIndex: 1 }, // Second team member  
      { status: 'To Do', priority: 3, assigneeIndex: 0 }      // First team member again
    ],
    // HR Process Optimization - 1 task
    [
      { status: 'Done', priority: 5, assigneeIndex: 0 }       // First team member
    ],
    // Operations Excellence Program - 2 tasks
    [
      { status: 'In Progress', priority: 8, assigneeIndex: 0 }, // First team member
      { status: 'Done', priority: 6, assigneeIndex: 1 }       // Second team member
    ],
    // Technology Infrastructure Upgrade - 3 tasks
    [
      { status: 'To Do', priority: 7, assigneeIndex: 0 },     // First team member
      { status: 'In Progress', priority: 9, assigneeIndex: 1 }, // Second team member
      { status: 'Done', priority: 4, assigneeIndex: 0 }       // First team member again
    ],
    // Business Intelligence Platform - 1 task
    [
      { status: 'Done', priority: 8, assigneeIndex: 0 }       // First team member
    ]
  ];
  
  for (let projectIndex = 0; projectIndex < createdProjects.length; projectIndex++) {
    const project = createdProjects[projectIndex];
    const taskConfigs = taskConfigurations[projectIndex];
    
    for (let taskIndex = 0; taskIndex < taskConfigs.length; taskIndex++) {
      const config = taskConfigs[taskIndex];
      
      try {
        // Fixed team member assignment based on configuration
        const assignedMembers = project.teamMembers.length > 0 
          ? [project.teamMembers[config.assigneeIndex % project.teamMembers.length]]
          : [];
        
        // Task creator is always the project creator for consistency
        const taskCreator = project.createdBy;
        
        // Fixed deadline calculation - tasks due progressively closer to project deadline
        const daysBeforeProjectDeadline = (taskIndex + 1) * 10; // 10, 20, 30 days before
        const taskDeadline = new Date(project.deadline.getTime() - daysBeforeProjectDeadline * 24 * 60 * 60 * 1000);
        
        const taskData = {
          title: `${project.name} - Task ${taskIndex + 1}`,
          description: `Task ${taskIndex + 1} for the ${project.name} project`,
          assignedProject: project._id,
          assignedTeamMembers: assignedMembers,
          status: config.status,
          priority: config.priority,
          deadline: taskDeadline,
          createdBy: taskCreator,
          startAt: new Date(Date.now() + (taskIndex + 1) * 24 * 60 * 60 * 1000), // Start in 1, 2, 3 days
          endAt: new Date(taskDeadline.getTime() - 24 * 60 * 60 * 1000) // End 1 day before deadline
        };
        
        const response = await axios.post(`${API_BASE_URL}/tasks`, taskData);
        
        console.log(`✅ Created task: ${taskData.title}`);
        console.log(`   Status: ${taskData.status}, Priority: ${taskData.priority}`);
        console.log(`   Assigned to: ${assignedMembers.length} member(s)`);
        
        createdTasks.push({
          ...taskData,
          _id: response.data._id
        });
        
      } catch (err) {
        console.log(`❌ Failed to create task for project: ${project.name}`, err.message);
        if (err.response?.data) {
          console.log('   Error details:', err.response.data);
        }
      }
    }
  }
  
  console.log(`\n✅ Successfully created ${createdTasks.length} tasks across ${createdProjects.length} projects\n`);
}

async function main() {
  console.log('═'.repeat(80));
  console.log('🏢 HR COMPANY-WIDE REPORT FUNCTIONAL TEST 🏢');
  console.log('═'.repeat(80));
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No data will be modified!');
    console.log('═'.repeat(80));
  }
  
  // Validate environment variables first
  console.log('🔐 Validating environment variables...');
  if (!validateEnvironmentVariables()) {
    process.exit(1);
  }
  console.log('✅ All required passwords found in secrets.env\n');
  
  console.log('📋 JIRA User Story: (SM/HR) Company-Wide Report Generation');
  console.log('\n⚠️  SAFETY NOTICE:');
  console.log('   This script will:');
  console.log('   ✅ Delete ONLY existing users, projects, and tasks');
  console.log('   ✅ Preserve departments, notifications, attachments, comments');
  console.log('   ✅ Create 10 fixed test users across 7 departments');
  console.log('   ✅ Create 7 projects with multiple departments');
  console.log('   ✅ Create 1-3 tasks per project with proper assignments');
  console.log('   🔐 All passwords loaded securely from secrets.env');
  console.log('   ⚠️  WARNING: This will reset users, projects, and tasks only!');
  console.log('\n📊 Test Data Overview:');
  console.log(`   Users: ${FIXED_USERS.length} fixed users across all departments`);
  console.log(`   Projects: ${PROJECT_TEMPLATES.length} multi-department projects`);
  console.log(`   Tasks: EXACTLY 13 tasks with fixed status/priority assignments`);
  console.log(`   Departments: ${Object.keys(DEPARTMENTS).length} departments involved`);
  console.log('   🚫 Will NOT touch: attachments, comments, departments, notifications\n');
  
  if (!DRY_RUN && !FORCE) {
    console.log('❓ Are you sure you want to proceed? This will DELETE users, projects, and tasks!');
    console.log('   Use --dry-run flag to preview changes without making them');
    console.log('   Use --force flag to skip this confirmation');
    console.log('   Press Ctrl+C to cancel or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second pause
  }
  
  const isConnected = await verifyConnection();
  if (!isConnected) process.exit(1);
  
  // Execute the data setup process
  await cleanupExistingData();
  await createFixedUsers();
  await createProjects();
  await createTasks();
  
  // Generate summary report
  console.log('═'.repeat(80));
  console.log('📊 SETUP SUMMARY');
  console.log('═'.repeat(80));
  
  if (!DRY_RUN) {
    console.log('\n✨ Company-wide report test data setup completed!');
    console.log('\n� Created Users Summary:');
    const usersByRole = {};
    createdUsers.forEach(user => {
      usersByRole[user.role] = (usersByRole[user.role] || 0) + 1;
    });
    Object.entries(usersByRole).forEach(([role, count]) => {
      console.log(`   ${role}: ${count} user(s)`);
    });
    
    console.log('\n📁 Created Projects Summary:');
    createdProjects.forEach((project, index) => {
      console.log(`   ${index + 1}. ${project.name}`);
      console.log(`      Departments: ${project.departments.length}`);
      console.log(`      Team members: ${project.teamMembers ? project.teamMembers.length : 0}`);
    });
    
    console.log('\n📋 Created Tasks Summary:');
    const tasksByStatus = {};
    createdTasks.forEach(task => {
      tasksByStatus[task.status] = (tasksByStatus[task.status] || 0) + 1;
    });
    console.log(`   Total tasks: ${createdTasks.length}`);
    Object.entries(tasksByStatus).forEach(([status, count]) => {
      console.log(`   ${status}: ${count} task(s)`);
    });
    
    console.log('\n🚀 Ready for HR Company-Wide Report Generation testing!');
    console.log('\n📝 Test Instructions:');
    console.log('   1. Login as HR user: hr.report.test@gmail.com');
    console.log('      Password: (from TEST_HR_PASSWORD in secrets.env)');
    console.log('   2. Navigate to Reports page');
    console.log('   3. Verify company-wide report shows data from all departments');
    console.log('   4. Check department performance breakdown');
    console.log('   5. Verify project performance overview');
    console.log('   6. Test PDF export functionality');
    console.log('\n🔐 All test user passwords are stored securely in secrets.env');
    
  } else {
    console.log('\n🧪 DRY RUN completed! Use the script without --dry-run to apply changes.');
    console.log('\n📋 What would be created (FIXED/PREDICTABLE):');
    console.log(`   Users: ${FIXED_USERS.length} across ${Object.keys(DEPARTMENTS).length} departments`);
    console.log(`   Projects: ${PROJECT_TEMPLATES.length} multi-department projects`);
    console.log('   Tasks: EXACTLY 13 tasks with fixed assignments:');
    console.log('     • Digital Transformation Initiative: 1 task (In Progress, Priority 8)');
    console.log('     • Customer Experience Enhancement: 2 tasks (In Progress P6 OVERDUE, Done P4)');
    console.log('     • Financial System Modernization: 3 tasks (Done P9, In Progress P7, To Do P3)');
    console.log('     • HR Process Optimization: 1 task (Done P5)');
    console.log('     • Operations Excellence Program: 2 tasks (In Progress P8, Done P6)');
    console.log('     • Technology Infrastructure Upgrade: 3 tasks (To Do P7, In Progress P9, Done P4)');
    console.log('     • Business Intelligence Platform: 1 task (Done P8)');
    console.log('\n🔒 FIXED TEST DATA - Results will be identical every run!');
    console.log('⚠️  NOTE: Customer Experience Enhancement project and Task 1 are OVERDUE for testing!');
  }
  
  console.log('\n' + '═'.repeat(80));
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    if (error.response?.data) {
      console.error('   API Error details:', error.response.data);
    }
    process.exit(1);
  });
}

module.exports = { 
  createFixedUsers, 
  createProjects, 
  createTasks, 
  cleanupExistingData,
  FIXED_USERS,
  PROJECT_TEMPLATES,
  DEPARTMENTS
};