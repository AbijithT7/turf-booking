const path = require('path');
const fs = require('fs');
const http = require('http');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '5066';
process.env.SESSION_SECRET = 'test_provisioning_secret_abcdef_123456';

const TEST_DB = path.join(__dirname, 'test-provisioning.db');
const TEST_SESSIONS_DB = path.join(__dirname, 'test-provisioning-sessions.db');
process.env.SESSION_DB_NAME = path.basename(TEST_SESSIONS_DB);
process.env.SESSION_DB_DIR = path.dirname(TEST_SESSIONS_DB);

const { runMigrations } = require('../migrations');
const { initDB, getDB } = require('../db');
const { app } = require('../server');

// Clean prior test artifacts
try {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_SESSIONS_DB)) fs.unlinkSync(TEST_SESSIONS_DB);
} catch (e) {}

class CookieClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = {};
  }
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = { ...options.headers };
    const cookieHeader = Object.entries(this.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    if (cookieHeader) headers['Cookie'] = cookieHeader;
    if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
    const res = await fetch(url, { ...options, headers });
    const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const sc of setCookieHeaders) {
      const parts = sc.split(';')[0].split('=');
      if (parts.length >= 2) this.cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = text; }
    return { status: res.status, ok: res.ok, body: data, headers: res.headers };
  }
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    failed++;
    throw new Error(message);
  }
  console.log(`✅ PASSED: ${message}`);
  passed++;
}

let passed = 0;
let failed = 0;

async function openFreshDb(file) {
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return await open({ filename: file, driver: sqlite3.Database });
}

