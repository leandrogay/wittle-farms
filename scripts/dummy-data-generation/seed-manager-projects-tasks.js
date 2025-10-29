/* eslint-disable no-console */
// scenarios.seed.js — Direct MongoDB seeder (no HTTP calls)

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
// Seeding tags (critical for scoped cleanup)
// =====================
const SEED_PREFIX = '[SEED ';
const SC_LABEL = (n) => `${SEED_PREFIX}sc${n}]`;   // e.g. "[SEED sc3]"
const SEEDED_USER_EMAIL_RE = /\.sc\d+@example\.com$/;

// =====================
// Mongo helpers
// =====================
const now = () => new Date();
const oid = (x) => (typeof x === 'string' ? new mongoose.Types.ObjectId(x) : x);

let conn;
let Users;
let Projects;
let Tasks;
let Comments;

// ---- FAIL-FAST, VERBOSE CONNECT ----
async function mongoConnect() {
    if (conn?.connection?.readyState === 1) return;

    const uri = MONGODB_URI;
    console.log('🔌 Connecting to MongoDB:', uri);

    try {
        conn = await mongoose.connect(uri, {
            autoIndex: false,
            serverSelectionTimeoutMS: 5000, // fail fast in ~5s if cannot reach server
        });
        const db = conn.connection.db;
        Users = db.collection('users');
        Projects = db.collection('projects');
        Tasks = db.collection('tasks');
        Comments = db.collection('comments');
        console.log('✅ Connected to MongoDB');
    } catch (err) {
        console.error('❌ MongoDB connection failed:', err.message);
        process.exit(1);
    }
}

async function mongoClose() {
    try {
        if (conn) await conn.disconnect();
    } catch (e) {
        // ignore
    }
}

// Graceful Ctrl+C
process.on('SIGINT', async () => {
    await mongoClose();
    process.exit(0);
});

// Upsert-ish user by unique email
async function getOrCreateUser({ name, email, password, role, departmentId }) {
    const existing = await Users.findOne({ email });
    if (existing) return existing;

    // bcrypt hash (same as backend-style)
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

    if (DRY_RUN) {
        return { _id: `dry-${email}`, ...doc };
    }

    const res = await Users.insertOne(doc);
    return { _id: res.insertedId, ...doc };
}

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
    if (DRY_RUN) {
        return { _id: `dry-${name}`, ...doc };
    }
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
    completedAt,          // can be set directly
    createdAt = now(),
    updatedAt = now(),
    reminderOffsets = [10080, 4320, 1440], // your default set
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

    if (DRY_RUN) {
        return { _id: `dry-${title}`, ...doc };
    }

    const res = await Tasks.insertOne(doc);
    return { _id: res.insertedId, ...doc };
}

async function updateTaskDirect(_id, patch) {
    if (DRY_RUN) return { _id, __dry__: true, ...patch };
    await Tasks.updateOne({ _id: oid(_id) }, { $set: patch });
    return await Tasks.findOne({ _id: oid(_id) });
}


async function createCommentDirect({
    taskId, body, authorId, createdAt = now(), updatedAt = now()
}) {
    if (!taskId) throw new Error('createCommentDirect: taskId required');
    if (!body || !body.trim()) throw new Error('createCommentDirect: body required');
    if (!authorId) throw new Error('createCommentDirect: authorId required');

    const doc = {
        task: oid(taskId),
        body,                      // <-- content field UI/API expect
        author: oid(authorId),     // <-- use 'author', NOT 'authorId'
        createdAt,
        updatedAt,
    };

    if (DRY_RUN) return { _id: `dry-cmt-${String(taskId)}`, ...doc };
    const res = await Comments.insertOne(doc);
    return { _id: res.insertedId, ...doc };
}


