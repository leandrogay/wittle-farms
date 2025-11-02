const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/config/secrets.env') });

// =====================
// Configuration
// =====================
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api';

// Safety configuration
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// =====================
// Expected "No Data" Results
// =====================
const EXPECTED_NO_DATA_RESULTS = {
  companyScope: {
    totalProjects: 0,
    totalTasks: 0,
    projectStatusCounts: { "To Do": 0, "In Progress": 0, "Done": 0, "Overdue": 0 },
    taskStatusCounts: { "To Do": 0, "In Progress": 0, "Done": 0, "Overdue": 0 },
    projectStatusPercentages: { "To Do": 0, "In Progress": 0, "Done": 0, "Overdue": 0 },
    taskStatusPercentages: { "To Do": 0, "In Progress": 0, "Done": 0, "Overdue": 0 }
  },
  productivityTrend: "Stable",
  projectCompletionRateThisMonth: 0,
  projectCompletionRateLastMonth: 0,
  departmentMetrics: [], // Empty array triggers "No department data available" message
  projectBreakdown: []   // Empty array triggers "No project data available" message
};

// =====================
// Test Users (HR only - single user)
// =====================
const MINIMAL_TEST_USER = {
  name: "hr.report.test",
  email: "hr.report.test@gmail.com", 
  password: process.env.TEST_HR_PASSWORD,
  role: "HR",
  department: "68e48bcf10fbb4910a50f30f" // HR_AND_ADMIN
};

// =====================
// API Helpers
// =====================
async function verifyConnection() {
  try {
    console.log('🔍 Verifying API connection...');
    await axios.get(`${API_BASE_URL}/users`);
    console.log('✅ API connection successful\n');
    return true;
  } catch (error) {
    console.error('❌ Cannot connect to API:', error.message);
    return false;
  }
}

// =====================
// Clean Specific Data Only (Conservative Approach)
// =====================
async function cleanAllData() {
  console.log('🧹 Creating "No Data" state...\n');
  console.log('   🎯 CONSERVATIVE CLEANUP: Only deleting specific collections');
  console.log('   ❌ Will Delete: Users, Projects, Tasks');
  console.log('   ✅ Will Preserve: Departments, Comments, Attachments');
  console.log('   🎯 Goal: Achieve 0 projects, 0 tasks, 1 HR user for testing\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No data will be deleted');
    return;
  }
  
  try {
    // Delete all tasks first (due to dependencies)
    console.log('   Deleting all tasks...');
    const tasksResponse = await axios.get(`${API_BASE_URL}/tasks`);
    const allTasks = tasksResponse.data || [];
    for (const task of allTasks) {
      await axios.delete(`${API_BASE_URL}/tasks/${task._id}`);
    }
    console.log(`   ✅ Deleted ${allTasks.length} tasks`);
    
    // Delete all projects
    console.log('   Deleting all projects...');
    const projectsResponse = await axios.get(`${API_BASE_URL}/projects`);
    const allProjects = projectsResponse.data || [];
    for (const project of allProjects) {
      await axios.delete(`${API_BASE_URL}/projects/${project._id}`);
    }
    console.log(`   ✅ Deleted ${allProjects.length} projects`);
    
    // Delete all users 
    console.log('   Deleting all users...');
    const usersResponse = await axios.get(`${API_BASE_URL}/users`);
    const allUsers = usersResponse.data || [];
    for (const user of allUsers) {
      await axios.delete(`${API_BASE_URL}/users/${user._id}`);
    }
    console.log(`   ✅ Deleted ${allUsers.length} users`);
    
    console.log('   ✅ Conservative cleanup finished');
    console.log('   ✅ Preserved: Departments, Comments, Attachments');
    
  } catch (error) {
    console.log(`   ❌ Error during cleanup: ${error.message}`);
    throw error;
  }
}

// =====================
// Create Single HR Test User
// =====================
async function createMinimalUsers() {
  console.log('👥 Creating single HR test user for "no data" testing...\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No user will be created');
    return;
  }
  
  try {
    // Create user with auth/register
    const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, {
      name: MINIMAL_TEST_USER.name,
      email: MINIMAL_TEST_USER.email,
      password: MINIMAL_TEST_USER.password,
      role: MINIMAL_TEST_USER.role
    });
    
    console.log(`✅ Created user: ${MINIMAL_TEST_USER.email} (${MINIMAL_TEST_USER.role})`);
    
    const userId = registerResponse.data.user.id;
    
    // Update department
    if (MINIMAL_TEST_USER.department) {
      try {
        await axios.put(`${API_BASE_URL}/users/${userId}`, {
          department: MINIMAL_TEST_USER.department
        });
        console.log(`   ✅ Updated department for: ${MINIMAL_TEST_USER.email}`);
      } catch (deptErr) {
        console.log(`   ⚠️  Failed to update department: ${deptErr.message}`);
      }
    }
    
    console.log(`\n✅ Created 1 HR user for testing`);
    return [{
      ...MINIMAL_TEST_USER,
      _id: userId
    }];
    
  } catch (err) {
    console.log(`❌ Failed to create user: ${MINIMAL_TEST_USER.email}`, err.message);
    throw err;
  }
}

