const axios = require('axios');
require('dotenv').config({ path: require('path').join(__dirname, '../../backend/config/secrets.env') });

// =====================
// Configuration
// =====================
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';
const PROJECTS_ENDPOINT = `${API_BASE_URL}/projects`;
const TASKS_ENDPOINT = `${API_BASE_URL}/tasks`;
const USERS_ENDPOINT = `${API_BASE_URL}/users`;

// System Solutioning Department ID from environment variables
const SYSTEM_SOLUTIONING = process.env.SYSTEM_SOLUTIONING_DEPT_ID || "68e48ade10fbb4910a50f302";

// Director user to preserve
const DIRECTOR_USER = {
  name: "director.report.test",
  email: "director.report.test@gmail.com",
  role: "Director",
  department: SYSTEM_SOLUTIONING,
  password: process.env.TEST_DIRECTOR_PASSWORD
};

// =====================
// Helper Functions
// =====================
async function verifyConnection() {
  try {
    console.log('🔍 Verifying API connection...');
    console.log(`   API Base URL: ${API_BASE_URL}`);
    console.log(`   Department ID: ${SYSTEM_SOLUTIONING}`);
    
    await axios.get(PROJECTS_ENDPOINT);
    await axios.get(TASKS_ENDPOINT);
    await axios.get(USERS_ENDPOINT);
    console.log('✅ API connection successful\n');
    return true;
  } catch (error) {
    console.error('❌ Cannot connect to API:', error.message);
    console.error('   Make sure your server is running at:', API_BASE_URL);
    return false;
  }
}

async function cleanAllData() {
  console.log('🗑️  Starting conservative cleanup for Director report "no data" testing...\n');
  
  try {
    // 1. Get and delete all tasks from System Solutioning projects
    console.log('📋 Cleaning tasks from System Solutioning projects...');
    const allProjects = await axios.get(PROJECTS_ENDPOINT);
    const systemSolutioningProjects = allProjects.data.filter(project => {
      return project.department && 
             Array.isArray(project.department) && 
             project.department.some(d => String(d._id) === String(SYSTEM_SOLUTIONING));
    });
    
    const systemSolutioningProjectIds = systemSolutioningProjects.map(p => String(p._id));
    
    const allTasks = await axios.get(TASKS_ENDPOINT);
    const systemSolutioningTasks = allTasks.data.filter(task => {
      const projectId = task.assignedProject ? 
        (typeof task.assignedProject === 'object' ? task.assignedProject._id : task.assignedProject) 
        : null;
      return projectId && systemSolutioningProjectIds.includes(String(projectId));
    });
    
    // Delete System Solutioning tasks
    for (const task of systemSolutioningTasks) {
      await axios.delete(`${TASKS_ENDPOINT}/${task._id}`);
    }
    console.log(`   ✅ Deleted ${systemSolutioningTasks.length} tasks from System Solutioning projects`);
    
    // 2. Delete System Solutioning projects
    console.log('📁 Cleaning System Solutioning projects...');
    for (const project of systemSolutioningProjects) {
      await axios.delete(`${PROJECTS_ENDPOINT}/${project._id}`);
    }
    console.log(`   ✅ Deleted ${systemSolutioningProjects.length} System Solutioning projects`);
    
    // 3. Clean up System Solutioning users (keep only director)
    console.log('👥 Cleaning System Solutioning users (preserving director)...');
    const allUsers = await axios.get(USERS_ENDPOINT);
    const systemSolutioningUsers = allUsers.data.filter(user => {
      if (!user.department) return false;
      // Handle both object and string department formats
      const deptId = typeof user.department === 'object' ? user.department._id : user.department;
      return String(deptId) === String(SYSTEM_SOLUTIONING);
    });
    
    const usersToDelete = systemSolutioningUsers.filter(user => 
      user.email !== DIRECTOR_USER.email
    );
    
    for (const user of usersToDelete) {
      await axios.delete(`${USERS_ENDPOINT}/${user._id}`);
    }
    console.log(`   ✅ Deleted ${usersToDelete.length} non-director users from System Solutioning`);
    
    console.log('\n📊 Cleanup Summary:');
    console.log(`   - Tasks deleted: ${systemSolutioningTasks.length}`);
    console.log(`   - Projects deleted: ${systemSolutioningProjects.length}`);
    console.log(`   - Users deleted: ${usersToDelete.length}`);
    console.log(`   - Users preserved: 1 (director)`);
    console.log(`   - Departments: Untouched`);
    console.log(`   - Other data: Untouched (attachments, notifications, comments, etc.)`);
    
  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    throw error;
  }
}