// =====================
// Scoped cleanup (scenario 0) - ONLY seeded data
// =====================
async function cleanupOnlySeeded() {
    console.log('🔎 Scanning for seeded data (ONLY records created by this script) ...');

    // 1) Seeded users + projects
    const seededUsers = await Users.find({ email: { $regex: SEEDED_USER_EMAIL_RE } }, { projection: { _id: 1 } }).toArray();
    const seededProjects = await Projects.find({ name: { $regex: `^\\${SEED_PREFIX}` } }, { projection: { _id: 1 } }).toArray();

    const seededUserIds = seededUsers.map(u => u._id);
    const seededProjectIds = seededProjects.map(p => p._id);

    // 2) Seeded tasks (by title prefix OR linked to seeded project OR created by seeded user)
    const seededTasks = await Tasks.find({
        $or: [
            { title: { $regex: `^\\${SEED_PREFIX}` } },
            { assignedProject: { $in: seededProjectIds } },
            { createdBy: { $in: seededUserIds } },
        ],
    }, { projection: { _id: 1 } }).toArray();

    // 3) Seeded comments (by linked seeded task OR created by seeded user OR body prefix)
    const seededTaskIds = seededTasks.map(t => t._id);
    const seededComments = await Comments.find({
        $or: [
            ...(seededTaskIds.length ? [{ task: { $in: seededTaskIds } }] : []),
            ...(seededUserIds.length ? [{ author: { $in: seededUserIds } }] : []), // <-- author
            { body: { $regex: `^\\${SEED_PREFIX}` } },                              // <-- body
        ],
    }, { projection: { _id: 1 } }).toArray();
    console.log(`   Found ${seededComments.length} seeded comments`);



    console.log(`   Found ${seededUserIds.length} seeded users`);
    console.log(`   Found ${seededProjectIds.length} seeded projects`);
    console.log(`   Found ${seededTasks.length} seeded tasks`);

    if (DRY_RUN) {
        console.log('🧪 DRY RUN: No deletions performed.');
        return;
    }

    const cRes = seededComments.length ? await Comments.deleteMany({ _id: { $in: seededComments.map(c => c._id) } }) : { deletedCount: 0 };
    const tRes = seededTasks.length ? await Tasks.deleteMany({ _id: { $in: seededTasks.map(t => t._id) } }) : { deletedCount: 0 };
    const pRes = seededProjectIds.length ? await Projects.deleteMany({ _id: { $in: seededProjectIds } }) : { deletedCount: 0 };
    const uRes = seededUserIds.length ? await Users.deleteMany({ _id: { $in: seededUserIds } }) : { deletedCount: 0 };

    console.log(`✅ Cleanup complete: deleted ${cRes.deletedCount} comments, ${tRes.deletedCount} tasks, ${pRes.deletedCount} projects, ${uRes.deletedCount} users`);
}

// =====================
// User/Team bootstrap
// =====================
async function ensureManagerAndTeam(scenarioNumber) {
    const suffix = `sc${scenarioNumber}`;
    const managerEmail = `manager.${suffix}@example.com`;
    const staffEmails = [
        `alice.${suffix}@example.com`,
        `ben.${suffix}@example.com`,
        `chloe.${suffix}@example.com`,
        `derek.${suffix}@example.com`,
        `eve.${suffix}@example.com`,
        `faye.${suffix}@example.com`,
    ];

    const manager = await getOrCreateUser({
        name: `${SC_LABEL(scenarioNumber)} Manager`,
        email: managerEmail,
        password: process.env.TEST_MANAGER_PASSWORD || 'Password123!',
        role: 'Manager',
        departmentId: DEPARTMENTS.SYSTEM_SOLUTIONING,
    });

    const team = [];
    for (let i = 0; i < staffEmails.length; i++) {
        team.push(await getOrCreateUser({
            name: `${SC_LABEL(scenarioNumber)} Staff${i + 1}`,
            email: staffEmails[i],
            password: process.env.TEST_STAFF_PASSWORD || 'Password123!',
            role: 'Staff',
            departmentId: DEPARTMENTS.SYSTEM_SOLUTIONING,
        }));
    }
    return { manager, team };
}

// =====================
// Generators (direct-write versions)
// =====================
function pickTeamMembers(team, count, offset = 0) {
    const ids = [];
    for (let i = 0; i < count; i++) {
        const user = team[(i + offset) % team.length];
        ids.push(user._id);
    }
    return ids;
}

