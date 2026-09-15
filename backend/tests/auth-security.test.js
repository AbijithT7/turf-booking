const path = require('path');
const fs = require('fs');
const http = require('http');

// Set test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '5055';
process.env.SESSION_SECRET = 'test_secret_key_abcdef_123456';
process.env.ADMIN_EMAIL = 'admin@turfarena.com';
process.env.ADMIN_PASSWORD = 'admin123';

const TEST_DB = path.join(__dirname, 'test-turf.db');
const TEST_SESSIONS_DB = path.join(__dirname, 'test-sessions.db');

// Remove any prior test db files
if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
if (fs.existsSync(TEST_SESSIONS_DB)) fs.unlinkSync(TEST_SESSIONS_DB);

const { initDB } = require('../db');
const { app } = require('../server');

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
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, { ...options, headers });

    // Extract set-cookie
    const setCookieHeaders = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
    for (const sc of setCookieHeaders) {
      const parts = sc.split(';')[0].split('=');
      if (parts.length >= 2) {
        this.cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    }

    let data = null;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch (e) {
      data = text;
    }

    return { status: res.status, ok: res.ok, body: data };
  }
}

async function runTests() {
  console.log('==================================================');
  console.log('TURFARENA SECURITY & AUTHENTICATION TEST SUITE');
  console.log('==================================================\n');

  // Initialize test DB
  await initDB(TEST_DB);

  // Start HTTP server on test port
  const server = await new Promise((resolve) => {
    const s = app.listen(5055, () => resolve(s));
  });

  const BASE_URL = 'http://127.0.0.1:5055';
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      failed++;
      throw new Error(message);
    } else {
      console.log(`✅ PASSED: ${message}`);
      passed++;
    }
  }

  try {
    // ----------------------------------------------------
    // AUTH TESTS
    // ----------------------------------------------------
    console.log('--- Phase 1: Authentication Tests ---');

    // 1. Register user
    const clientUserA = new CookieClient(BASE_URL);
    const regRes = await clientUserA.request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Alice Athlete',
        email: 'alice@example.com',
        phone: '9876543211',
        password: 'password123'
      }
    });
    assert(regRes.status === 201, '1. Register user returns HTTP 201');
    assert(regRes.body.user && regRes.body.user.role === 'user', '1. Registered user has role "user"');
    assert(!regRes.body.user.password, '1. Registered user response does NOT leak password hash');

    // 2. Login user
    const clientLogin = new CookieClient(BASE_URL);
    const loginRes = await clientLogin.request('/api/auth/login', {
      method: 'POST',
      body: {
        email: 'alice@example.com',
        password: 'password123'
      }
    });
    assert(loginRes.status === 200, '2. Login user returns HTTP 200');
    assert(loginRes.body.user && loginRes.body.user.email === 'alice@example.com', '2. Login returns verified user object');

    // 3. GET /api/auth/me
    const meRes = await clientLogin.request('/api/auth/me');
    assert(meRes.status === 200, '3. GET /api/auth/me returns HTTP 200');
    assert(meRes.body.user.name === 'Alice Athlete', '3. GET /api/auth/me returns authenticated user details');

    // 4. Logout
    const logoutRes = await clientLogin.request('/api/auth/logout', { method: 'POST' });
    assert(logoutRes.status === 200, '4. Logout returns HTTP 200');
    const meAfterLogout = await clientLogin.request('/api/auth/me');
    assert(meAfterLogout.status === 401, '4. GET /api/auth/me after logout returns HTTP 401');

    // 5. Unauthenticated request rejected
    const unauthClient = new CookieClient(BASE_URL);
    const unauthRes = await unauthClient.request('/api/user/bookings');
    assert(unauthRes.status === 401, '5. Unauthenticated request to /api/user/bookings rejected with 401');

    // ----------------------------------------------------
    // ADMIN TESTS
    // ----------------------------------------------------
    console.log('\n--- Phase 2: Admin Authorization Tests ---');

    // 6. Normal user cannot access admin endpoint
    const normalUser = new CookieClient(BASE_URL);
    await normalUser.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'alice@example.com', password: 'password123' }
    });
    const normalAdminAttempt = await normalUser.request('/api/users');
    assert(normalAdminAttempt.status === 403, '6. Normal user cannot access admin endpoint GET /api/users (HTTP 403)');

    // 7. Admin can access admin endpoint
    const adminClient = new CookieClient(BASE_URL);
    const adminLogin = await adminClient.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@turfarena.com', password: 'admin123' }
    });
    assert(adminLogin.status === 200 && adminLogin.body.user.role === 'admin', '7. Admin login succeeds with role "admin"');
    const adminUsersRes = await adminClient.request('/api/users');
    assert(adminUsersRes.status === 200 && Array.isArray(adminUsersRes.body), '7. Admin can access GET /api/users (HTTP 200)');

    // 8. Invalid admin credentials rejected
    const invalidAdmin = new CookieClient(BASE_URL);
    const invalidAdminLogin = await invalidAdmin.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'admin@turfarena.com', password: 'wrongpassword' }
    });
    assert(invalidAdminLogin.status === 401, '8. Invalid admin credentials rejected with HTTP 401');

    // ----------------------------------------------------
    // BOOKING TESTS
    // ----------------------------------------------------
    console.log('\n--- Phase 3: Bookings & Security Constraints Tests ---');

    // 9. Authenticated user can create booking
    const bookingDate = '2026-10-15';
    const createBookingRes = await normalUser.request('/api/bookings', {
      method: 'POST',
      body: {
        turfId: 1,
        date: bookingDate,
        selectedSlots: [18, 19],
        sportType: 'Football'
      }
    });
    assert(createBookingRes.status === 201, '9. Authenticated user can create booking (HTTP 201)');

    // 10. Unauthenticated user cannot create booking
    const unauthBooking = await unauthClient.request('/api/bookings', {
      method: 'POST',
      body: {
        turfId: 1,
        date: bookingDate,
        selectedSlots: [20],
        sportType: 'Football'
      }
    });
    assert(unauthBooking.status === 401, '10. Unauthenticated user cannot create booking (HTTP 401)');

    // 11. Duplicate same turf/date/slot is rejected
    const dupBooking = await normalUser.request('/api/bookings', {
      method: 'POST',
      body: {
        turfId: 1,
        date: bookingDate,
        selectedSlots: [18], // already booked above
        sportType: 'Football'
      }
    });
    assert(dupBooking.status === 409, '11. Duplicate slot booking rejected with HTTP 409 Conflict');

    // 12. Two simultaneous attempts cannot both successfully book the same slot
    const clientB = new CookieClient(BASE_URL);
    await clientB.request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Bob Runner',
        email: 'bob@example.com',
        phone: '9876543212',
        password: 'password123'
      }
    });

    const [raceRes1, raceRes2] = await Promise.all([
      normalUser.request('/api/bookings', {
        method: 'POST',
        body: { turfId: 1, date: bookingDate, selectedSlots: [21], sportType: 'Football' }
      }),
      clientB.request('/api/bookings', {
        method: 'POST',
        body: { turfId: 1, date: bookingDate, selectedSlots: [21], sportType: 'Football' }
      })
    ]);
    const statuses = [raceRes1.status, raceRes2.status].sort();
    assert(
      statuses[0] === 201 && statuses[1] === 409,
      '12. Concurrent booking race condition: exactly one succeeds (201) and one conflicts (409)'
    );

    // 13. Blocked slot cannot be booked
    const blockRes = await adminClient.request('/api/blocked-slots', {
      method: 'POST',
      body: { turfId: 1, date: bookingDate, slotHour: 10 }
    });
    assert(blockRes.status === 201, '13. Slot successfully blocked by admin');
    const bookBlockedRes = await normalUser.request('/api/bookings', {
      method: 'POST',
      body: { turfId: 1, date: bookingDate, selectedSlots: [10], sportType: 'Football' }
    });
    assert(bookBlockedRes.status === 409, '13. Blocked slot cannot be booked by user (HTTP 409 Conflict)');

    // 14. User can only see their own bookings
    const userABookings = await normalUser.request('/api/user/bookings');
    assert(userABookings.status === 200, '14. User A can fetch their bookings');
    const userBBookings = await clientB.request('/api/user/bookings');
    assert(userBBookings.status === 200, '14. User B can fetch their bookings');
    // Ensure User B's list does not contain Alice's slots [18, 19]
    const userBSlots = userBBookings.body.filter(b => b.date === bookingDate).map(b => b.slotHour);
    assert(!userBSlots.includes(18) && !userBSlots.includes(19), '14. User B cannot see User A bookings');

    // 15. User cannot delete another user's booking
    const aliceBookingId = userABookings.body[0].id;
    const userBDeleteAttempt = await clientB.request(`/api/bookings/${aliceBookingId}`, {
      method: 'DELETE'
    });
    assert(userBDeleteAttempt.status === 403, '15. User cannot delete another user\'s booking (HTTP 403 Forbidden)');

    // 16. Admin can perform authorized booking administration
    const adminDeleteBooking = await adminClient.request(`/api/bookings/${aliceBookingId}`, {
      method: 'DELETE'
    });
    assert(adminDeleteBooking.status === 200, '16. Admin can delete booking (HTTP 200)');

    // ----------------------------------------------------
    // COMMUNITY TESTS
    // ----------------------------------------------------
    console.log('\n--- Phase 4: Community Ownership Tests ---');

    // User A creates community post
    const postRes = await normalUser.request('/api/community', {
      method: 'POST',
      body: {
        postType: 'solo',
        sport: 'Cricket',
        teamName: 'Marina Titans',
        turf: 'GreenLine Arena',
        spots: 3,
        fare: 200
      }
    });
    assert(postRes.status === 201, '18. Owner can create community post (HTTP 201)');
    const postId = postRes.body.id;

    // User B requests to join
    const reqRes = await clientB.request(`/api/community/${postId}/request`, {
      method: 'POST',
      body: { applicantTeam: 'Bob Team' }
    });
    assert(reqRes.status === 201, '18. User B can request to join community post (HTTP 201)');
    const reqId = reqRes.body.requestId;

    // 17. User cannot modify another user's post/opening
    const bobModifyAttempt = await clientB.request(`/api/community/${postId}/request/${reqId}`, {
      method: 'PATCH',
      body: { status: 'Accepted' }
    });
    assert(bobModifyAttempt.status === 403, '17. Non-owner cannot accept/reject applicants on another user\'s post (HTTP 403)');

    const bobDeletePostAttempt = await clientB.request(`/api/community/${postId}`, {
      method: 'DELETE'
    });
    assert(bobDeletePostAttempt.status === 403, '17. Non-owner cannot delete another user\'s community post (HTTP 403)');

    // 18. Owner can modify their own resource
    const ownerAccept = await normalUser.request(`/api/community/${postId}/request/${reqId}`, {
      method: 'PATCH',
      body: { status: 'Accepted' }
    });
    assert(ownerAccept.status === 200, '18. Owner can accept request on their own post (HTTP 200)');

    // 19. Unauthenticated modification rejected
    const unauthModify = await unauthClient.request(`/api/community/${postId}`, {
      method: 'DELETE'
    });
    assert(unauthModify.status === 401, '19. Unauthenticated modification rejected with HTTP 401');

    // ----------------------------------------------------
    // SECURITY TESTS
    // ----------------------------------------------------
    console.log('\n--- Phase 5: Security & Input Validation Tests ---');

    // 20. Authentication does not depend on localStorage
    // Request attempting to supply fake userId or fake phone is ignored in favor of server session
    const fakeIdentityBooking = await normalUser.request('/api/bookings', {
      method: 'POST',
      body: {
        turfId: 1,
        date: '2026-10-16',
        selectedSlots: [15],
        sportType: 'Cricket',
        userId: 999999,
        userPhone: '0000000000',
        userName: 'Hacker'
      }
    });
    assert(fakeIdentityBooking.status === 201, '20. Booking created successfully with session identity');
    // Check in database that the booking was assigned to Alice's real ID, not 999999
    const db = require('../db').getDB();
    const bookedRecord = await db.get(
      'SELECT user_id, user_name FROM Bookings WHERE booking_date = "2026-10-16" AND slot_hour = 15'
    );
    assert(
      bookedRecord.user_id === normalUser.body?.user?.id || bookedRecord.user_name === 'Alice Athlete',
      '20. Server enforced session user_id instead of client-supplied spoofed parameters'
    );

    // 21. Admin authorization is strictly server-side
    const spoofAdmin = await normalUser.request('/api/users', {
      headers: {
        'x-admin': 'true',
        'is-admin': 'true'
      }
    });
    assert(spoofAdmin.status === 403, '21. Client spoofing admin headers rejected with HTTP 403');

    // 22. Invalid input is rejected
    const badEmailReg = await unauthClient.request('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Invalid Email User',
        email: 'not-an-email',
        phone: '1234567890',
        password: 'pass'
      }
    });
    assert(badEmailReg.status === 400, '22. Registration with invalid email/short password rejected with HTTP 400');

    const badBookingSlot = await normalUser.request('/api/bookings', {
      method: 'POST',
      body: {
        turfId: 1,
        date: '2026-10-17',
        selectedSlots: [25], // invalid slot hour > 23
        sportType: 'Football'
      }
    });
    assert(badBookingSlot.status === 400, '22. Booking with invalid slot hour (> 23) rejected with HTTP 400');

    const dupSlotInReq = await normalUser.request('/api/bookings', {
      method: 'POST',
      body: {
        turfId: 1,
        date: '2026-10-17',
        selectedSlots: [10, 10], // duplicate slot in array
        sportType: 'Football'
      }
    });
    assert(dupSlotInReq.status === 400, '22. Booking with duplicate slots in request array rejected with HTTP 400');

    console.log('\n==================================================');
    console.log(`ALL TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');
  } finally {
    server.close();
    try {
      const db = require('../db').getDB();
      await db.close();
    } catch (e) {}
    // Wait briefly for file lock to release on Windows
    await new Promise((r) => setTimeout(r, 200));
    try {
      if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
    } catch (e) {}
    try {
      if (fs.existsSync(TEST_SESSIONS_DB)) fs.unlinkSync(TEST_SESSIONS_DB);
    } catch (e) {}
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
