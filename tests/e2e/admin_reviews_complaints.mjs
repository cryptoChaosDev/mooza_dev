// E2E tests: Admin CRUD, Reviews lifecycle, Complaints risk-scoring, Notifications
// Run: node tests/e2e/admin_reviews_complaints.mjs

import { execSync } from 'node:child_process';

const API = process.env.API_BASE || 'https://moooza.ru/api';
const PLINK_PW = process.env.PLINK_PW || 'x-wGeH5uVZs-Y@';
const VPS = 'root@147.45.166.246';
const DBNAME = 'mooza_db';
const DBUSER = 'mooza';

const stamp = Date.now().toString(36);
const results = [];

const log = (ok, name, info = '', details = null) => {
  results.push({ ok, name, info, details });
  const tag = ok ? 'OK  ' : 'FAIL';
  console.log(`[${tag}] ${name}${info ? ' — ' + info : ''}${!ok && details ? '\n        ↪ ' + JSON.stringify(details).slice(0, 250) : ''}`);
};

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
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

function runSql(sql) {
  try {
    const b64 = Buffer.from(sql).toString('base64');
    const cmd = `plink -batch -pw "${PLINK_PW}" ${VPS} "echo ${b64} | base64 -d | docker exec -i mooza-postgres psql -U ${DBUSER} -d ${DBNAME} -t -A"`;
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (e) {
    console.warn('SQL failed:', e.message.slice(0, 120));
    return '';
  }
}

function verifyEmailsViaSql(emailPattern) {
  const result = runSql(`UPDATE "User" SET "emailVerified" = true WHERE email LIKE '${emailPattern}';`);
  return result.includes('UPDATE') || true;
}

async function registerUser(firstName, emailSuffix) {
  const email = `${emailSuffix}@moooza.test`;
  const password = 'E2E_Test_2026!';
  const r = await api('POST', '/auth/register', {
    body: { firstName, lastName: stamp, email, password, role: 'musician', city: 'Moscow' },
  });
  if (!r.ok && r.status !== 409) throw new Error(`register ${emailSuffix}: ${JSON.stringify(r.data)}`);
  return { email, password };
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
// SETUP: Register alice, bob, charlie(admin)
// ─────────────────────────────────────────────────────────────────────
async function setupUsers() {
  console.log('\n━━━ SETUP: Registering users ━━━');

  const aliceSuffix  = `e2e_alice_arc_${stamp}`;
  const bobSuffix    = `e2e_bob_arc_${stamp}`;
  const adminSuffix  = `e2e_admin_arc_${stamp}`;

  await registerUser('Alice', aliceSuffix);
  await registerUser('Bob', bobSuffix);
  await registerUser('Charlie', adminSuffix);

  // Verify all three via SQL
  verifyEmailsViaSql(`e2e_%_arc_${stamp}@moooza.test`);

  // Grant admin to charlie
  runSql(`UPDATE "User" SET "isAdmin" = true WHERE email = '${adminSuffix}@moooza.test';`);

  const alice   = await loginUser(`${aliceSuffix}@moooza.test`, 'E2E_Test_2026!');
  const bob     = await loginUser(`${bobSuffix}@moooza.test`, 'E2E_Test_2026!');
  const charlie = await loginUser(`${adminSuffix}@moooza.test`, 'E2E_Test_2026!');

  console.log(`  alice.id   = ${alice.id}`);
  console.log(`  bob.id     = ${bob.id}`);
  console.log(`  charlie.id = ${charlie.id} (admin)`);

  return { alice, bob, charlie };
}

// ─────────────────────────────────────────────────────────────────────
// PART 1: ADMIN ENDPOINTS
// ─────────────────────────────────────────────────────────────────────
async function scenarioAdminCrud(charlie, alice) {
  console.log('\n━━━ PART 1: ADMIN CRUD ━━━');

  // 1.1a Genre CRUD
  {
    const listR = await api('GET', '/admin/genres', { token: charlie.token });
    log(listR.ok && Array.isArray(listR.data), '1.1 GET /admin/genres → 200 array', `status=${listR.status}`);

    const createR = await api('POST', '/admin/genres', {
      token: charlie.token,
      body: { name: `E2E Genre ${stamp}` },
    });
    // The admin route returns 200 (not 201) for genres — server uses res.json not res.status(201)
    const genreOk = createR.ok && createR.data?.id;
    log(genreOk, '1.1 POST /admin/genres → ok, has id', `status=${createR.status}`);

    if (genreOk) {
      const gid = createR.data.id;

      const putR = await api('PUT', `/admin/genres/${gid}`, {
        token: charlie.token,
        body: { name: 'E2E Genre Updated' },
      });
      log(putR.ok && putR.data?.name === 'E2E Genre Updated', '1.1 PUT /admin/genres/:id → 200 updated', `status=${putR.status}`);

      const delR = await api('DELETE', `/admin/genres/${gid}`, { token: charlie.token });
      log(delR.ok, '1.1 DELETE /admin/genres/:id → 200 ok', `status=${delR.status}`);
    } else {
      log(false, '1.1 PUT /admin/genres/:id → SKIP (create failed)', '');
      log(false, '1.1 DELETE /admin/genres/:id → SKIP (create failed)', '');
    }
  }

  // 1.1b WorkFormat CRUD
  {
    const createR = await api('POST', '/admin/work-formats', {
      token: charlie.token,
      body: { name: `E2E WorkFmt ${stamp}` },
    });
    const wfOk = createR.ok && createR.data?.id;
    log(wfOk, '1.1 POST /admin/work-formats → ok', `status=${createR.status}`);

    if (wfOk) {
      const wid = createR.data.id;

      const putR = await api('PUT', `/admin/work-formats/${wid}`, {
        token: charlie.token,
        body: { name: 'E2E WorkFmt Updated' },
      });
      log(putR.ok, '1.1 PUT /admin/work-formats/:id → 200', `status=${putR.status}`);

      const delR = await api('DELETE', `/admin/work-formats/${wid}`, { token: charlie.token });
      log(delR.ok, '1.1 DELETE /admin/work-formats/:id → 200', `status=${delR.status}`);
    } else {
      log(false, '1.1 PUT /admin/work-formats/:id → SKIP', '');
      log(false, '1.1 DELETE /admin/work-formats/:id → SKIP', '');
    }
  }

  // 1.2 User management
  {
    const listR = await api('GET', '/admin/users', { token: charlie.token });
    log(listR.ok && Array.isArray(listR.data?.users), '1.2 GET /admin/users → 200 {users:[]}', `status=${listR.status} count=${listR.data?.total}`);

    const premR = await api('PATCH', `/admin/users/${alice.id}/premium`, { token: charlie.token });
    log(premR.ok && 'isPremium' in (premR.data || {}), '1.2 PATCH /admin/users/:id/premium → 200', `isPremium=${premR.data?.isPremium}`);

    const verR = await api('PATCH', `/admin/users/${alice.id}/verified`, { token: charlie.token });
    log(verR.ok && 'isVerified' in (verR.data || {}), '1.2 PATCH /admin/users/:id/verified → 200', `isVerified=${verR.data?.isVerified}`);

    // Block toggles — call once (toggle), call again (restore)
    const blockR = await api('PATCH', `/admin/users/${alice.id}/block`, { token: charlie.token });
    log(blockR.ok && 'isBlocked' in (blockR.data || {}), '1.2 PATCH /admin/users/:id/block → 200 (toggle)', `isBlocked=${blockR.data?.isBlocked}`);
    // Restore (toggle back)
    if (blockR.data?.isBlocked) {
      await api('PATCH', `/admin/users/${alice.id}/block`, { token: charlie.token });
    }
  }

  // 1.3 Access without admin rights
  {
    const noTokenR = await api('GET', '/admin/users');
    log(noTokenR.status === 401 || noTokenR.status === 403, '1.3 GET /admin/users no token → 401/403', `status=${noTokenR.status}`);

    const aliceR = await api('GET', '/admin/users', { token: alice.token });
    log(aliceR.status === 403 || aliceR.status === 401, '1.3 GET /admin/users alice (non-admin) → 403/401', `status=${aliceR.status}`);
  }

  // 1.4 Site settings
  {
    const putR = await api('PUT', '/admin/site-settings', {
      token: charlie.token,
      body: { testSetting: 'testValue' },
    });
    log(putR.ok, '1.4 PUT /admin/site-settings → 200', `status=${putR.status}`);

    const getR = await api('GET', '/site-settings');
    log(getR.ok && typeof getR.data === 'object', '1.4 GET /site-settings → 200 object', `status=${getR.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// PART 2: REVIEWS
// ─────────────────────────────────────────────────────────────────────
async function scenarioReviews(alice, bob) {
  console.log('\n━━━ PART 2: REVIEWS ━━━');

  let reviewId = null;

  // 2.1 Create review (bob → alice)
  {
    const r = await api('POST', '/reviews', {
      token: bob.token,
      body: { targetId: alice.id, rating: 8, text: 'Great musician to work with!', type: 'connection' },
    });
    log(r.ok && r.data?.id, '2.1 POST /reviews (bob→alice) → 200', `status=${r.status} id=${r.data?.id}`);
    if (r.data?.id) reviewId = r.data.id;

    // Get reviews for alice
    const listR = await api('GET', `/reviews/user/${alice.id}`);
    const found = Array.isArray(listR.data) && listR.data.some(rv => rv.authorId === bob.id);
    log(listR.ok && found, '2.1 GET /reviews/user/:userId → contains bob review', `status=${listR.status} count=${listR.data?.length}`);

    // Cannot review yourself
    const selfR = await api('POST', '/reviews', {
      token: alice.token,
      body: { targetId: alice.id, rating: 9, text: 'I am great', type: 'connection' },
    });
    log(selfR.status === 400, '2.1 POST /reviews self-review → 400', `status=${selfR.status}`);

    // Rating out of range
    const lowR = await api('POST', '/reviews', {
      token: bob.token,
      body: { targetId: alice.id, rating: 0, text: 'bad', type: 'connection' },
    });
    log(lowR.status === 400, '2.1 POST /reviews rating=0 → 400', `status=${lowR.status}`);

    const highR = await api('POST', '/reviews', {
      token: bob.token,
      body: { targetId: alice.id, rating: 11, text: 'too good', type: 'connection' },
    });
    log(highR.status === 400, '2.1 POST /reviews rating=11 → 400', `status=${highR.status}`);
  }

  // 2.2 Upsert (second review same author+target+type → update, not duplicate)
  {
    const r2 = await api('POST', '/reviews', {
      token: bob.token,
      body: { targetId: alice.id, rating: 9, text: 'Updated review — even better!', type: 'connection' },
    });
    log(r2.ok, '2.2 POST /reviews second time (upsert) → ok', `status=${r2.status}`);

    const listR = await api('GET', `/reviews/user/${alice.id}`);
    const bobReviews = Array.isArray(listR.data)
      ? listR.data.filter(rv => rv.authorId === bob.id && rv.type === 'connection')
      : [];
    log(bobReviews.length === 1, '2.2 GET /reviews/user/:userId → still 1 review (upsert, not duplicate)', `count=${bobReviews.length}`);
  }

  // 2.3 Reply from target user (alice)
  {
    if (reviewId) {
      const replyR = await api('PATCH', `/reviews/${reviewId}/reply`, {
        token: alice.token,
        body: { reply: 'Спасибо за отзыв!' },
      });
      log(replyR.ok && replyR.data?.reply === 'Спасибо за отзыв!', '2.3 PATCH /reviews/:id/reply (alice=target) → 200', `status=${replyR.status}`);

      // Bob (not target) cannot reply
      const forbidR = await api('PATCH', `/reviews/${reviewId}/reply`, {
        token: bob.token,
        body: { reply: 'I am not the target' },
      });
      log(forbidR.status === 403, '2.3 PATCH /reviews/:id/reply (bob=author, not target) → 403', `status=${forbidR.status}`);
    } else {
      log(false, '2.3 PATCH /reviews/:id/reply → SKIP (no reviewId)', '');
      log(false, '2.3 PATCH /reviews/:id/reply (bob) → SKIP', '');
    }
  }

  // 2.4 Delete
  {
    // Create a fresh review to delete (so we don't destroy the one used for reply test)
    const freshR = await api('POST', '/reviews', {
      token: bob.token,
      body: { targetId: alice.id, rating: 7, text: 'to be deleted', type: 'deal' },
    });
    let freshId = freshR.data?.id;

    if (freshId) {
      // Alice cannot delete bob's review
      const forbidDel = await api('DELETE', `/reviews/${freshId}`, { token: alice.token });
      log(forbidDel.status === 403, '2.4 DELETE /reviews/:id (alice, not author) → 403', `status=${forbidDel.status}`);

      // Bob (author) can delete
      const delR = await api('DELETE', `/reviews/${freshId}`, { token: bob.token });
      log(delR.ok, '2.4 DELETE /reviews/:id (bob=author) → 200', `status=${delR.status}`);
    } else {
      log(false, '2.4 DELETE /reviews/:id (not author) → SKIP', '');
      log(false, '2.4 DELETE /reviews/:id (author) → SKIP', '');
    }
  }

  // 2.5 Sorting
  {
    for (const sort of ['positive', 'negative', 'date']) {
      const r = await api('GET', `/reviews/user/${alice.id}?sort=${sort}`);
      log(r.ok && Array.isArray(r.data), `2.5 GET /reviews/user/:userId?sort=${sort} → 200 array`, `status=${r.status}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
// PART 3: COMPLAINTS
// ─────────────────────────────────────────────────────────────────────
async function scenarioComplaints(alice, bob, charlie) {
  console.log('\n━━━ PART 3: COMPLAINTS ━━━');

  let complaintId = null;

  // 3.1 Submit complaint
  {
    const r = await api('POST', '/complaints', {
      token: alice.token,
      body: { targetType: 'user', targetId: bob.id, category: 'Спам', text: 'Sends unsolicited messages constantly.' },
    });
    log(r.ok && r.data?.riskScore !== undefined, '3.1 POST /complaints (user) → 200 with riskScore', `status=${r.status} riskScore=${r.data?.riskScore}`);

    // Missing fields → 400
    const badR = await api('POST', '/complaints', {
      token: alice.token,
      body: { targetType: 'user' }, // missing targetId, category
    });
    log(badR.status === 400, '3.1 POST /complaints missing fields → 400', `status=${badR.status}`);
  }

  // 3.2 Risk-scoring
  {
    // High risk: Мошенничество
    const highR = await api('POST', '/complaints', {
      token: alice.token,
      body: { targetType: 'user', targetId: bob.id, category: 'Мошенничество / обман', text: 'Scam attempt detected.' },
    });
    log(highR.ok && highR.data?.riskScore >= 60, '3.2 Complaint "Мошенничество" → riskScore >= 60', `riskScore=${highR.data?.riskScore}`);

    // Low risk: Спам (fresh account, no previous reports before the ones we just filed)
    // We use charlie as reporter (fresh, no prior history)
    const lowR = await api('POST', '/complaints', {
      token: charlie.token,
      body: { targetType: 'user', targetId: alice.id, category: 'Спам', text: 'Testing low risk.' },
    });
    log(lowR.ok, '3.2 Complaint "Спам" submitted → ok', `riskScore=${lowR.data?.riskScore}`);
    // Note: riskScore depends on prev reports on target; just verify it's lower than Мошенничество
    if (lowR.ok && highR.ok) {
      log(lowR.data.riskScore < highR.data.riskScore, '3.2 "Спам" riskScore < "Мошенничество" riskScore', `spam=${lowR.data.riskScore} fraud=${highR.data.riskScore}`);
    } else {
      log(false, '3.2 riskScore comparison → SKIP', '');
    }
  }

  // 3.3 Admin: list and action
  {
    const listR = await api('GET', '/complaints', { token: charlie.token });
    log(listR.ok && Array.isArray(listR.data), '3.3 GET /complaints (admin) → 200 array', `status=${listR.status} count=${listR.data?.length}`);

    if (listR.ok && listR.data?.length > 0) {
      complaintId = listR.data[0].id;
    }

    const filteredR = await api('GET', '/complaints?status=pending', { token: charlie.token });
    log(filteredR.ok && Array.isArray(filteredR.data), '3.3 GET /complaints?status=pending → 200 array', `status=${filteredR.status}`);

    if (complaintId) {
      const patchR = await api('PATCH', `/complaints/${complaintId}`, {
        token: charlie.token,
        body: { status: 'reviewed', resolution: 'Нарушений не выявлено' },
      });
      log(patchR.ok, '3.3 PATCH /complaints/:id (admin action) → 200', `status=${patchR.status}`);
    } else {
      log(false, '3.3 PATCH /complaints/:id → SKIP (no complaint found)', '');
    }
  }

  // 3.4 Non-admin cannot list complaints
  {
    const forbidR = await api('GET', '/complaints', { token: alice.token });
    log(forbidR.status === 403, '3.4 GET /complaints (alice, non-admin) → 403', `status=${forbidR.status}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// PART 4: NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────
async function scenarioNotifications(charlie) {
  console.log('\n━━━ PART 4: NOTIFICATIONS ━━━');

  // 4.1 Fetch — charlie is admin, complaints route creates notifications for admins
  {
    const r = await api('GET', '/notifications', { token: charlie.token });
    log(r.ok && Array.isArray(r.data), '4.1 GET /notifications → 200 array', `status=${r.status} count=${r.data?.length}`);

    // Unread count
    const countR = await api('GET', '/notifications/unread/count', { token: charlie.token });
    log(countR.ok && typeof countR.data?.count === 'number', '4.1 GET /notifications/unread/count → 200 {count}', `count=${countR.data?.count}`);
  }

  // 4.2 Mark single notification as read
  {
    const listR = await api('GET', '/notifications', { token: charlie.token });
    const unread = Array.isArray(listR.data) ? listR.data.find(n => !n.read) : null;

    if (unread) {
      const markR = await api('PATCH', `/notifications/${unread.id}/read`, { token: charlie.token });
      log(markR.ok && markR.data?.read === true, '4.2 PATCH /notifications/:id/read → 200 read=true', `status=${markR.status}`);
    } else {
      // No unread — try on any notification
      const any = Array.isArray(listR.data) ? listR.data[0] : null;
      if (any) {
        const markR = await api('PATCH', `/notifications/${any.id}/read`, { token: charlie.token });
        log(markR.ok, '4.2 PATCH /notifications/:id/read → ok (already read)', `status=${markR.status}`);
      } else {
        log(false, '4.2 PATCH /notifications/:id/read → SKIP (no notifications)', '');
      }
    }

    // Mark all read
    const allR = await api('PATCH', '/notifications/read-all', { token: charlie.token });
    log(allR.ok, '4.2 PATCH /notifications/read-all → 200 ok', `status=${allR.status}`);

    // Verify unread count is now 0
    const countR = await api('GET', '/notifications/unread/count', { token: charlie.token });
    log(countR.ok && countR.data?.count === 0, '4.2 GET /notifications/unread/count after read-all → 0', `count=${countR.data?.count}`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  E2E: admin_reviews_complaints  stamp=${stamp}`);
  console.log(`${'═'.repeat(60)}`);

  let alice, bob, charlie;
  try {
    ({ alice, bob, charlie } = await setupUsers());
  } catch (err) {
    console.error('FATAL: setup failed —', err.message);
    process.exit(1);
  }

  await scenarioAdminCrud(charlie, alice);
  await scenarioReviews(alice, bob);
  await scenarioComplaints(alice, bob, charlie);
  await scenarioNotifications(charlie);

  // ─── SUMMARY ──────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`  PASSED: ${passed} / ${results.length}`);
  if (failed.length) {
    console.log(`  FAILED:`);
    failed.forEach(r => console.log(`    ✗ ${r.name}${r.info ? ' — ' + r.info : ''}`));
  }
  console.log(`${'═'.repeat(60)}\n`);

  process.exit(failed.length > 0 ? 1 : 0);
})();