async function generateTasksBlock({
    count,
    status,                    // final status: 'To Do' | 'In Progress' | 'Done'
    overdue = false,           // for not-Done, sets deadline to past
    completedLate = false,     // for Done, sets endAt after deadline
    project,
    managerId,
    team,
    titlePrefix,
    priority = 5,
    startBase = new Date(),
    startSpacingDays = 1,
}) {
    const created = [];

    for (let i = 0; i < count; i++) {
        const startAt = new Date(startBase.getTime() + i * startSpacingDays * 86400000);
        let deadline = new Date(startAt.getTime() + 7 * 86400000);
        if (overdue) deadline = new Date(Date.now() - 5 * 86400000);

        let endAt = null;
        let completedAt = undefined;

        if (status === 'Done') {
            endAt = new Date(deadline.getTime() - 86400000);
            if (completedLate) endAt = new Date(deadline.getTime() + 2 * 86400000);
            completedAt = endAt;
        }

        const title = `${titlePrefix} ${i + 1}`;

        created.push(await createTaskDirect({
            title,
            description: title,
            assignedProject: project._id,
            assignedTeamMembers: pickTeamMembers(team, 1, i),
            status,
            priority,
            deadline,
            createdBy: managerId,
            startAt,
            endAt,
            completedAt,              // set exactly for Done
            createdAt: startAt,       // for realism, createdAt = startAt
            updatedAt: endAt || startAt,
        }));
    }
    return created;
}

// =====================
// Scenarios (1..8 create; 0 cleans up)
// Names and titles are always prefixed with SC_LABEL(n)
// =====================
async function scenario1({ manager, team }, n) {
    const projects = [];
    for (let i = 1; i <= 3; i++) {
        projects.push(await createProjectDirect({
            name: `${SC_LABEL(n)} S1 Project ${i}`,
            description: 'Scenario 1',
            departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
            deadline: new Date(Date.now() + 30 * 86400000),
            createdBy: manager._id,
            teamMembers: team.map(t => t._id),
        }));
    }
    for (const [idx, p] of projects.entries()) {
        await generateTasksBlock({ count: 1 + idx, status: 'To Do', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S1 ToDo P${idx + 1}` });
        await generateTasksBlock({ count: 2, status: 'In Progress', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S1 IP P${idx + 1}` });
        await generateTasksBlock({ count: 1, status: 'Done', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S1 Done P${idx + 1}` });
    }
}

async function scenario2({ manager, team }, n) {
    const projects = [];
    for (let i = 1; i <= 5; i++) {
        projects.push(await createProjectDirect({
            name: `${SC_LABEL(n)} S2 Project ${i}`,
            description: 'Scenario 2',
            departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
            deadline: new Date(Date.now() + 40 * 86400000),
            createdBy: manager._id,
            teamMembers: team.map(t => t._id),
        }));
    }
    for (const p of projects) {
        await generateTasksBlock({ count: 3, status: 'To Do', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} ${p.name} ToDo` });
        await generateTasksBlock({ count: 2, status: 'In Progress', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} ${p.name} IP` });
        await generateTasksBlock({ count: 1, status: 'Done', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} ${p.name} Done` });
    }
}

async function scenario3({ manager, team }, n) {
    const p = await createProjectDirect({
        name: `${SC_LABEL(n)} S3 Project`,
        description: 'Scenario 3',
        departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
        deadline: new Date(Date.now() + 90 * 86400000),
        createdBy: manager._id,
        teamMembers: team.map(t => t._id),
    });

    await generateTasksBlock({ count: 10, status: 'To Do', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S3 ToDo` });
    await generateTasksBlock({ count: 15, status: 'In Progress', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S3 IP` });
    await generateTasksBlock({ count: 25, status: 'Done', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S3 Done` });
    await generateTasksBlock({ count: 5, status: 'In Progress', overdue: true, project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S3 Overdue IP` });
}

