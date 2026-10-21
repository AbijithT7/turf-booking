const path = require('path');
const fs = require('fs');
const http = require('http');

process.env.NODE_ENV = 'test';
process.env.PORT = '5077';
process.env.SESSION_SECRET = 'test_ownership_secret_abcdef_123456';

const TEST_DB = path.join(__dirname, 'test-ownership.db');
const TEST_SESSIONS_DB = path.join(__dirname, 'test-ownership-sessions.db');
process.env.SESSION_DB_NAME = path.basename(TEST_SESSIONS_DB);
process.env.SESSION_DB_DIR = path.dirname(TEST_SESSIONS_DB);

const { initDB, getDB } = require('../db');
const { app } = require('../server');

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
    return { status: res.status, ok: res.ok, body: data };
  }
}

function dateOffset(days) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day) + days))
    .toISOString().slice(0, 10);
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

async function runTests() {
  console.log('==================================================');
  console.log('TURFARENA OWNERSHIP ISOLATION TEST SUITE');
  console.log('==================================================\n');

  process.env.ADMIN_EMAIL = 'admin@turfarena.com';
  process.env.ADMIN_PASSWORD = 'StrongerAdmin!2026';
  process.env.NODE_ENV = 'test';

  await initDB(TEST_DB);
  const server = await new Promise((resolve) => {
    const s = app.listen(5077, () => resolve(s));
  });
  const BASE_URL = 'http://127.0.0.1:5077';
  const db = getDB();

  const admin = new CookieClient(BASE_URL);
  await admin.request('/api/auth/login', { method: 'POST', body: { email: 'admin@turfarena.com', password: 'StrongerAdmin!2026' } });
  // Registration is public; use a separate client so the admin session is not
  // bound to the newly registered accounts (registration regenerates the session).
  const regClient = new CookieClient(BASE_URL);

  // Create two prospective owners
  const regA = await regClient.request('/api/auth/register', {
    method: 'POST', body: { name: 'Owner Alice', email: 'ownerA@example.com', phone: '9300000001', password: 'password123' }
  });
  assert(regA.status === 201, 'Owner Alice registered');
  const regB = await regClient.request('/api/auth/register', {
    method: 'POST', body: { name: 'Owner Bob', email: 'ownerB@example.com', phone: '9300000002', password: 'password123' }
  });
  assert(regB.status === 201, 'Owner Bob registered');

  const alice = await db.get('SELECT id FROM Users WHERE email = ?', ['ownera@example.com']);
  const bob = await db.get('SELECT id FROM Users WHERE email = ?', ['ownerb@example.com']);

  // Admin promotes both to owner
  const promA = await admin.request(`/api/admin/users/${alice.id}/role`, { method: 'PATCH', body: { role: 'owner' } });
  assert(promA.status === 200, 'Admin promotes Alice to owner');
  const promB = await admin.request(`/api/admin/users/${bob.id}/role`, { method: 'PATCH', body: { role: 'owner' } });
  assert(promB.status === 200, 'Admin promotes Bob to owner');

  // Admin assigns turf 1 to Alice, turf 2 to Bob
  const asg1 = await admin.request('/api/admin/turfs/1/owner', { method: 'PATCH', body: { ownerId: alice.id } });
  assert(asg1.status === 200, 'Admin assigns turf 1 to Alice');
  const asg2 = await admin.request('/api/admin/turfs/2/owner', { method: 'PATCH', body: { ownerId: bob.id } });
  assert(asg2.status === 200, 'Admin assigns turf 2 to Bob');

  const ownerA = new CookieClient(BASE_URL);
  await ownerA.request('/api/auth/login', { method: 'POST', body: { email: 'ownerA@example.com', password: 'password123' } });
  const ownerB = new CookieClient(BASE_URL);
  await ownerB.request('/api/auth/login', { method: 'POST', body: { email: 'ownerB@example.com', password: 'password123' } });

  // Alice sees only turf 1 in /api/owner/turfs
  const turfsA = await ownerA.request('/api/owner/turfs');
  assert(turfsA.status === 200, 'Owner A fetches own turfs (200)');
  const turfIdsA = turfsA.body.map(t => t.id);
  assert(turfIdsA.includes(1) && !turfIdsA.includes(2), 'Owner A sees only assigned turf 1');

  // Bob sees only turf 2
  const turfsB = await ownerB.request('/api/owner/turfs');
  assert(turfsB.status === 200, 'Owner B fetches own turfs (200)');
  const turfIdsB = turfsB.body.map(t => t.id);
  assert(turfIdsB.includes(2) && !turfIdsB.includes(1), 'Owner B sees only assigned turf 2');

  // Alice can update price on her own turf
  const priceOwn = await ownerA.request('/api/owner/turfs/1/price', { method: 'PATCH', body: { basePrice: 1500 } });
  assert(priceOwn.status === 200, 'Owner A updates price on own turf 1 (200)');

  // Alice CANNOT update price on Bob's turf
  const priceOther = await ownerA.request('/api/owner/turfs/2/price', { method: 'PATCH', body: { basePrice: 9999 } });
  assert(priceOther.status === 403, 'Owner A cannot update price on Bob\'s turf (403)');

  // Bob CANNOT update price on Alice's turf (valid price, wrong turf)
  const priceBobOther = await ownerB.request('/api/owner/turfs/1/price', { method: 'PATCH', body: { basePrice: 9999 } });
  assert(priceBobOther.status === 403, 'Owner B cannot update price on Alice\'s turf (403)');

  // Admin CAN update price on any turf
  const priceAdmin = await admin.request('/api/owner/turfs/2/price', { method: 'PATCH', body: { basePrice: 850 } });
  assert(priceAdmin.status === 200, 'Admin updates price on Bob\'s turf (200)');

  // Alice can block/unblock a slot on her own turf
  const date = dateOffset(1);
  const blockOwn = await ownerA.request('/api/owner/blocked-slots', {
    method: 'POST', body: { turfId: 1, date, slotHour: 10 }
  });
  assert(blockOwn.status === 201, 'Owner A blocks slot on own turf (201)');
  const blockOther = await ownerA.request('/api/owner/blocked-slots', {
    method: 'POST', body: { turfId: 2, date, slotHour: 10 }
  });
  assert(blockOther.status === 403, 'Owner A cannot block slot on Bob\'s turf (403)');

  const unblockOwn = await ownerA.request('/api/owner/blocked-slots', {
    method: 'DELETE', body: { turfId: 1, date, slotHour: 10 }
  });
  assert(unblockOwn.status === 200, 'Owner A unblocks slot on own turf (200)');

  // Regular user books a slot on turf 1 (Alice's turf)
  const customer = new CookieClient(BASE_URL);
  await customer.request('/api/auth/register', {
    method: 'POST', body: { name: 'Customer', email: 'customer@example.com', phone: '9400000003', password: 'password123' }
  });
  const bookingDate = dateOffset(2);
  const booking = await customer.request('/api/bookings', {
    method: 'POST', body: { turfId: 1, date: bookingDate, selectedSlots: [18], sportType: 'Football' }
  });
  assert(booking.status === 201, 'Customer books turf 1 (201)');
  const bookingId = booking.body.booking ? null : null;
  const myBookings = await customer.request('/api/user/bookings');
  const myBooking = (myBookings.body || []).find(b => b.date === bookingDate && b.slotHour === 18);
  assert(Boolean(myBooking), 'Customer booking recorded');
  const custBookingId = myBooking.id;

  // Alice (turf owner) can delete a booking on her own turf
  const delOwnBooking = await ownerA.request(`/api/bookings/${custBookingId}`, { method: 'DELETE' });
  assert(delOwnBooking.status === 200, 'Owner A deletes booking on own turf (200)');

  // Re-book so Bob scenario has a booking on turf 2
  const booking2 = await customer.request('/api/bookings', {
    method: 'POST', body: { turfId: 2, date: bookingDate, selectedSlots: [19], sportType: 'Cricket' }
  });
  assert(booking2.status === 201, 'Customer books turf 2 (201)');
  const myBookings2 = await customer.request('/api/user/bookings');
  const bobBooking = (myBookings2.body || []).find(b => b.turfId === 2 && b.date === bookingDate && b.slotHour === 19);

  // Alice CANNOT delete a booking on Bob's turf
  const delOtherBooking = await ownerA.request(`/api/bookings/${bobBooking.id}`, { method: 'DELETE' });
  assert(delOtherBooking.status === 403, 'Owner A cannot delete booking on Bob\'s turf (403)');

  // Admin can delete any booking
  const delAdmin = await admin.request(`/api/bookings/${bobBooking.id}`, { method: 'DELETE' });
  assert(delAdmin.status === 200, 'Admin deletes booking on Bob\'s turf (200)');

  // Regular user cannot access owner endpoints
  const ownerTurfsAsUser = await customer.request('/api/owner/turfs');
  assert(ownerTurfsAsUser.status === 403, 'Regular user cannot access /api/owner/turfs (403)');

  // Alice's /api/owner/bookings only contains her turf's bookings
  const freshBooking = await customer.request('/api/bookings', {
    method: 'POST', body: { turfId: 1, date: bookingDate, selectedSlots: [20], sportType: 'Football' }
  });
  assert(freshBooking.status === 201, 'Customer books turf 1 again (201)');
  const ownerBookingsA = await ownerA.request('/api/owner/bookings');
  assert(ownerBookingsA.status === 200, 'Owner A fetches owner bookings (200)');
  assert(ownerBookingsA.body.every(b => b.turf_id === 1), 'Owner A bookings only for turf 1');

  server.close();
  try { await getDB().close(); } catch (e) {}

  console.log(`\n==================================================`);
  console.log(`OWNERSHIP ISOLATION TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');
}

runTests().finally(async () => {
  try {
    if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    if (fs.existsSync(TEST_SESSIONS_DB)) fs.unlinkSync(TEST_SESSIONS_DB);
  } catch (e) {}
  await new Promise((r) => setTimeout(r, 200));
}).catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
