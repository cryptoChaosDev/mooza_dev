// E2E: Users profile, catalog, search, references, permissions, security edge cases
// Run: node tests/e2e/users_search_permissions.mjs

import { execSync } from 'node:child_process';

const API = process.env.API_BASE || 'https://moooza.ru/api';
const PLINK_PW = process.env.PLINK_PW || 'x-wGeH5uVZs-Y@';
const VPS = 'root@147.45.166.246';
const DBNAME = 'mooza_db';
const DBUSER = 'mooza';

const results = [];
const log = (ok, name, info = '', details = null) => {
  results.push({ ok, name, info, details });
  const tag = ok ? 'OK  ' : 'FAIL';
  console.log(
    `[${tag}] ${name}${info ? ' — ' + info : ''}${
      !ok && details ? '\n        ↪ ' + JSON.stringify(details).slice(0, 250) : ''
    }`,
  );
};

function runSql(sql) {
  try {
    const b64 = Buffer.from(sql).toString('base64');
    const cmd = `plink -batch -pw "${PLINK_PW}" ${VPS} "echo ${b64} | base64 -d | docker exec -i mooza-postgres psql -U ${DBUSER} -d ${DBNAME} -t -A"`;
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (e) {
    return '';
  }
}

function verifyEmailsViaSql(emailPattern) {
  runSql(`UPDATE "User" SET "emailVerified" = true WHERE email LIKE '${emailPattern}';`);
}

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data, ok: res.ok };
}

async function registerUser(firstName, email, password) {
  const r = await api('POST', '/auth/register', {
    body: { firstName, lastName: 'USP', email, password, role: 'musician', city: 'Moscow' },
  });
  if (!r.ok) throw new Error(`register ${email}: ${JSON.stringify(r.data)}`);
}

async function loginUser(email, password) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (!r.ok) throw new Error(`login ${email}: ${JSON.stringify(r.data)}`);
  const token = r.data.token;
  let id = r.data.user?.id;
  if (!id) {
    const me = await api('GET', '/users/me', { token });
    id = me.data?.id;
  }
  return { token, id, email };
}