async function scenario4({ manager, team }, n) {
    const p = await createProjectDirect({
        name: `${SC_LABEL(n)} S4 Project`,
        description: 'Scenario 4',
        departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
        deadline: new Date(Date.now() + 60 * 86400000),
        createdBy: manager._id,
        teamMembers: team.map(t => t._id),
    });

    await generateTasksBlock({ count: 12, status: 'Done', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S4 Done` });
    await generateTasksBlock({ count: 5, status: 'In Progress', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S4 IP` });
    await generateTasksBlock({ count: 3, status: 'In Progress', overdue: true, project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S4 Overdue IP` });
}

async function scenario5({ manager, team }, n) {
    const subset = team.slice(0, 4);
    const p = await createProjectDirect({
        name: `${SC_LABEL(n)} S5 Project`,
        description: 'Scenario 5',
        departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
        deadline: new Date(Date.now() + 75 * 86400000),
        createdBy: manager._id,
        teamMembers: subset.map(t => t._id),
    });

    for (let i = 0; i < 12; i++) {
        const status = i % 3 === 0 ? 'Done' : (i % 3 === 1 ? 'In Progress' : 'To Do');
        const endAt = status === 'Done' ? new Date(Date.now() + 2 * 86400000) : null;
        const completedAt = status === 'Done' ? endAt : undefined;
        const startAt = now();

        await createTaskDirect({
            title: `${SC_LABEL(n)} S5 Task ${i + 1}`,
            description: `${SC_LABEL(n)} S5 Task ${i + 1}`,
            assignedProject: p._id,
            assignedTeamMembers: [subset[i % subset.length]._id],
            status,
            priority: 5,
            deadline: new Date(Date.now() + (5 - (i % 3)) * 86400000),
            createdBy: manager._id,
            startAt,
            endAt,
            completedAt,
            createdAt: startAt,
            updatedAt: endAt || startAt,
        });
    }
}

async function scenario6({ manager, team }, n) {
    const p = await createProjectDirect({
        name: `${SC_LABEL(n)} S6 Project`,
        description: 'Scenario 6',
        departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
        deadline: new Date('2026-01-31'),
        createdBy: manager._id,
        teamMembers: team.slice(0, 3).map(t => t._id),
    });

    const createdAt = new Date('2026-01-01');
    const rows = [
        { title: 'Task 1', completed: new Date('2026-01-05') }, // 4 days
        { title: 'Task 2', completed: new Date('2026-01-11') }, // 10 days
        { title: 'Task 3', completed: new Date('2026-01-04') }, // 3 days
    ];

    for (let i = 0; i < rows.length; i++) {
        const r = rows[i];

        await createTaskDirect({
            title: `${SC_LABEL(n)} S6 ${r.title}`,
            description: `${SC_LABEL(n)} S6 ${r.title}`,
            assignedProject: p._id,
            assignedTeamMembers: [team[i]._id],
            status: 'Done',
            priority: 5,
            deadline: new Date('2026-01-20'),
            createdBy: manager._id,
            startAt: createdAt,
            endAt: r.completed,
            completedAt: r.completed,  // exact completion date used for avg calculation
            createdAt,                 // exact createdAt
            updatedAt: r.completed,    // for visual checks
        });
    }
}

async function scenario7({ manager, team }, n) {
    const p = await createProjectDirect({
        name: `${SC_LABEL(n)} S7 Project`,
        description: 'Scenario 7',
        departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
        deadline: new Date(Date.now() + 50 * 86400000),
        createdBy: manager._id,
        teamMembers: team.map(t => t._id),
    });

    await generateTasksBlock({ count: 3, status: 'In Progress', overdue: true, project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S7 Overdue NotDone` });
    await generateTasksBlock({ count: 2, status: 'To Do', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S7 Future` });
    await generateTasksBlock({ count: 3, status: 'Done', project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S7 Done OnTime` });
    await generateTasksBlock({ count: 2, status: 'Done', completedLate: true, project: p, managerId: manager._id, team, titlePrefix: `${SC_LABEL(n)} S7 Done Late` });
}

