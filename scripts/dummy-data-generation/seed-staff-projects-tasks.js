/* eslint-disable no-console */
// seed-staff-projects-tasks.js — Direct MongoDB seeder for Staff-focused UI tests

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../backend/config/secrets.env') });

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// =====================
// Configuration
// =====================
const MONGODB_URI = process.env.MONGO_URI;
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// =====================
// Departments (ObjectIds as strings from your system)
// =====================
const DEPARTMENTS = {
  SYSTEM_SOLUTIONING: '68e48ade10fbb4910a50f302',
  HR_AND_ADMIN: '68e48bcf10fbb4910a50f30f',
  FINANCE: '68e48bd910fbb4910a50f311',
  SALES: '68e48a4a10fbb4910a50f2fd',
  CONSULTANCY: '68e48ac310fbb4910a50f300',
  ENGINEERING_OPERATION: '68e48bac10fbb4910a50f30c',
  IT: '68e48be010fbb4910a50f313',
};

// =====================
// Seed labels (scoped cleanup)
// =====================
const SEED_PREFIX = '[SEED STAFF ';
const SC_LABEL = (n) => `${SEED_PREFIX}sc${n}]`; // e.g. "[SEED STAFF sc3]"
const SEEDED_USER_EMAIL_RE = /\.staffsc\d+@example\.com$/;

// =====================
// Mongo helpers
// =====================
const now = () => new Date();
const days = (n) => n * 86400000;
const oid = (x) => (typeof x === 'string' ? new mongoose.Types.ObjectId(x) : x);

let conn;
let Users;
let Projects;
let Tasks;

