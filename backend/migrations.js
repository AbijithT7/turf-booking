const fs = require('fs');
const path = require('path');

async function runMigrations(db) {
  if (process.env.NODE_ENV === 'production' &&
      (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12)) {
    throw new Error('Production requires explicit ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) before migrations or seeding.');
  }
  // Ensure migrations tracking table exists
  await db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = await db.all('SELECT name FROM _migrations');
  const applied = new Set(appliedRows.map(r => r.name));

  // Migration 001_initial.sql
  if (!applied.has('001_initial.sql')) {
    const tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='Users'");
    if (!tableExists) {
      const sql = fs.readFileSync(path.join(__dirname, 'migrations/001_initial.sql'), 'utf8');
      await db.exec(sql);
      console.log('Applied migration: 001_initial.sql');
    }
    await db.run('INSERT OR IGNORE INTO _migrations (name) VALUES (?)', ['001_initial.sql']);
  }

  // Migration 002_add_user_role.sql
  if (!applied.has('002_add_user_role.sql')) {
    const cols = await db.all('PRAGMA table_info(Users)');
    const hasRole = cols.some(c => c.name === 'role');
    if (!hasRole) {
      await db.exec("ALTER TABLE Users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
      console.log('Added role column to Users table.');
    }
    await db.run('INSERT OR IGNORE INTO _migrations (name) VALUES (?)', ['002_add_user_role.sql']);
    console.log('Applied migration: 002_add_user_role.sql');
  }

  // Migration 003_normalize_bookings.sql
  if (!applied.has('003_normalize_bookings.sql')) {
    const bookingCols = await db.all('PRAGMA table_info(Bookings)');
    const hasUserId = bookingCols.some(c => c.name === 'user_id');
    const indices = await db.all("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Bookings' AND name='idx_bookings_unique_slot'");

    if (!hasUserId || indices.length === 0) {
      // Ensure there's a fallback user for unmatched bookings
      const fallbackUser = await db.get("SELECT id FROM Users WHERE email = 'test@turf.com' LIMIT 1");
      if (!fallbackUser) {
        // Find first user or insert a system user if none
        const firstUser = await db.get("SELECT id FROM Users ORDER BY id ASC LIMIT 1");
        if (!firstUser) {
          if (process.env.NODE_ENV === 'production') {
            throw new Error('Cannot normalize legacy bookings in production without an existing user to own orphaned records. Resolve booking ownership manually before migrating.');
          }
          const bcrypt = require('bcryptjs');
          const hash = await bcrypt.hash('password123', 12);
          await db.run("INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)",
            ['Development Migration User', 'default@turfarena.com', '0000000000', hash, 'user']
          );
        }
      }

      const sql = fs.readFileSync(path.join(__dirname, 'migrations/003_normalize_bookings.sql'), 'utf8');
      await db.exec(sql);
      console.log('Normalized Bookings table with user_id and UNIQUE constraint.');
    }
    await db.run('INSERT OR IGNORE INTO _migrations (name) VALUES (?)', ['003_normalize_bookings.sql']);
    console.log('Applied migration: 003_normalize_bookings.sql');
  }

  // Migration 004_security_constraints.sql
  if (!applied.has('004_security_constraints.sql')) {
    const checkAndAddCol = async (table, col, def) => {
      const cList = await db.all(`PRAGMA table_info("${table}")`);
      if (!cList.some(c => c.name === col)) {
        await db.exec(`ALTER TABLE "${table}" ADD COLUMN ${col} ${def}`);
      }
    };

    await checkAndAddCol('TeamOpenings', 'user_id', 'INTEGER REFERENCES Users(id)');
    await checkAndAddCol('TeamRequests', 'user_id', 'INTEGER REFERENCES Users(id)');
    await checkAndAddCol('CommunityPosts', 'user_id', 'INTEGER REFERENCES Users(id)');
    await checkAndAddCol('CommunityRequests', 'user_id', 'INTEGER REFERENCES Users(id)');

    // Backfill user_id where possible
    await db.exec(`
      UPDATE TeamOpenings SET user_id = (SELECT id FROM Users WHERE Users.phone = TeamOpenings.creator_phone LIMIT 1) WHERE user_id IS NULL;
      UPDATE CommunityPosts SET user_id = (SELECT id FROM Users WHERE Users.phone = CommunityPosts.created_by_phone OR Users.email = CommunityPosts.created_by_email LIMIT 1) WHERE user_id IS NULL;
      UPDATE CommunityRequests SET user_id = (SELECT id FROM Users WHERE Users.phone = CommunityRequests.applicant_phone OR Users.email = CommunityRequests.applicant_email LIMIT 1) WHERE user_id IS NULL;

      CREATE INDEX IF NOT EXISTS idx_bookings_user ON Bookings(user_id);
      CREATE INDEX IF NOT EXISTS idx_blocked_slots ON BlockedSlots(turf_id, blocked_date, slot_hour);
      CREATE INDEX IF NOT EXISTS idx_community_posts_user ON CommunityPosts(user_id);
      CREATE INDEX IF NOT EXISTS idx_team_openings_user ON TeamOpenings(user_id);
    `);

    await db.run('INSERT OR IGNORE INTO _migrations (name) VALUES (?)', ['004_security_constraints.sql']);
    console.log('Applied migration: 004_security_constraints.sql');
  }

  // Admin provisioning: production must be explicitly configured. Never promote
  // an existing player account to admin merely because its email matches.
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredEmail = process.env.ADMIN_EMAIL;
  const configuredPassword = process.env.ADMIN_PASSWORD;

  if (isProduction && (!configuredEmail || !configuredPassword || configuredPassword.length < 12)) {
    throw new Error('Production requires explicit ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).');
  }

  const adminEmail = (configuredEmail || 'admin@turfarena.com').trim().toLowerCase();
  const existingAdmin = await db.get('SELECT id, role FROM Users WHERE LOWER(email) = ?', [adminEmail]);

  if (!existingAdmin) {
    const bcrypt = require('bcryptjs');
    const adminPassword = configuredPassword || 'admin123';
    const hash = await bcrypt.hash(adminPassword, 12);
    await db.run(
      'INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      ['TurfArena Admin', adminEmail, '9999999999', hash, 'admin']
    );
    console.log('Seeded admin account from configured credentials.');
  } else if (existingAdmin.role !== 'admin') {
    throw new Error('ADMIN_EMAIL belongs to a non-admin account. Refusing automatic role promotion; configure a different ADMIN_EMAIL or promote the account manually.');
  }

  // Demo account is development-only; never create a known-password user in production.
  if (!isProduction) {
    const userCount = await db.get("SELECT COUNT(*) as count FROM Users WHERE role = 'user'");
    if (userCount.count === 0) {
      const bcrypt = require('bcryptjs');
      const defaultPassword = await bcrypt.hash('password123', 12);
      await db.run(
        'INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
        ['Test User', 'test@turf.com', '9876543210', defaultPassword, 'user']
      );
      console.log('Seeded development-only test user: test@turf.com');
    }
  }
}

module.exports = { runMigrations };
