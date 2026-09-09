const { spawn } = require("child_process");

const BASE_URL = "http://127.0.0.1:5000";
const STARTUP_TIMEOUT_MS = 12000;

function todayIso() {
  return new Date().toISOString().split("T")[0];
}

async function fetchJson(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  let payload = null;
  try {
    payload = await res.json();
  } catch (error) {
    payload = null;
  }
  return { ok: res.ok, status: res.status, payload };
}

async function isServerAlive() {
  try {
    const result = await fetchJson("/api/turfs");
    return result.ok;
  } catch (error) {
    return false;
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    const child = spawn("node", ["server.js"], {
      cwd: __dirname,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let settled = false;

    const onReady = () => {
      if (settled) return;
      settled = true;
      resolve(child);
    };

    const onFail = (message) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const timer = setTimeout(() => {
      onFail("Timed out while waiting for backend server startup.");
    }, STARTUP_TIMEOUT_MS);

    child.stdout.on("data", (buffer) => {
      const text = buffer.toString();
      if (text.includes("SQLite Backend Server is running on port")) {
        clearTimeout(timer);
        onReady();
      }
    });

    child.stderr.on("data", (buffer) => {
      const text = buffer.toString();
      if (text.includes("EADDRINUSE")) {
        clearTimeout(timer);
        onReady();
      }
    });

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (!settled && code !== 0) {
        onFail(`Backend exited early with code ${code}.`);
      }
    });
  });
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runChecks() {
  const turfs = await fetchJson("/api/turfs");
  assertCondition(turfs.ok, `/api/turfs failed with ${turfs.status}`);
  assertCondition(
    typeof turfs.payload === "object" && turfs.payload !== null,
    "/api/turfs did not return an object",
  );

  const openings = await fetchJson("/api/openings");
  assertCondition(openings.ok, `/api/openings failed with ${openings.status}`);
  assertCondition(
    typeof openings.payload === "object" && openings.payload !== null,
    "/api/openings did not return an object",
  );

  const date = todayIso();

  const bookings = await fetchJson(`/api/bookings?date=${date}`);
  assertCondition(bookings.ok, `/api/bookings failed with ${bookings.status}`);
  assertCondition(
    typeof bookings.payload === "object" && bookings.payload !== null,
    "/api/bookings did not return an object",
  );

  const blocked = await fetchJson(`/api/blocked-slots?date=${date}`);
  assertCondition(
    blocked.ok,
    `/api/blocked-slots failed with ${blocked.status}`,
  );
  assertCondition(
    typeof blocked.payload === "object" && blocked.payload !== null,
    "/api/blocked-slots did not return an object",
  );

  const community = await fetchJson("/api/community");
  assertCondition(community.ok, `/api/community failed with ${community.status}`);
  assertCondition(
    Array.isArray(community.payload),
    "/api/community did not return an array",
  );

  const users = await fetchJson("/api/users");
  assertCondition(users.ok, `/api/users failed with ${users.status}`);
  assertCondition(
    Array.isArray(users.payload),
    "/api/users did not return an array",
  );
}

(async function main() {
  let child = null;

  try {
    const alreadyRunning = await isServerAlive();
    if (!alreadyRunning) {
      child = await startServer();
    }

    await runChecks();
    console.log("API smoke checks passed.");
  } catch (error) {
    console.error("API smoke checks failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (child) {
      child.kill("SIGTERM");
    }
  }
})();