// ---- FAIL-FAST, VERBOSE CONNECT ----
async function mongoConnect() {
  if (conn?.connection?.readyState === 1) return;

  const uri = MONGODB_URI;
  console.log('🔌 Connecting to MongoDB:', uri);

  try {
    conn = await mongoose.connect(uri, {
      autoIndex: false,
      serverSelectionTimeoutMS: 5000,
    });
    const db = conn.connection.db;
    Users = db.collection('users');
    Projects = db.collection('projects');
    Tasks = db.collection('tasks');
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
}

async function mongoClose() {
  try {
    if (conn) await conn.disconnect();
  } catch (e) { /* ignore */ }
}

// Graceful Ctrl+C
process.on('SIGINT', async () => {
  await mongoClose();
  process.exit(0);
});

// =====================
// Minimal user upserts
// =====================
async function getOrCreateUser({ name, email, password, role, departmentId }) {
  const existing = await Users.findOne({ email });
  if (existing) return existing;

  const hashed = await bcrypt.hash(password || 'Password123!', 10);
  const doc = {
    name,
    email,
    password: hashed,
    role,
    department: oid(departmentId),
    createdAt: now(),
    updatedAt: now(),
  };

  if (DRY_RUN) return { _id: `dry-${email}`, ...doc };

  const res = await Users.insertOne(doc);
  return { _id: res.insertedId, ...doc };
}

async function ensureManagerAndStaff(scenarioNumber) {
  const suffix = `staffsc${scenarioNumber}`;
  const manager = await getOrCreateUser({
    name: `${SC_LABEL(scenarioNumber)} Manager`,
    email: `manager.${suffix}@example.com`,
    password: process.env.TEST_MANAGER_PASSWORD || 'Password123!',
    role: 'Manager',
    departmentId: DEPARTMENTS.SYSTEM_SOLUTIONING,
  });

  const staff = await getOrCreateUser({
    name: `${SC_LABEL(scenarioNumber)} Staff`,
    email: `staff.${suffix}@example.com`,
    password: process.env.TEST_STAFF_PASSWORD || 'Password123!',
    role: 'Staff',
    departmentId: DEPARTMENTS.SYSTEM_SOLUTIONING,
  });

  return { manager, staff };
}

// =====================
// Direct write helpers
// =====================
async function createProjectDirect({
  name, description, departments, deadline, createdBy, teamMembers,
  createdAt = now(), updatedAt = now(),
}) {
  const doc = {
    name,
    description,
    department: (departments || []).map(oid),
    deadline,
    createdBy: oid(createdBy),
    teamMembers: (teamMembers || []).map(oid),
    createdAt,
    updatedAt,
  };
  if (DRY_RUN) return { _id: `dry-${name}`, ...doc };
  const res = await Projects.insertOne(doc);
  return { _id: res.insertedId, ...doc };
}

async function createTaskDirect({
  title, description, assignedProject, assignedTeamMembers,
  status = 'To Do',
  priority = 5,
  deadline,
  createdBy,
  startAt,
  endAt,
  completedAt,
  createdAt = now(),
  updatedAt = now(),
  reminderOffsets = [10080, 4320, 1440],
  allDay = false,
  notes = '',
  attachments = [],
}) {
  const doc = {
    title,
    description: description ?? '',
    notes,
    assignedProject: oid(assignedProject),
    assignedTeamMembers: (assignedTeamMembers || []).map(oid),
    status,
    priority,
    deadline,
    createdBy: oid(createdBy),
    attachments: (attachments || []).map(oid),
    allDay,
    startAt,
    endAt,
    completedAt,
    reminderOffsets,
    createdAt,
    updatedAt,
  };
  if (DRY_RUN) return { _id: `dry-${title}`, ...doc };
  const res = await Tasks.insertOne(doc);
  return { _id: res.insertedId, ...doc };
}

// Convenience: build a task by status semantics (on-time, overdue)
async function addTask({
  i, label, project, staffId, managerId,
  status, priority = 5,
  // relative timing knobs
  startAgoDays = 10, // createdAt/startAt = today - startAgoDays
  deadlineInDays = 5, // deadline = today + deadlineInDays (can be negative to force overdue)
  durationDays = 3,   // for Done: completedAt = startAt + durationDays
}) {
  const t0 = now();
  const startAt = new Date(t0.getTime() - days(startAgoDays));
  const deadline = new Date(t0.getTime() + days(deadlineInDays));

  let endAt = null;
  let completedAt;
  if (status === 'Done') {
    endAt = new Date(startAt.getTime() + days(durationDays));
    completedAt = endAt;
  }

  return createTaskDirect({
    title: `${label} #${i + 1}`,
    description: `${label} #${i + 1}`,
    assignedProject: project._id,
    assignedTeamMembers: [staffId],
    status,
    priority,
    deadline,
    createdBy: managerId,
    startAt,
    endAt,
    completedAt,
    createdAt: startAt,
    updatedAt: endAt || startAt,
  });
}

// =====================
// Scoped cleanup (scenario 0) - ONLY this script's data
// =====================
async function cleanupOnlySeeded() {
  console.log('🔎 Scanning for this script’s seeded data (users/projects/tasks) ...');

  const seededUsers = await Users.find({ email: { $regex: SEEDED_USER_EMAIL_RE } }, { projection: { _id: 1 } }).toArray();
  const seededProjects = await Projects.find({ name: { $regex: `^\\${SEED_PREFIX}` } }, { projection: { _id: 1 } }).toArray();

  const seededUserIds = seededUsers.map(u => u._id);
  const seededProjectIds = seededProjects.map(p => p._id);

  const seededTasks = await Tasks.find({
    $or: [
      { title: { $regex: `^\\${SEED_PREFIX}` } },
      { assignedProject: { $in: seededProjectIds } },
      { createdBy: { $in: seededUserIds } },
    ],
  }, { projection: { _id: 1 } }).toArray();

  console.log(`   Found ${seededUserIds.length} seeded users`);
  console.log(`   Found ${seededProjectIds.length} seeded projects`);
  console.log(`   Found ${seededTasks.length} seeded tasks`);

  if (DRY_RUN) {
    console.log('🧪 DRY RUN: No deletions performed.');
    return;
  }

  const tRes = seededTasks.length ? await Tasks.deleteMany({ _id: { $in: seededTasks.map(t => t._id) } }) : { deletedCount: 0 };
  const pRes = seededProjectIds.length ? await Projects.deleteMany({ _id: { $in: seededProjectIds } }) : { deletedCount: 0 };
  const uRes = seededUserIds.length ? await Users.deleteMany({ _id: { $in: seededUserIds } }) : { deletedCount: 0 };

  console.log(`✅ Cleanup complete: deleted ${tRes.deletedCount} tasks, ${pRes.deletedCount} projects, ${uRes.deletedCount} users`);
}

// =====================
// Scenarios (1..7)
// =====================

/**
 * 1. Verify staff can generate a report with at least 3 tasks across 2 projects
 *    Tasks have varying statuses (To Do, In Progress, Done)
 */
async function staffScenario1({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const p1 = await createProjectDirect({
    name: `${label} S1 Project Alpha`,
    description: 'S1 - Basic completion UI',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(30)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });
  const p2 = await createProjectDirect({
    name: `${label} S1 Project Beta`,
    description: 'S1 - Varying statuses',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(35)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  // 4 tasks total across 2 projects, mixed statuses
  await addTask({ i: 0, label: `${label} S1 Alpha Done`, project: p1, staffId: staff._id, managerId: manager._id, status: 'Done', deadlineInDays: 10, durationDays: 3 });
  await addTask({ i: 1, label: `${label} S1 Alpha ToDo`, project: p1, staffId: staff._id, managerId: manager._id, status: 'To Do', deadlineInDays: 12 });
  await addTask({ i: 0, label: `${label} S1 Beta InProgress`, project: p2, staffId: staff._id, managerId: manager._id, status: 'In Progress', deadlineInDays: 7 });
  await addTask({ i: 1, label: `${label} S1 Beta ToDo`, project: p2, staffId: staff._id, managerId: manager._id, status: 'To Do', deadlineInDays: 15 });
}

/**
 * 2. Verify report displays all tasks assigned to staff: 10 tasks across multiple projects
 */
async function staffScenario2({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const p1 = await createProjectDirect({
    name: `${label} S2 Project One`,
    description: 'S2 - 10 tasks across projects',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(45)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });
  const p2 = await createProjectDirect({
    name: `${label} S2 Project Two`,
    description: 'S2 - Additional tasks',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(50)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });
  const p3 = await createProjectDirect({
    name: `${label} S2 Project Three`,
    description: 'S2 - Additional tasks',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(55)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  // Distribution: 4 + 3 + 3 = 10, mixed statuses
  const statuses = ['Done','In Progress','To Do','Done','In Progress','Done','To Do','Done','In Progress','To Do'];
  const projects = [p1,p1,p1,p1, p2,p2,p2, p3,p3,p3];
  for (let i = 0; i < 10; i++) {
    await addTask({
      i,
      label: `${label} S2 Task`,
      project: projects[i],
      staffId: staff._id,
      managerId: manager._id,
      status: statuses[i],
      deadlineInDays: i % 3 === 0 ? 6 : 12,
      durationDays: 4,
    });
  }
}

/**
 * 3. Verify personal metrics: 10 tasks: 5 Done, 3 IP, 2 To Do
 */
async function staffScenario3({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const p = await createProjectDirect({
    name: `${label} S3 Project Metrics`,
    description: 'S3 - Exact ratio 5/3/2',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(60)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  // 5 Done (on-time), 3 In Progress, 2 To Do
  for (let i = 0; i < 5; i++) {
    await addTask({ i, label: `${label} S3 Done`, project: p, staffId: staff._id, managerId: manager._id, status: 'Done', deadlineInDays: 10, durationDays: 3 });
  }
  for (let i = 0; i < 3; i++) {
    await addTask({ i, label: `${label} S3 IP`, project: p, staffId: staff._id, managerId: manager._id, status: 'In Progress', deadlineInDays: 8 });
  }
  for (let i = 0; i < 2; i++) {
    await addTask({ i, label: `${label} S3 ToDo`, project: p, staffId: staff._id, managerId: manager._id, status: 'To Do', deadlineInDays: 14 });
  }
}

/**
 * 4. Verify status breakdown visual: 11 tasks: 5 Done, 3 IP, 2 To Do, 1 Overdue (IP with past deadline)
 */
async function staffScenario4({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const p = await createProjectDirect({
    name: `${label} S4 Project Breakdown`,
    description: 'S4 - Overdue visual + distribution',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(35)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  for (let i = 0; i < 5; i++) {
    await addTask({ i, label: `${label} S4 Done`, project: p, staffId: staff._id, managerId: manager._id, status: 'Done', deadlineInDays: 5, durationDays: 2 });
  }
  for (let i = 0; i < 3; i++) {
    await addTask({ i, label: `${label} S4 IP`, project: p, staffId: staff._id, managerId: manager._id, status: 'In Progress', deadlineInDays: 7 });
  }
  for (let i = 0; i < 2; i++) {
    await addTask({ i, label: `${label} S4 ToDo`, project: p, staffId: staff._id, managerId: manager._id, status: 'To Do', deadlineInDays: 12 });
  }
  // 1 Overdue IP: deadline in the past
  await addTask({ i: 0, label: `${label} S4 Overdue IP`, project: p, staffId: staff._id, managerId: manager._id, status: 'In Progress', deadlineInDays: -2 });
}

/**
 * 5. Verify priority buckets:
 *    - 2 tasks Low (1-3)
 *    - 5 tasks Medium (4-7)
 *    - 3 tasks High (8-10)
 */
async function staffScenario5({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const p = await createProjectDirect({
    name: `${label} S5 Project Priorities`,
    description: 'S5 - Priority bucket coverage',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(40)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  const plan = [
    // Low (2): priorities 2,3
    { count: 1, status: 'To Do', priorities: [2] },
    { count: 1, status: 'In Progress', priorities: [3] },
    // Medium (5): priorities 4,5,6,7,7
    { count: 2, status: 'Done', priorities: [4,5] },
    { count: 2, status: 'In Progress', priorities: [6,7] },
    { count: 1, status: 'To Do', priorities: [7] },
    // High (3): priorities 8,9,10
    { count: 1, status: 'Done', priorities: [8] },
    { count: 1, status: 'In Progress', priorities: [9] },
    { count: 1, status: 'To Do', priorities: [10] },
  ];

  let idx = 0;
  for (const row of plan) {
    for (let i = 0; i < row.count; i++, idx++) {
      const priority = row.priorities[Math.min(i, row.priorities.length - 1)];
      await addTask({
        i: idx,
        label: `${label} S5 Priority`,
        project: p,
        staffId: staff._id,
        managerId: manager._id,
        status: row.status,
        priority,
        deadlineInDays: row.status === 'In Progress' ? 6 : 10,
        durationDays: 3,
      });
    }
  }
}

/**
 * 6. Verify project-level performance:
 *    - Project A: 6 tasks, 4 completed
 *    - Project B: 4 tasks, 1 completed
 */
async function staffScenario6({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const pA = await createProjectDirect({
    name: `${label} S6 Project A`,
    description: 'S6 - Project A (6 tasks, 4 done)',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(50)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });
  const pB = await createProjectDirect({
    name: `${label} S6 Project B`,
    description: 'S6 - Project B (4 tasks, 1 done)',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(55)),
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  // Project A: 6 tasks → 4 Done, 1 IP, 1 To Do
  for (let i = 0; i < 4; i++) {
    await addTask({ i, label: `${label} S6 A Done`, project: pA, staffId: staff._id, managerId: manager._id, status: 'Done', deadlineInDays: 9, durationDays: 4 });
  }
  await addTask({ i: 0, label: `${label} S6 A IP`, project: pA, staffId: staff._id, managerId: manager._id, status: 'In Progress', deadlineInDays: 6 });
  await addTask({ i: 0, label: `${label} S6 A ToDo`, project: pA, staffId: staff._id, managerId: manager._id, status: 'To Do', deadlineInDays: 12 });

  // Project B: 4 tasks → 1 Done, 2 IP, 1 To Do
  await addTask({ i: 0, label: `${label} S6 B Done`, project: pB, staffId: staff._id, managerId: manager._id, status: 'Done', deadlineInDays: 10, durationDays: 3 });
  await addTask({ i: 1, label: `${label} S6 B IP`, project: pB, staffId: staff._id, managerId: manager._id, status: 'In Progress', deadlineInDays: 5 });
  await addTask({ i: 2, label: `${label} S6 B IP`, project: pB, staffId: staff._id, managerId: manager._id, status: 'In Progress', deadlineInDays: 7 });
  await addTask({ i: 3, label: `${label} S6 B ToDo`, project: pB, staffId: staff._id, managerId: manager._id, status: 'To Do', deadlineInDays: 14 });
}

/**
 * 7. Verify graceful handling when staff has no assigned tasks
 *    - Staff user exists
 *    - 0 tasks assigned to this staff
 */
async function staffScenario7({ manager, staff }, n) {
  const label = SC_LABEL(n);
  // Optionally create an empty project membership (not required). Keep it simple: none.
  // This ensures the Staff has zero tasks and zero projects (or you can add a project with no tasks).
  await createProjectDirect({
    name: `${label} S7 Empty Project`,
    description: 'S7 - No tasks assigned to staff',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    deadline: new Date(now().getTime() + days(20)),
    createdBy: manager._id,
    teamMembers: [], // staff not even on the team to ensure zero project linkage
  });
}

// =====================
// Scenario 8: Task with No Deadline (Not Overdue)
// =====================
async function staffScenario8({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const p = await createProjectDirect({
    name: `${label} S8 No-Deadline Project`,
    description: 'Staff task has no deadline; must not appear overdue',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  await createTaskDirect({
    title: `${label} No-Deadline Task`,
    description: 'No deadline field set',
    assignedProject: p._id,
    assignedTeamMembers: [staff._id],
    status: 'In Progress',
    priority: 5,
    createdBy: manager._id,
    startAt: now(),
    createdAt: now(),
    updatedAt: now(),
  });

  console.log('✅ Scenario 8 seeded: Staff task with NO deadline (should not be overdue).');
}

// =====================
// Scenario 9: Overdue by 1 day
// =====================
async function staffScenario9({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const deadline = new Date(now().getTime() - days(1)); // one day ago

  const p = await createProjectDirect({
    name: `${label} S9 Overdue-1d Project`,
    description: 'Staff task overdue by exactly 1 day',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  await createTaskDirect({
    title: `${label} Overdue by 1 day`,
    description: 'Boundary test: should display “1 day overdue”',
    assignedProject: p._id,
    assignedTeamMembers: [staff._id],
    status: 'In Progress',
    priority: 5,
    deadline,
    createdBy: manager._id,
    startAt: new Date(now().getTime() - days(5)),
    createdAt: new Date(now().getTime() - days(5)),
    updatedAt: now(),
  });

  console.log('✅ Scenario 9 seeded: Staff task overdue by ~1 day.');
}

// =====================
// Scenario 10: Deadline today 23:59 (Not Overdue)
// =====================
async function staffScenario10({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const eod = new Date(now().getFullYear(), now().getMonth(), now().getDate(), 23, 59, 59, 999);

  const p = await createProjectDirect({
    name: `${label} S10 Due-Today Project`,
    description: 'Deadline later today; should not be overdue',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  await createTaskDirect({
    title: `${label} Due Today 23:59`,
    description: 'Boundary test: due later today',
    assignedProject: p._id,
    assignedTeamMembers: [staff._id],
    status: 'In Progress',
    priority: 5,
    deadline: eod,
    createdBy: manager._id,
    startAt: now(),
    createdAt: now(),
    updatedAt: now(),
  });

  console.log('✅ Scenario 10 seeded: Staff task due today 23:59 (not overdue).');
}

// =====================
// Scenario 11: Done late (should NOT appear in Overdue)
// =====================
async function staffScenario11({ manager, staff }, n) {
  const label = SC_LABEL(n);
  const deadline = new Date(now().getTime() - days(3)); // due 3 days ago
  const completed = new Date(now().getTime() - days(1)); // finished 2 days late

  const p = await createProjectDirect({
    name: `${label} S11 Done-Late Project`,
    description: 'Task completed after deadline; should not appear overdue',
    departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
    createdBy: manager._id,
    teamMembers: [staff._id],
  });

  await createTaskDirect({
    title: `${label} Done Late Task`,
    description: 'Completed 2 days after deadline',
    assignedProject: p._id,
    assignedTeamMembers: [staff._id],
    status: 'Done',
    priority: 5,
    deadline,
    endAt: completed,
    completedAt: completed,
    createdBy: manager._id,
    startAt: new Date(now().getTime() - days(7)),
    createdAt: new Date(now().getTime() - days(7)),
    updatedAt: completed,
  });

  console.log('✅ Scenario 11 seeded: Staff task completed late (should NOT be overdue).');
}



// =====================
// SCENARIO MAP
// =====================
const SCENARIOS = {
  0: async () => { await cleanupOnlySeeded(); },
  1: staffScenario1,
  2: staffScenario2,
  3: staffScenario3,
  4: staffScenario4,
  5: staffScenario5,
  6: staffScenario6,
  7: staffScenario7,
  8: staffScenario8,
  9: staffScenario9,
  10: staffScenario10, 
  11: staffScenario11,
};

// =====================
// Main
// =====================
async function main() {
  console.log('\n📌 Staff-focused Seeder (DIRECT MongoDB mode)\n');

  const arg = process.argv.find((x) => x.startsWith('--scenario='));
  if (!arg) {
    console.error('❌ Missing --scenario=0..11');
    process.exit(1);
  }
  const scenarioNum = parseInt(arg.split('=')[1], 10);
  const scenarioFn = SCENARIOS[scenarioNum];
  if (!scenarioFn) {
    console.error('❌ Invalid scenario number (0..11)');
    process.exit(1);
  }

  if (!FORCE) {
    console.log('⏳ Waiting 2s... use --force to skip.\n');
    await new Promise(r => setTimeout(r, 2000));
  }

  await mongoConnect();

  if (scenarioNum === 0) {
    await scenarioFn();
    console.log('\n✅ Scoped cleanup finished.');
    if (DRY_RUN) console.log('🧪 DRY RUN: No changes were made.');
    await mongoClose();
    return;
  }

  const ctx = await ensureManagerAndStaff(scenarioNum);
  await scenarioFn(ctx, scenarioNum);

  console.log('\n✅ Staff seeding done.');
  if (DRY_RUN) console.log('🧪 DRY RUN: No writes occurred.');
  await mongoClose();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error('💥 Error:', err);
    await mongoClose();
    process.exit(1);
  });
}

module.exports = {
  SCENARIOS,
  cleanupOnlySeeded,
  SEEDED_USER_EMAIL_RE,
  SEED_PREFIX,
  SC_LABEL,
};