async function scenario8({ manager, team }, n) {
    const baseDate = new Date(); // today, deterministic each run

    // Duration helpers — based on avg completion days
    const durations = {
        p1: [2, 4],              // avg ~3 days (2 done)
        p2: [7, 8, 9, 8, 10, 9, 8, 9], // avg ~8.5 days (8 done)
        p3: [5, 6, 7, 5, 7, 6, 6], // avg ~6 days (7 done)
        p4: [9, 10, 11, 10, 9, 10] // avg ~10 days (6 done)
    };

    const projectConfigs = [
        { idx: 1, title: "P1", done: 2, todo: 2, ip: 1, overdueIP: 0, durationsKey: 'p1' },
        { idx: 2, title: "P2", done: 8, todo: 0, ip: 0, overdueIP: 0, durationsKey: 'p2' },
        { idx: 3, title: "P3", done: 7, todo: 0, ip: 3, overdueIP: 2, durationsKey: 'p3' },
        { idx: 4, title: "P4", done: 6, todo: 3, ip: 1, overdueIP: 0, durationsKey: 'p4' },
    ];

    const projects = [];
    for (const cfg of projectConfigs) {
        const p = await createProjectDirect({
            name: `${SC_LABEL(n)} Scenario8 Project ${cfg.idx}`,
            description: `Rich test dataset ${cfg.title}`,
            departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
            deadline: new Date(baseDate.getTime() + 30 * 86400000),
            createdBy: manager._id,
            teamMembers: team.map(t => t._id),
            createdAt: new Date(baseDate.getTime() - 14 * 86400000),
            updatedAt: baseDate,
        });
        projects.push(p);
    }

    let staffIndex = 0;

    for (let i = 0; i < projectConfigs.length; i++) {
        const cfg = projectConfigs[i];
        const p = projects[i];
        const dur = durations[cfg.durationsKey];

        // 1️⃣ Done Tasks w/ avg completion time
        for (let j = 0; j < cfg.done; j++) {
            const startAt = new Date(baseDate.getTime() - dur[j] * 86400000);
            const completedAt = new Date(startAt.getTime() + dur[j] * 86400000);

            await createTaskDirect({
                title: `${SC_LABEL(n)} ${cfg.title} Done ${j + 1}`,
                assignedProject: p._id,
                assignedTeamMembers: [team[staffIndex % team.length]._id],
                status: "Done",
                priority: 5,
                deadline: new Date(baseDate.getTime() + 10 * 86400000),
                createdBy: manager._id,
                startAt,
                endAt: completedAt,
                completedAt,
                createdAt: startAt,
                updatedAt: completedAt,
            });
            staffIndex++;
        }

        // 2️⃣ In Progress (within deadline)
        for (let j = 0; j < cfg.ip - cfg.overdueIP; j++) {
            const startAt = new Date(baseDate.getTime() - 2 * 86400000);

            await createTaskDirect({
                title: `${SC_LABEL(n)} ${cfg.title} IP ${j + 1}`,
                assignedProject: p._id,
                assignedTeamMembers: [team[staffIndex % team.length]._id],
                status: "In Progress",
                priority: 5,
                deadline: new Date(baseDate.getTime() + 7 * 86400000),
                createdBy: manager._id,
                startAt,
                createdAt: startAt,
            });
            staffIndex++;
        }

        // 3️⃣ Overdue In Progress
        for (let j = 0; j < cfg.overdueIP; j++) {
            const startAt = new Date(baseDate.getTime() - 10 * 86400000);

            await createTaskDirect({
                title: `${SC_LABEL(n)} ${cfg.title} Overdue ${j + 1}`,
                assignedProject: p._id,
                assignedTeamMembers: [team[staffIndex % team.length]._id],
                status: "In Progress",
                priority: 5,
                deadline: new Date(baseDate.getTime() - 5 * 86400000),
                createdBy: manager._id,
                startAt,
                createdAt: startAt,
            });
            staffIndex++;
        }

        // 4️⃣ To Do
        for (let j = 0; j < cfg.todo; j++) {
            const startAt = baseDate;

            await createTaskDirect({
                title: `${SC_LABEL(n)} ${cfg.title} ToDo ${j + 1}`,
                assignedProject: p._id,
                assignedTeamMembers: [team[staffIndex % team.length]._id],
                status: "To Do",
                priority: 5,
                deadline: new Date(baseDate.getTime() + 15 * 86400000),
                createdBy: manager._id,
                startAt,
                createdAt: startAt,
            });
            staffIndex++;
        }
    }
}