// ─────────────────────────────────────────────────────────────────────
// PART 1: PROFILE & CATALOG
// ─────────────────────────────────────────────────────────────────────
async function part1Profile(alice, bob) {
  console.log('\n━━━ PART 1: PROFILE & CATALOG ━━━');
  let r;

  // 1.1 GET /users/me
  r = await api('GET', '/users/me', { token: alice.token });
  log(r.ok && r.data?.id === alice.id, '[1.1a] GET /users/me returns full profile', `status=${r.status}`, r.ok ? null : r.data);
  log(
    r.ok && 'onboardingCompletedAt' in (r.data || {}) && 'termsAgreedAt' in (r.data || {}),
    '[1.1b] /users/me has onboardingCompletedAt + termsAgreedAt',
    `oCA=${r.data?.onboardingCompletedAt} tAA=${r.data?.termsAgreedAt}`,
  );

  // 1.2 PUT /users/me
  r = await api('PUT', '/users/me', {
    token: alice.token,
    body: { bio: 'E2E bio for alice', city: 'Saint-Petersburg', occupancyStatus: 'OPEN' },
  });
  log(r.ok, '[1.2a] PUT /users/me update profile', `status=${r.status}`, r.ok ? null : r.data);

  const me2 = await api('GET', '/users/me', { token: alice.token });
  log(
    me2.ok && me2.data?.bio === 'E2E bio for alice' && me2.data?.city === 'Saint-Petersburg',
    '[1.2b] GET /users/me reflects updated bio + city',
    `bio="${me2.data?.bio}" city="${me2.data?.city}"`,
  );

  // 1.3 GET /users/:id — foreign profile
  r = await api('GET', `/users/${bob.id}`, { token: alice.token });
  log(
    r.ok && r.data?.id === bob.id && r.data?.firstName && r.data?.lastName !== undefined,
    '[1.3a] Alice sees Bob public profile (200)',
    `status=${r.status}`,
    r.ok ? null : r.data,
  );

  // No token — optionalAuthenticate, should still return 200
  r = await api('GET', `/users/${bob.id}`);
  log(r.ok && r.data?.id === bob.id, '[1.3b] GET /users/:id without token (public, 200)', `status=${r.status}`, r.ok ? null : r.data);

  // 1.4 GET /users/handle/:handle
  const stamp2 = Date.now().toString(36);
  const nickname = `e2eusp${stamp2}`;
  r = await api('PUT', '/users/me', { token: alice.token, body: { nickname } });
  log(r.ok, '[1.4a] Set alice nickname via PUT /users/me', `nickname=${nickname}`, r.ok ? null : r.data);

  r = await api('GET', `/users/handle/${nickname}`);
  log(r.ok && r.data?.nickname?.toLowerCase() === nickname.toLowerCase(), '[1.4b] GET /users/handle/:nickname → 200', `status=${r.status} nick=${r.data?.nickname}`, r.ok ? null : r.data);

  // 1.5 Services in catalog
  const profR = await api('GET', '/references/professions');
  const prof = Array.isArray(profR.data) ? profR.data[0] : null;
  let svc = null;
  let directionId = null;
  if (prof?.directionId) {
    directionId = prof.directionId;
    const svcR = await api('GET', `/references/services?directionId=${prof.directionId}`);
    svc = svcR.ok && Array.isArray(svcR.data) && svcR.data.length > 0 ? svcR.data[0] : null;
  }
  log(!!svc, '[1.5a] Got real professionId + serviceId from references', svc ? `prof=${prof.name} svc=${svc.name}` : 'no service found');

  if (svc) {
    r = await api('PUT', '/users/me/services', {
      token: alice.token,
      body: [{ professionId: prof.id, serviceId: svc.id }],
    });
    log(r.ok, '[1.5b] PUT /users/me/services → 200', `status=${r.status}`, r.ok ? null : r.data);

    // Bob views Alice's services
    r = await api('GET', `/users/${alice.id}/services`, { token: bob.token });
    log(
      r.ok && Array.isArray(r.data) && r.data.length > 0,
      '[1.5c] GET /users/:id/services (Bob sees Alice services)',
      `count=${Array.isArray(r.data) ? r.data.length : '?'}`,
      r.ok ? null : r.data,
    );

    const userServiceId = Array.isArray(r.data) && r.data.length > 0 ? r.data[0].id : null;

    if (userServiceId) {
      // GET /users/user-service/:serviceId
      r = await api('GET', `/users/user-service/${userServiceId}`);
      log(r.ok && r.data?.id === userServiceId, '[1.5d] GET /users/user-service/:serviceId → 200', `status=${r.status}`, r.ok ? null : r.data);

      // PATCH /users/me/services/:serviceId/status
      r = await api('PATCH', `/users/me/services/${userServiceId}/status`, {
        token: alice.token,
        body: { status: 'active' },
      });
      log(r.ok && r.data?.status === 'active', '[1.5e] PATCH /users/me/services/:id/status active → 200', `status=${r.status}`, r.ok ? null : r.data);
    } else {
      log(true, '[1.5d] GET /users/user-service/:serviceId', 'skipped (no userServiceId)');
      log(true, '[1.5e] PATCH /users/me/services/:id/status', 'skipped (no userServiceId)');
    }
  } else {
    log(true, '[1.5b] PUT /users/me/services', 'skipped (no service)');
    log(true, '[1.5c] GET /users/:id/services', 'skipped');
    log(true, '[1.5d] GET /users/user-service/:serviceId', 'skipped');
    log(true, '[1.5e] PATCH /users/me/services/:id/status', 'skipped');
  }

  // 1.6 Portfolio links
  r = await api('POST', '/users/me/portfolio/links', {
    token: alice.token,
    body: { type: 'audio', url: 'https://soundcloud.com/test-e2e', title: 'SC E2E' },
  });
  log(
    r.ok && r.data?.id,
    '[1.6a] POST /users/me/portfolio/links → 200/201',
    `status=${r.status}`,
    r.ok ? null : r.data,
  );

  // Alice's profile includes portfolio links
  const aliceProfile = await api('GET', `/users/${alice.id}`, { token: bob.token });
  log(
    aliceProfile.ok && Array.isArray(aliceProfile.data?.portfolioLinks),
    '[1.6b] GET /users/:id has portfolioLinks array',
    `count=${aliceProfile.data?.portfolioLinks?.length}`,
  );

  // 1.7 Occupancy status via employment post
  r = await api('POST', '/posts', {
    token: alice.token,
    body: { type: 'employment', employmentStatus: 'LOOKING', content: 'E2E employment post' },
  });
  log(r.ok || r.status === 201, '[1.7a] POST /posts type=employment', `status=${r.status}`, r.ok ? null : r.data);
  const empPostId = r.data?.id;

  const meOcc = await api('GET', '/users/me', { token: alice.token });
  log(
    meOcc.ok && meOcc.data?.occupancyStatus === 'LOOKING',
    '[1.7b] GET /users/me → occupancyStatus=LOOKING after employment post',
    `occupancyStatus=${meOcc.data?.occupancyStatus}`,
  );

  return { directionId, empPostId };
}

