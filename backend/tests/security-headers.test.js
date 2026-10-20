const assert = require('node:assert/strict');
const { app } = require('../server');

async function main() {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/__security_headers_probe__`);

    assert.equal(response.status, 404, 'unknown route should return 404');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('x-frame-options'), 'frame protection header should be present');
    assert.ok(response.headers.get('referrer-policy'), 'referrer policy header should be present');
    assert.ok(response.headers.get('cross-origin-opener-policy'), 'cross-origin opener policy should be present');

    console.log('Security header checks passed.');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
  }
}

main().catch((error) => {
  console.error('Security header checks failed:', error);
  process.exitCode = 1;
});