async function runTests() {
  console.log('==================================================');
  console.log('TURFARENA ADMIN PROVISIONING TEST SUITE');
  console.log('==================================================\n');

  // ------------------------------------------------------------------
  // Scenario A: admin provisioned from ADMIN_EMAIL / ADMIN_PASSWORD env vars
  // ------------------------------------------------------------------
  console.log('\n--- Scenario A: provision admin from env vars ---');
  process.env.ADMIN_EMAIL = 'admin@turfarena.com';
  process.env.ADMIN_PASSWORD = 'StrongerAdmin!2026';
  delete process.env.NODE_ENV; // not production
  process.env.NODE_ENV = 'test';

  const dbA = await openFreshDb(path.join(__dirname, 'test-provisioning-a.db'));
  await dbA.exec('PRAGMA foreign_keys = ON;');
  await runMigrations(dbA);
  const adminA = await dbA.get('SELECT id, name, email, role, password FROM Users WHERE LOWER(email) = ?', ['admin@turfarena.com']);
  assert(Boolean(adminA) && adminA.role === 'admin', 'Admin account provisioned from ADMIN_EMAIL/ADMIN_PASSWORD');
  assert(adminA.name === 'TurfArena Admin', 'Admin account has expected name');
  const passwordMatches = await bcrypt.compare('StrongerAdmin!2026', adminA.password);
  assert(passwordMatches, 'Admin password hash matches ADMIN_PASSWORD');
  assert(!adminA.password.includes('admin123'), 'No hardcoded fallback admin password');
  await dbA.close();

  // ------------------------------------------------------------------
  // Scenario B: password reset via env var on re-migration
  // ------------------------------------------------------------------
  console.log('\n--- Scenario B: reset admin password via env var ---');
  const resetDb = path.join(__dirname, 'test-provisioning-b.db');
  const dbB1 = await openFreshDb(resetDb);
  await dbB1.exec('PRAGMA foreign_keys = ON;');
  process.env.ADMIN_EMAIL = 'admin@turfarena.com';
  process.env.ADMIN_PASSWORD = 'OldPassword!2026';
  await runMigrations(dbB1);
  const adminB1 = await dbB1.get('SELECT password FROM Users WHERE LOWER(email) = ?', ['admin@turfarena.com']);
  assert(await bcrypt.compare('OldPassword!2026', adminB1.password), 'First password set');
  assert(!(await bcrypt.compare('NewPassword!2026', adminB1.password)), 'New password not yet set');
  await dbB1.close();

  const dbB2 = await open({ filename: resetDb, driver: sqlite3.Database });
  await dbB2.exec('PRAGMA foreign_keys = ON;');
  process.env.ADMIN_PASSWORD = 'NewPassword!2026';
  await runMigrations(dbB2);
  const adminB2 = await dbB2.get('SELECT password FROM Users WHERE LOWER(email) = ?', ['admin@turfarena.com']);
  assert(await bcrypt.compare('NewPassword!2026', adminB2.password), 'Admin password reset to new ADMIN_PASSWORD');
  assert(!(await bcrypt.compare('OldPassword!2026', adminB2.password)), 'Old password no longer valid after reset');
  const roleB2 = await dbB2.get('SELECT role FROM Users WHERE LOWER(email) = ?', ['admin@turfarena.com']);
  assert(roleB2.role === 'admin', 'Admin role preserved across password reset');
  await dbB2.close();

  // ------------------------------------------------------------------
  // Scenario C: refuse automatic role promotion of a non-admin account
  // ------------------------------------------------------------------
  console.log('\n--- Scenario C: no automatic promotion of non-admin account ---');
  const dbC = await openFreshDb(path.join(__dirname, 'test-provisioning-c.db'));
  await dbC.exec('PRAGMA foreign_keys = ON;');
  // Create tables without provisioning an admin (ADMIN_EMAIL unset).
  const savedEmail = process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_EMAIL;
  await runMigrations(dbC);
  process.env.ADMIN_EMAIL = 'admin@turfarena.com';
  await dbC.run("INSERT INTO Users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)",
    ['Regular Player', 'admin@turfarena.com', '9000000000', await bcrypt.hash('password123', 12), 'user']);
  process.env.ADMIN_PASSWORD = 'StrongerAdmin!2026';
  let threw = false;
  try { await runMigrations(dbC); } catch (e) { threw = true; }
  assert(threw, 'Migration refuses to auto-promote a non-admin ADMIN_EMAIL account');
  const roleC = await dbC.get('SELECT role FROM Users WHERE LOWER(email) = ?', ['admin@turfarena.com']);
  assert(roleC.role === 'user', 'Non-admin account role left unchanged');
  await dbC.close();
  process.env.ADMIN_EMAIL = savedEmail;

  // ------------------------------------------------------------------
  // Scenario D: production guard requires explicit admin credentials
  // ------------------------------------------------------------------
  console.log('\n--- Scenario D: production requires explicit admin credentials ---');
  const prodEmail = process.env.ADMIN_EMAIL;
  const prodPassword = process.env.ADMIN_PASSWORD;
  process.env.NODE_ENV = 'production';
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
  let threwProd = false;
  try { await runMigrations(await openFreshDb(path.join(__dirname, 'test-provisioning-d.db'))); } catch (e) { threwProd = true; }
  assert(threwProd, 'Production migration throws without ADMIN_EMAIL/ADMIN_PASSWORD');
  process.env.NODE_ENV = 'test';
  process.env.ADMIN_EMAIL = prodEmail;
  process.env.ADMIN_PASSWORD = prodPassword;

  // ------------------------------------------------------------------
  // Scenario E: end-to-end server login + authorization with provisioned admin
  // ------------------------------------------------------------------
  console.log('\n--- Scenario E: end-to-end admin login and authorization ---');
  process.env.ADMIN_EMAIL = 'admin@turfarena.com';
  process.env.ADMIN_PASSWORD = 'StrongerAdmin!2026';
  process.env.NODE_ENV = 'test';
  await initDB(TEST_DB);
  const server = await new Promise((resolve) => {
    const s = app.listen(5066, () => resolve(s));
  });
  const BASE_URL = 'http://127.0.0.1:5066';

  const adminClient = new CookieClient(BASE_URL);
  const adminLogin = await adminClient.request('/api/auth/login', {
    method: 'POST', body: { email: 'admin@turfarena.com', password: 'StrongerAdmin!2026' }
  });
  assert(adminLogin.status === 200 && adminLogin.body.user.role === 'admin', 'Provisioned admin can log in via server');
  assert(Boolean(adminClient.cookies['connect.sid']), 'Admin login sets session cookie');

  const adminUsers = await adminClient.request('/api/users');
  assert(adminUsers.status === 200 && Array.isArray(adminUsers.body), 'Admin can list users (HTTP 200)');

  const oldPassword = await adminClient.request('/api/auth/login', {
    method: 'POST', body: { email: 'admin@turfarena.com', password: 'OldPassword!2026' }
  });
  assert(oldPassword.status === 401, 'Old admin password rejected after reset');

  const normalClient = new CookieClient(BASE_URL);
  await normalClient.request('/api/auth/register', {
    method: 'POST', body: { name: 'Normal User', email: 'normal@example.com', phone: '9222222222', password: 'password123' }
  });
  await normalClient.request('/api/auth/login', { method: 'POST', body: { email: 'normal@example.com', password: 'password123' } });
  const normalUsers = await normalClient.request('/api/users');
  assert(normalUsers.status === 403, 'Normal user cannot access /api/users (HTTP 403)');

  server.close();
  try { await getDB().close(); } catch (e) {}

  console.log(`\n==================================================`);
  console.log(`ADMIN PROVISIONING TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');
}

runTests().finally(async () => {
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_SESSIONS_DB)) fs.unlinkSync(TEST_SESSIONS_DB);
    for (const f of ['test-provisioning-a.db', 'test-provisioning-b.db', 'test-provisioning-c.db', 'test-provisioning-d.db']) {
      const p = path.join(__dirname, f);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  } catch (e) {}
  await new Promise((r) => setTimeout(r, 200));
}).catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