async function ensureDirectorExists() {
  console.log('👤 Ensuring director user exists...');
  
  try {
    const allUsers = await axios.get(USERS_ENDPOINT);
    const existingDirector = allUsers.data.find(user => user.email === DIRECTOR_USER.email);
    
    if (existingDirector) {
      console.log(`   ✅ Director user already exists: ${DIRECTOR_USER.email}`);
      
      // Update department to ensure it's correct
      try {
        await axios.put(`${USERS_ENDPOINT}/${existingDirector._id}`, {
          department: DIRECTOR_USER.department
        });
        console.log(`   ✅ Updated director department assignment`);
      } catch (updateErr) {
        console.log(`   ⚠️ Could not update director department: ${updateErr.message}`);
      }
    } else {
      console.log(`   📝 Creating director user: ${DIRECTOR_USER.email}`);
      
      // Create director using auth/register for proper password hashing
      const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
        name: DIRECTOR_USER.name,
        email: DIRECTOR_USER.email,
        password: DIRECTOR_USER.password,
        role: DIRECTOR_USER.role
      });
      
      const userId = registerResponse.data.user.id;
      console.log(`   ✅ Created director user: ${DIRECTOR_USER.email}`);
      
      // Update department separately
      try {
        await axios.put(`${USERS_ENDPOINT}/${userId}`, {
          department: DIRECTOR_USER.department
        });
        console.log(`   ✅ Assigned director to System Solutioning department`);
      } catch (deptErr) {
        console.log(`   ⚠️ Could not assign department: ${deptErr.message}`);
      }
    }
  } catch (error) {
    console.error('❌ Error managing director user:', error.message);
    throw error;
  }
}

async function validateNoDataState() {
  console.log('\n🔍 Validating "no data" state for Director report...');
  
  try {
    // Check projects
    const allProjects = await axios.get(PROJECTS_ENDPOINT);
    const systemSolutioningProjects = allProjects.data.filter(project => {
      return project.department && 
             Array.isArray(project.department) && 
             project.department.some(d => String(d._id) === String(SYSTEM_SOLUTIONING));
    });
    
    // Check tasks
    const allTasks = await axios.get(TASKS_ENDPOINT);
    const systemSolutioningProjectIds = systemSolutioningProjects.map(p => String(p._id));
    const systemSolutioningTasks = allTasks.data.filter(task => {
      const projectId = task.assignedProject ? 
        (typeof task.assignedProject === 'object' ? task.assignedProject._id : task.assignedProject) 
        : null;
      return projectId && systemSolutioningProjectIds.includes(String(projectId));
    });
    
    // Check users
    const allUsers = await axios.get(USERS_ENDPOINT);
    const systemSolutioningUsers = allUsers.data.filter(user => {
      if (!user.department) return false;
      // Handle both object and string department formats
      const deptId = typeof user.department === 'object' ? user.department._id : user.department;
      return String(deptId) === String(SYSTEM_SOLUTIONING);
    });
    
    console.log('\n📊 "No Data" State Validation:');
    console.log(`   ✅ System Solutioning Projects: ${systemSolutioningProjects.length} (should be 0)`);
    console.log(`   ✅ System Solutioning Tasks: ${systemSolutioningTasks.length} (should be 0)`);
    console.log(`   ✅ System Solutioning Users: ${systemSolutioningUsers.length} (should be 1 - director only)`);
    
    if (systemSolutioningUsers.length === 1) {
      const directorUser = systemSolutioningUsers[0];
      console.log(`   ✅ Director preserved: ${directorUser.email} (${directorUser.role})`);
    }
    
    const isValid = systemSolutioningProjects.length === 0 && 
                   systemSolutioningTasks.length === 0 && 
                   systemSolutioningUsers.length === 1;
    
    if (isValid) {
      console.log('\n🎉 Perfect! Director report "no data" test environment is ready.');
      console.log('   You can now test the Director report UI with empty data scenarios.');
    } else {
      console.log('\n⚠️ Validation failed - some data may still exist.');
    }
    
    return isValid;
  } catch (error) {
    console.error('❌ Error during validation:', error.message);
    return false;
  }
}

// =====================
// Main Function
// =====================
async function main() {
  console.log('═'.repeat(80));
  console.log('🎭 DIRECTOR REPORT "NO DATA" TEST SETUP 🎭');
  console.log('═'.repeat(80));
  console.log('\n📝 Purpose: Create empty data environment for Director report functional testing');
  console.log('🎯 Target: System Solutioning department only');
  console.log('🛡️  Safety: Preserves all other departments and data types\n');
  
  console.log('⚠️  SAFETY NOTICE:');
  console.log('   This script will ONLY affect System Solutioning department data');
  console.log('   ✅ Will preserve: Departments, attachments, notifications, comments');
  console.log('   ✅ Will preserve: All data from other departments');
  console.log(`   🗑️  Will delete: System Solutioning projects and tasks`);
  console.log(`   🗑️  Will delete: System Solutioning users (except director)`);
  console.log(`   👤 Will preserve: Director user (${DIRECTOR_USER.email})\n`);
  
  console.log('❓ Proceeding in 3 seconds... (Press Ctrl+C to cancel)');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const isConnected = await verifyConnection();
  if (!isConnected) {
    process.exit(1);
  }
  
  try {
    await cleanAllData();
    await ensureDirectorExists();
    const isValid = await validateNoDataState();
    
    if (isValid) {
      console.log('\n✨ Setup complete! Your Director report "no data" test environment is ready.');
      console.log('\n📋 Next steps:');
      console.log('   1. Login as director: director.report.test@gmail.com');
      console.log('   2. Navigate to Reports > Director Report');
      console.log('   3. Test "no data" scenarios and UI feedback');
      console.log('   4. Verify all sections show appropriate empty state messages\n');
    } else {
      console.log('\n⚠️ Setup completed but validation failed. Please check the data manually.\n');
    }
  } catch (error) {
    console.error('\n💥 Setup failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n💥 Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { main, cleanAllData, ensureDirectorExists, validateNoDataState };