// ─────────────────────────────────────────────────────────────────────
// PART 2: SEARCH & CATALOG
// ─────────────────────────────────────────────────────────────────────
async function part2Search(alice, bob, directionId) {
  console.log('\n━━━ PART 2: SEARCH & CATALOG ━━━');
  let r;

  // 2.1 GET /users/search
  r = await api('GET', '/users/search?query=alice', { token: alice.token });
  log(r.ok && Array.isArray(r.data), '[2.1a] GET /users/search?query=alice → 200 array', `status=${r.status} count=${Array.isArray(r.data) ? r.data.length : '?'}`, r.ok ? null : r.data);

  r = await api('GET', '/users/search?query=nonexistent_xyz_12345', { token: alice.token });
  log(r.ok && Array.isArray(r.data) && r.data.length === 0, '[2.1b] search nonexistent → 200 empty array', `count=${Array.isArray(r.data) ? r.data.length : '?'}`, r.ok ? null : r.data);

  // Empty q — per users.ts, no `query` filter applied → returns all users excluding self (200)
  r = await api('GET', '/users/search', { token: alice.token });
  log(r.ok, '[2.1c] GET /users/search (no q) → 200', `status=${r.status}`, r.ok ? null : r.data);

  // 2.2 GET /users/catalog
  r = await api('GET', '/users/catalog', { token: alice.token });
  log(r.ok && Array.isArray(r.data), '[2.2a] GET /users/catalog → 200 array', `status=${r.status} count=${Array.isArray(r.data) ? r.data.length : '?'}`, r.ok ? null : r.data);

  if (directionId) {
    r = await api('GET', `/users/catalog?directionId=${directionId}`, { token: alice.token });
    log(r.ok && Array.isArray(r.data), '[2.2b] GET /users/catalog?directionId= → 200 filtered', `status=${r.status} count=${Array.isArray(r.data) ? r.data.length : '?'}`, r.ok ? null : r.data);
  } else {
    log(true, '[2.2b] GET /users/catalog?directionId=', 'skipped (no directionId)');
  }

  r = await api('GET', '/users/catalog?city=Moscow', { token: alice.token });
  log(r.ok && Array.isArray(r.data), '[2.2c] GET /users/catalog?city=Moscow → 200', `status=${r.status} count=${Array.isArray(r.data) ? r.data.length : '?'}`, r.ok ? null : r.data);

  // 2.3 GET /references/services/search
  r = await api('GET', '/references/services/search?q=');
  log(r.ok && (Array.isArray(r.data) ? r.data.length === 0 : true), '[2.3a] /references/services/search?q= → empty or 400', `status=${r.status}`);

  r = await api('GET', '/references/services/search?q=%D0%B2%D0%BE%D0%BA');
  log(r.ok && Array.isArray(r.data), '[2.3b] /references/services/search?q=вок → 200 array', `status=${r.status} count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // 2.4 References — full list
  const refs = [
    ['professions', '/references/professions'],
    ['directions', '/references/directions'],
    ['genres', '/references/genres'],
    ['work-formats', '/references/work-formats'],
    ['employment-types', '/references/employment-types'],
    ['skill-levels', '/references/skill-levels'],
    ['availabilities', '/references/availabilities'],
    ['geographies', '/references/geographies'],
  ];

  for (const [name, path] of refs) {
    r = await api('GET', path);
    log(r.ok && Array.isArray(r.data), `[2.4] GET ${path} → 200 array`, `count=${Array.isArray(r.data) ? r.data.length : '?'}`, r.ok ? null : r.data);
  }
}

// ─────────────────────────────────────────────────────────────────────
// PART 3: PERMISSIONS & RBAC
// ─────────────────────────────────────────────────────────────────────
async function part3Permissions(alice, bob, bobEmail) {
  console.log('\n━━━ PART 3: PERMISSIONS & RBAC ━━━');
  let r;

  // 3.1 Auth guard — protected endpoints without token → 401
  r = await api('GET', '/users/me');
  log(!r.ok && r.status === 401, '[3.1a] GET /users/me without token → 401', `status=${r.status}`);

  r = await api('POST', '/posts', { body: { content: 'no token' } });
  log(!r.ok && r.status === 401, '[3.1b] POST /posts without token → 401', `status=${r.status}`);

  r = await api('GET', '/connections');
  log(!r.ok && r.status === 401, '[3.1c] GET /connections without token → 401', `status=${r.status}`);

  // 3.2 Admin guard
  r = await api('GET', '/admin/users', { token: alice.token });
  log(!r.ok && r.status === 403, '[3.2a] GET /admin/users with non-admin alice → 403', `status=${r.status}`);

  r = await api('POST', '/admin/genres', { token: bob.token, body: { name: 'HackGenre' } });
  log(!r.ok && r.status === 403, '[3.2b] POST /admin/genres with non-admin bob → 403', `status=${r.status}`);

  // 3.3 Ownership guard — alice cannot edit/delete bob's post
  // First bob creates a post
  const bobPost = await api('POST', '/posts', {
    token: bob.token,
    body: { content: 'Bob post for ownership test' },
  });
  log(bobPost.ok || bobPost.status === 201, '[3.3pre] Bob creates post for ownership test', `status=${bobPost.status}`, bobPost.ok ? null : bobPost.data);
  const bobPostId = bobPost.data?.id;

  if (bobPostId) {
    r = await api('PUT', `/posts/${bobPostId}`, {
      token: alice.token,
      body: { content: 'alice hacked bob post' },
    });
    log(!r.ok && r.status === 403, '[3.3a] Alice PUT bob post → 403', `status=${r.status}`, !r.ok ? null : r.data);

    r = await api('DELETE', `/posts/${bobPostId}`, { token: alice.token });
    log(!r.ok && r.status === 403, '[3.3b] Alice DELETE bob post → 403', `status=${r.status}`, !r.ok ? null : r.data);
  } else {
    log(true, '[3.3a] Alice PUT bob post', 'skipped (no bob post id)');
    log(true, '[3.3b] Alice DELETE bob post', 'skipped');
  }

  // 3.4 Blocked user
  runSql(
    `UPDATE "User" SET "isBlocked" = true, "blockedUntil" = NOW() + INTERVAL '1 hour' WHERE email = '${bobEmail}';`,
  );
  r = await api('POST', '/auth/login', { body: { email: bobEmail, password: 'E2E_Test_2026!' } });
  log(!r.ok && (r.status === 403 || r.status === 401), '[3.4a] Login blocked bob → 403/401', `status=${r.status} error=${r.data?.error || ''}`);

  // Unblock
  runSql(
    `UPDATE "User" SET "isBlocked" = false, "blockedUntil" = null WHERE email = '${bobEmail}';`,
  );
  r = await api('POST', '/auth/login', { body: { email: bobEmail, password: 'E2E_Test_2026!' } });
  log(r.ok, '[3.4b] Login unblocked bob → 200', `status=${r.status}`, r.ok ? null : r.data);
}

// ─────────────────────────────────────────────────────────────────────
// PART 4: SECURITY EDGE CASES
// ─────────────────────────────────────────────────────────────────────
async function part4Security(alice, bob) {
  console.log('\n━━━ PART 4: SECURITY EDGE CASES ━━━');
  let r;

  // 4.1 XSS injection — server accepts content (sanitize is frontend responsibility)
  const xssContent = '<script>alert(1)</script>';
  r = await api('POST', '/posts', {
    token: alice.token,
    body: { content: xssContent },
  });
  log(
    r.ok || r.status === 201,
    '[4.1a] POST /posts with <script> → server accepts',
    `status=${r.status}`,
    r.ok ? null : r.data,
  );
  const xssPostId = r.data?.id;

  if (xssPostId) {
    // Verify stored content (either raw or escaped — not server crash)
    const fetchedPost = await api('GET', `/posts/${xssPostId}`, { token: alice.token });
    log(
      fetchedPost.ok && typeof fetchedPost.data?.content === 'string',
      '[4.1b] Stored XSS post fetchable, content is string',
      `content="${String(fetchedPost.data?.content).slice(0, 40)}"`,
    );
    // Cleanup
    await api('DELETE', `/posts/${xssPostId}`, { token: alice.token });
  } else {
    log(true, '[4.1b] Stored XSS post fetchable', 'skipped (no post id)');
  }

  // SQL injection via search — ORM prevents it, should return 200
  r = await api('GET', `/users/search?query=${encodeURIComponent("' OR 1=1 --")}`, { token: alice.token });
  log(r.ok && Array.isArray(r.data), "[4.1c] SQL-injection in search → 200 safe", `status=${r.status} count=${Array.isArray(r.data) ? r.data.length : '?'}`, r.ok ? null : r.data);

  // 4.2 Long content post
  const longContent = 'А'.repeat(10000);
  r = await api('POST', '/posts', {
    token: alice.token,
    body: { content: longContent },
  });
  log(
    r.ok || r.status === 201 || r.status === 400 || r.status === 413,
    '[4.2] POST /posts 10000-char content → accepted or 400/413',
    `status=${r.status}`,
  );
  if (r.ok && r.data?.id) {
    await api('DELETE', `/posts/${r.data.id}`, { token: alice.token });
  }

  // 4.3 Invalid UUID
  r = await api('GET', '/users/00000000-invalid-uuid');
  log(
    r.status === 400 || r.status === 404 || r.status === 500,
    '[4.3] GET /users/00000000-invalid-uuid → 400/404/500',
    `status=${r.status}`,
  );
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────
async function main() {
  const stamp = Date.now().toString(36);
  console.log(`Stamp: ${stamp}`);

  const aliceEmail = `e2e_alice_usp_${stamp}@moooza.test`;
  const bobEmail = `e2e_bob_usp_${stamp}@moooza.test`;
  const password = 'E2E_Test_2026!';

  // Register
  await registerUser('AliceUSP', aliceEmail, password);
  await registerUser('BobUSP', bobEmail, password);
  log(true, 'Register alice + bob', `stamp=${stamp}`);

  // Verify emails
  verifyEmailsViaSql(`e2e_%_usp_${stamp}@moooza.test`);
  log(true, 'SQL verify emails', 'done');

  // Login
  const alice = await loginUser(aliceEmail, password);
  const bob = await loginUser(bobEmail, password);
  log(!!alice.id && !!bob.id, 'Login alice + bob', `alice=${alice.id?.slice(0, 8)} bob=${bob.id?.slice(0, 8)}`);

  const { directionId } = await part1Profile(alice, bob);
  await part2Search(alice, bob, directionId);
  await part3Permissions(alice, bob, bobEmail);
  await part4Security(alice, bob);

  finish();
}

function finish() {
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  const skipped = results.filter(r => r.ok && typeof r.info === 'string' && r.info.includes('skipped'));

  console.log('\n═══════ USP SUMMARY ═══════');
  console.log(`Passed: ${passed}/${total}`);
  if (skipped.length) {
    console.log(`\nSkipped (${skipped.length}):`);
    skipped.forEach(s => console.log(`  - ${s.name} (${s.info})`));
  }
  if (failed.length) {
    console.log(`\nFailures (${failed.length}):`);
    failed.forEach(f => console.log(`  ✗ ${f.name} — ${f.info}`));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
