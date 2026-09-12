const test = require('node:test');
const assert = require('node:assert');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

function uniqueEmail(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.com`;
}

async function signup(email, password, role) {
  const res = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, role }),
  });
  return { status: res.status, body: await res.json() };
}

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  return { status: res.status, token: body.token };
}

test('health check returns ok', async () => {
  const res = await fetch(`${BASE_URL}/health`);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.strictEqual(body.status, 'ok');
});

test('signup creates a new user and returns 201', async () => {
  const email = uniqueEmail('patient');
  const { status, body } = await signup(email, 'Test@1234', 'PATIENT');
  assert.strictEqual(status, 201);
  assert.ok(body.id);
  assert.strictEqual(body.email, email);
  assert.strictEqual(body.passwordHash, undefined, 'password hash must never be returned');
});

test('signup rejects duplicate email', async () => {
  const email = uniqueEmail('dup');
  await signup(email, 'Test@1234', 'PATIENT');
  const { status } = await signup(email, 'Test@1234', 'PATIENT');
  assert.notStrictEqual(status, 201);
});

test('login fails with wrong password', async () => {
  const email = uniqueEmail('wrongpw');
  await signup(email, 'Test@1234', 'PATIENT');
  const { status } = await login(email, 'WrongPassword1');
  assert.strictEqual(status, 401);
});

test('login succeeds and returns a JWT', async () => {
  const email = uniqueEmail('loginok');
  await signup(email, 'Test@1234', 'PATIENT');
  const { status, token } = await login(email, 'Test@1234');
  assert.strictEqual(status, 200);
  assert.ok(token && token.split('.').length === 3, 'expected a JWT-shaped token');
});

test('booking requires authentication', async () => {
  const res = await fetch(`${BASE_URL}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId: 'nonexistent', idempotencyKey: 'test-no-auth' }),
  });
  assert.strictEqual(res.status, 401);
});

test('booking a nonexistent slot returns 404', async () => {
  const email = uniqueEmail('booker');
  await signup(email, 'Test@1234', 'PATIENT');
  const { token } = await login(email, 'Test@1234');

  const res = await fetch(`${BASE_URL}/api/bookings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ slotId: 'does-not-exist', idempotencyKey: `k-${Date.now()}` }),
  });
  assert.strictEqual(res.status, 404);
});

test('doctor search returns a paginated shape', async () => {
  const res = await fetch(`${BASE_URL}/api/doctors`);
  const body = await res.json();
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(body.data));
  assert.ok(body.pagination);
  assert.ok('total' in body.pagination);
});