async function scenario9({ manager, team }, n) {
    // 5 buckets: 1=Critical, 2=High, 3=Medium, 4=Low, undefined=None
    const p = await createProjectDirect({
        name: `${SC_LABEL(n)} S9 Priority Buckets`,
        description: 'LF-76 dataset with mixed statuses',
        departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
        deadline: new Date(Date.now() + 30 * 86400000),
        createdBy: manager._id,
        teamMembers: team.map(t => t._id),
    });

    const base = new Date();
    function staff(i) {
        return [team[i % team.length]._id];
    }

    // helper to cycle statuses evenly
    const STATUSES = ['To Do', 'In Progress', 'Done'];
    function getStatus(idx) {
        return STATUSES[idx % STATUSES.length];
    }

    // Helper to create one task with optional deadline + status rotation
    async function mk({ title, pr, daysFromNow, noDeadline = false, index = 0 }) {
        const deadline = noDeadline
            ? undefined
            : new Date(base.getTime() + (daysFromNow ?? 0) * 86400000);
        const status = getStatus(index);
        return createTaskDirect({
            title: `${SC_LABEL(n)} ${title}`,
            description: `${SC_LABEL(n)} ${title}`,
            assignedProject: p._id,
            assignedTeamMembers: staff(Math.abs(daysFromNow || 0)),
            status, // dynamically assigned
            ...(pr !== undefined ? { priority: pr } : {}),
            ...(deadline ? { deadline } : {}),
            createdBy: manager._id,
            startAt: base,
            createdAt: base,
            updatedAt: base,
        });
    }

    // Critical (1) — include dated, no-deadline, and a tie
    await mk({ title: 'Critical A', pr: 1, daysFromNow: 1, index: 0 });
    await mk({ title: 'Critical B (tie)', pr: 1, daysFromNow: 3, index: 1 });
    await mk({ title: 'Critical C (tie)', pr: 1, daysFromNow: 3, index: 2 });
    await mk({ title: 'Critical D (no deadline)', pr: 1, noDeadline: true, index: 3 });

    // High (2)
    await mk({ title: 'High A', pr: 8, daysFromNow: 2, index: 4 });
    await mk({ title: 'High B (no deadline)', pr: 10, noDeadline: true, index: 5 });

    // Medium (3)
    await mk({ title: 'Medium A', pr: 6, daysFromNow: -1, index: 6 }); // past
    await mk({ title: 'Medium B', pr: 4, daysFromNow: 5, index: 7 });

    // Low (4)
    await mk({ title: 'Low A', pr: 1, daysFromNow: 4, index: 8 });
    await mk({ title: 'Low B', pr: 2, noDeadline: true, index: 9 });

    // None (unset)
    await mk({ title: 'None A (no priority)', pr: undefined, daysFromNow: 6, index: 10 });
    await mk({ title: 'None B (no deadline, no priority)', pr: undefined, noDeadline: true, index: 11 });
}