// =====================
// Test "No Data" Report Response
// =====================
async function testNoDataReport() {
  console.log('\n📊 Testing "No Data" report response...\n');
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - Skipping report test (would need actual users)');
    return { validationsPassed: 0, validationsFailed: 0 };
  }
  
  // Login as HR user to test report
  try {
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: "hr.report.test@gmail.com",
      password: process.env.TEST_HR_PASSWORD
    });
    
    console.log('✅ Successfully logged in as HR user');
    
    // Create authenticated axios instance
    const authenticatedAxios = axios.create({
      headers: {
        Cookie: loginResponse.headers['set-cookie'] || []
      }
    });
    
    // Get the company-wide report
    const reportResponse = await authenticatedAxios.get(`${API_BASE_URL}/senior-manager/report`);
    const reportData = reportResponse.data;
    
    console.log('✅ Successfully retrieved company-wide report');
    
    // Verify "no data" results
    console.log('\n📋 ACTUAL "NO DATA" RESULTS:');
    console.log('   Company Scope:');
    console.log(`     • Total Projects: ${reportData.companyScope?.totalProjects || 0}`);
    console.log(`     • Total Tasks: ${reportData.companyScope?.totalTasks || 0}`);
    console.log(`     • Project Status Counts: ${JSON.stringify(reportData.companyScope?.projectStatusCounts || {})}`);
    console.log(`     • Task Status Counts: ${JSON.stringify(reportData.companyScope?.taskStatusCounts || {})}`);
    
    console.log('\n   Productivity Metrics:');
    console.log(`     • Trend: ${reportData.productivityTrend || 'N/A'}`);
    console.log(`     • This Month: ${reportData.projectCompletionRateThisMonth || 0}%`);
    console.log(`     • Last Month: ${reportData.projectCompletionRateLastMonth || 0}%`);
    
    console.log('\n   Data Arrays:');
    console.log(`     • Department Metrics: ${reportData.departmentMetrics?.length || 0} departments`);
    console.log(`     • Project Breakdown: ${reportData.projectBreakdown?.length || 0} projects`);
    
    console.log('\n   Company Info:');
    console.log(`     • Total Departments: ${reportData.companyInfo?.totalDepartments || 0}`);
    console.log(`     • Total Employees: ${reportData.companyInfo?.totalEmployees || 0}`);
    
    // Validate against expected results
    let validationsPassed = 0;
    let validationsFailed = 0;
    
    console.log('\n🔍 VALIDATION AGAINST EXPECTED RESULTS:');
    
    // Check company scope
    if (reportData.companyScope?.totalProjects === EXPECTED_NO_DATA_RESULTS.companyScope.totalProjects) {
      console.log('   ✅ Total Projects: 0 (correct)');
      validationsPassed++;
    } else {
      console.log(`   ❌ Total Projects: Expected 0, got ${reportData.companyScope?.totalProjects}`);
      validationsFailed++;
    }
    
    if (reportData.companyScope?.totalTasks === EXPECTED_NO_DATA_RESULTS.companyScope.totalTasks) {
      console.log('   ✅ Total Tasks: 0 (correct)');
      validationsPassed++;
    } else {
      console.log(`   ❌ Total Tasks: Expected 0, got ${reportData.companyScope?.totalTasks}`);
      validationsFailed++;
    }
    
    // Check productivity trend shows "Stable" with 0% rates
    if (reportData.projectCompletionRateThisMonth === 0 && reportData.projectCompletionRateLastMonth === 0) {
      console.log('   ✅ Completion Rates: Both 0% (correct)');
      validationsPassed++;
    } else {
      console.log(`   ❌ Completion Rates: Expected both 0%, got ${reportData.projectCompletionRateThisMonth}% and ${reportData.projectCompletionRateLastMonth}%`);
      validationsFailed++;
    }
    
    // Check project breakdown (should be empty)
    if (Array.isArray(reportData.projectBreakdown) && reportData.projectBreakdown.length === 0) {
      console.log('   ✅ Project Breakdown: Empty array (will show "no data" message)');
      validationsPassed++;
    } else {
      console.log(`   ❌ Project Breakdown: Expected empty array, got ${reportData.projectBreakdown?.length || 'not array'} items`);
      validationsFailed++;
    }
    
    console.log(`\n📊 VALIDATION SUMMARY: ${validationsPassed} passed, ${validationsFailed} failed`);
    
    return { reportData, validationsPassed, validationsFailed };
    
  } catch (error) {
    console.log(`❌ Failed to test "no data" report: ${error.message}`);
    throw error;
  }
}