async function scenario10({ manager, team }, n) {
    const p = await createProjectDirect({
        name: `${SC_LABEL(n)} S10 Priority Buckets + Comment`,
        description: 'LF-76 + seeded Manager comment on Critical A',
        departments: [DEPARTMENTS.SYSTEM_SOLUTIONING],
        deadline: new Date(Date.now() + 30 * 86400000),
        createdBy: manager._id,
        teamMembers: team.map(t => t._id),
    });

    const base = new Date();
    const STATUSES = ['To Do', 'In Progress', 'Done'];
    const staff = (i) => [team[i % team.length]._id];
    const getStatus = (idx) => STATUSES[idx % STATUSES.length];

    async function mk({ title, pr, daysFromNow, noDeadline = false, index = 0 }) {
        const deadline = noDeadline ? undefined : new Date(base.getTime() + (daysFromNow ?? 0) * 86400000);
        const status = getStatus(index);
        const task = await createTaskDirect({
            title: `${SC_LABEL(n)} ${title}`,
            description: `${SC_LABEL(n)} ${title}`,
            assignedProject: p._id,
            assignedTeamMembers: staff(Math.abs(daysFromNow || 0)),
            status,
            ...(pr !== undefined ? { priority: pr } : {}),
            ...(deadline ? { deadline } : {}),
            createdBy: manager._id,
            startAt: base,
            createdAt: base,
            updatedAt: base,
        });
        return task;
    }

    // Critical (1) — include dated, no-deadline, and a tie
    const tCriticalA = await mk({ title: 'Critical A', pr: 1, daysFromNow: 1, index: 0 });
    await mk({ title: 'Critical B (tie)', pr: 1, daysFromNow: 3, index: 1 });
    await mk({ title: 'Critical C (tie)', pr: 1, daysFromNow: 3, index: 2 });
    await mk({ title: 'Critical D (no deadline)', pr: 1, noDeadline: true, index: 3 });

    // High (2)
    await mk({ title: 'High A', pr: 8, daysFromNow: 2, index: 4 });
    await mk({ title: 'High B (no deadline)', pr: 10, noDeadline: true, index: 5 });

    // Medium (3)
    await mk({ title: 'Medium A', pr: 6, daysFromNow: -1, index: 6 });
    await mk({ title: 'Medium B', pr: 4, daysFromNow: 5, index: 7 });

    // Low (4)
    await mk({ title: 'Low A', pr: 1, daysFromNow: 4, index: 8 });
    await mk({ title: 'Low B', pr: 2, noDeadline: true, index: 9 });

    // None (unset)
    await mk({ title: 'None A (no priority)', pr: undefined, daysFromNow: 6, index: 10 });
    await mk({ title: 'None B (no deadline, no priority)', pr: undefined, noDeadline: true, index: 11 });

    // Seed Manager comment on "Critical A"
    if (tCriticalA && tCriticalA._id) {
        await createCommentDirect({
            taskId: tCriticalA._id,
            body: `${SC_LABEL(n)} Seed: initial Manager note for edit/delete tests.`,
            authorId: manager._id,
        });

        // Optional: seed a second comment for ordering/delete-middle tests
        // await createCommentDirect({
        //   taskId: tCriticalA._id,
        //   text: `${SC_LABEL(n)} Seed: follow-up note.`,
        //   createdBy: manager._id,
        // });
    }

    console.log("✅ Scenario 10 seeded with a Manager comment on 'Critical A'.");
}





const SCENARIOS = {
    0: async () => { await cleanupOnlySeeded(); }, // cleanup only seeded data
    1: scenario1,
    2: scenario2,
    3: scenario3,
    4: scenario4,
    5: scenario5,
    6: scenario6,
    7: scenario7,
    8: scenario8,
    9: scenario9,
    10: scenario10,
};

// =====================
// Main
// =====================
async function main() {
    console.log('\n📌 Scenario Seeder (DIRECT MongoDB mode)\n');

    const arg = process.argv.find((x) => x.startsWith('--scenario='));
    if (!arg) {
        console.error('❌ Missing --scenario=0..10');
        process.exit(1);
    }
    const scenarioNum = parseInt(arg.split('=')[1], 10);
    const scenarioFn = SCENARIOS[scenarioNum];
    if (!scenarioFn) {
        console.error('❌ Invalid scenario number (0..10)');
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

    const { manager, team } = await ensureManagerAndTeam(scenarioNum);
    await scenarioFn({ manager, team }, scenarioNum);

    console.log('\n✅ Seeding done.');
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

module.exports = { SCENARIOS, cleanupOnlySeeded, SEEDED_USER_EMAIL_RE, SEED_PREFIX, SC_LABEL };