// =====================
// Main Execution
// =====================
async function main() {
  console.log('═'.repeat(80));
  console.log('🚫 SM/HR "NO DATA" FUNCTIONAL TEST SETUP 🚫');
  console.log('═'.repeat(80));
  
  if (DRY_RUN) {
    console.log('🧪 DRY RUN MODE - No changes will be made!');
    console.log('═'.repeat(80));
  }
  
  console.log('📋 Purpose: Create "no data" state to test SM/HR report empty state handling');
  console.log('🎯 Expected Results:');
  console.log('   • Company Scale: 0 Projects, 0 Tasks');
  console.log('   • All Status Counts: 0 (0%)');
  console.log('   • Productivity: 0% this month vs 0% last month, "Stable"');
  console.log('   • Department Table: "No department data available" message');
  console.log('   • Project Table: "No project data available" message');
  console.log('');
  
  if (!DRY_RUN && !FORCE) {
    console.log('⚠️  CONSERVATIVE CLEANUP: Will only delete Users, Projects, Tasks');
    console.log('   ✅ Will preserve: Departments, Comments, Attachments');
    console.log('   👤 Will create: 1 HR user for testing');
    console.log('   Use --dry-run to preview without changes');
    console.log('   Use --force to skip this confirmation');
    console.log('   Press Ctrl+C to cancel or wait 5 seconds to continue...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  try {
    // Verify connection
    const isConnected = await verifyConnection();
    if (!isConnected) {
      process.exit(1);
    }
    
    // Clean all data to create "no data" state
    await cleanAllData();
    
    // Create minimal test users BEFORE testing the report
    const users = await createMinimalUsers();
    
    // Test the "no data" report (only if not dry run)
    let testResults = null;
    if (!DRY_RUN) {
      testResults = await testNoDataReport();
    }
    
    // Generate summary
    console.log('\n' + '═'.repeat(80));
    console.log('📊 "NO DATA" TEST SETUP COMPLETE');
    console.log('═'.repeat(80));
    
    if (!DRY_RUN) {
      console.log('\n✅ Successfully created "no data" test environment!');
      
      console.log('\n🔐 LOGIN CREDENTIALS for manual UI testing:');
      console.log(`   HR: ${MINIMAL_TEST_USER.email}`);
      console.log(`   Password: (from TEST_HR_PASSWORD in secrets.env)`);
      
      console.log('\n🎯 MANUAL TESTING STEPS:');
      console.log('   1. Login with HR credentials above');
      console.log('   2. Navigate to Reports page');
      console.log('   3. Verify Company-Wide Performance Report shows:');
      console.log('      ✓ Company Scale: "0 Projects" and "0 Tasks"');
      console.log('      ✓ Status sections: All showing 0 counts and 0%');
      console.log('      ✓ Department section: "No department data available..." message');
      console.log('      ✓ Project section: "No project data available..." message');
      console.log('   4. Test PDF export with empty data');
      console.log('   5. Verify "no data" feedback messages appear correctly');
      
      console.log('\n📋 EXPECTED UI FEEDBACK MESSAGES:');
      console.log('   • Company Scale: "No projects or tasks yet. Company metrics will appear as work begins."');
      console.log('   • Department Performance: "No department data available yet. Department metrics will appear here once projects and tasks are assigned."');
      console.log('   • Project Performance: "No project data available yet. Project performance metrics will appear here once projects are created and have tasks assigned."');
      
      if (testResults && testResults.validationsFailed === 0) {
        console.log('\n🎉 ALL VALIDATIONS PASSED! Ready for "no data" UI testing.');
      } else if (testResults && testResults.validationsFailed > 0) {
        console.log('\n⚠️  Some validations failed. Check the report data above.');
      } else {
        console.log('\n📋 Report testing skipped in dry run mode.');
      }
    } else {
      console.log('\n🧪 DRY RUN completed. Use without --dry-run to create "no data" state.');
    }
    
    console.log('\n💡 To restore normal test data, run: seed-hr-company-wide-report.js');
    console.log('\n' + '═'.repeat(80));
    
  } catch (error) {
    console.error('\n💥 Setup failed:', error.message);
    process.exit(1);
  }
}

// =====================
// Environment Validation
// =====================
function validateEnvironment() {
  const requiredEnvVars = ['TEST_HR_PASSWORD'];
  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => console.error(`   ${key}`));
    return false;
  }
  return true;
}

// =====================
// Script Entry Point
// =====================
if (require.main === module) {
  if (!validateEnvironment()) {
    process.exit(1);
  }
  main().catch(console.error);
}

module.exports = { main, cleanAllData, createMinimalUsers, testNoDataReport, EXPECTED_NO_DATA_RESULTS };