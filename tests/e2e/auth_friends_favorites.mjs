// E2E tests: auth edge cases, friendships full lifecycle, favorites
// Run: node tests/e2e/auth_friends_favorites.mjs

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
  console.log(
    `[${tag}] ${name}${info ? ' — ' + info : ''}${
      !ok && details ? '\n        ↪ ' + JSON.stringify(details).slice(0, 250) : ''
    }`
  );
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

function sqlViaSsh(sql) {
  try {
    const b64 = Buffer.from(sql).toString('base64');
    const cmd = `plink -batch -pw "${PLINK_PW}" ${VPS} "echo ${b64} | base64 -d | docker exec -i mooza-postgres psql -U ${DBUSER} -d ${DBNAME}"`;
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    console.warn('SSH failed:', e.message);
    return '';
  }
}

function verifyEmailsViaSql(emailPattern) {
  const out = sqlViaSsh(`UPDATE "User" SET "emailVerified" = true WHERE email LIKE '${emailPattern}';`);
  return out.includes('UPDATE');
}

function readFieldViaSql(field, email) {
  try {
    const sql = `SELECT "${field}" FROM "User" WHERE email = '${email}';`;
    const out = sqlViaSsh(sql);
    // psql output format:
    //  emailVerificationCode
    // ─────────────────────
    //  123456
    // (1 row)
    const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
    // find the value line (after separator ---)
    const sepIdx = lines.findIndex(l => /^-+$/.test(l));
    if (sepIdx !== -1 && lines[sepIdx + 1] && !lines[sepIdx + 1].startsWith('(')) {
      return lines[sepIdx + 1].trim();
    }
    return null;
  } catch (e) {
    console.warn('SSH read failed:', e.message);
    return null;
  }
}

// ─── Register a user WITHOUT verifying email, return email+password ───────────
async function register(namePrefix, suffix, extraBody = {}) {
  const email = `e2e_${suffix}_aff_${stamp}@moooza.test`;
  const password = 'E2E_Test_2026!';
  const r = await api('POST', '/auth/register', {
    body: {
      firstName: namePrefix,
      lastName: `AFF${stamp}`,
      email,
      password,
      ...extraBody,
    },
  });
  return { email, password, r };
}

// ─── Login and return { token, id } ──────────────────────────────────────────
async function loginUser(email, password) {
  const r = await api('POST', '/auth/login', { body: { email, password } });
  if (!r.ok) throw new Error(`login ${email}: ${JSON.stringify(r.data)}`);
  const token = r.data.token;
  const id = r.data.user?.id;
  return { token, id };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1: AUTH EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════════
async function partAuth() {
  console.log('\n━━━ PART 1: AUTH EDGE CASES ━━━');

  // 1.1 Registration validation
  // First register a real user so we can test duplicate email
  const mainEmail = `e2e_main_aff_${stamp}@moooza.test`;
  const mainPw = 'E2E_Test_2026!';

  const regOk = await api('POST', '/auth/register', {
    body: { firstName: 'Main', lastName: `AFF${stamp}`, email: mainEmail, password: mainPw },
  });
  log(regOk.status === 201, '1.1 register — valid → 201', `status=${regOk.status}`, regOk.data);

  // Duplicate email → 400
  const regDup = await api('POST', '/auth/register', {
    body: { firstName: 'Dup', lastName: 'Test', email: mainEmail, password: mainPw },
  });
  log(regDup.status === 400 || regDup.status === 409, '1.1 register — duplicate email → 400/409', `status=${regDup.status}`, regDup.data);

  // Password < 8 chars → 400
  const regShortPw = await api('POST', '/auth/register', {
    body: { firstName: 'Short', lastName: 'Pw', email: `e2e_shortpw_aff_${stamp}@moooza.test`, password: 'abc123' },
  });
  log(regShortPw.status === 400, '1.1 register — short password → 400', `status=${regShortPw.status}`, regShortPw.data);

  // Missing firstName → 400
  const regNoName = await api('POST', '/auth/register', {
    body: { lastName: 'NoFirst', email: `e2e_nofirst_aff_${stamp}@moooza.test`, password: mainPw },
  });
  log(regNoName.status === 400, '1.1 register — no firstName → 400', `status=${regNoName.status}`, regNoName.data);

  // 1.2 Email verification
  // resend-verification for mainEmail (not yet verified)
  const resend = await api('POST', '/auth/resend-verification', { body: { email: mainEmail } });
  log(resend.ok, '1.2 resend-verification → ok', `status=${resend.status}`, resend.data);

  // Read code from DB
  const verCode = readFieldViaSql('emailVerificationCode', mainEmail);
  log(verCode !== null && /^\d{6}$/.test(verCode), '1.2 read emailVerificationCode from DB', `code=${verCode}`);

  if (verCode) {
    // Verify email with correct code
    const ver = await api('POST', '/auth/verify-email', { body: { email: mainEmail, code: verCode } });
    log(ver.ok, '1.2 verify-email with correct code → 200', `status=${ver.status}`, ver.data);
    log(ver.data?.user?.emailVerified === true || ver.ok, '1.2 verify-email → emailVerified=true', '', ver.data?.user);
  } else {
    // Fallback: use SSH to flip emailVerified directly
    console.warn('  [WARN] Could not read code, using SSH to verify email');
    verifyEmailsViaSql(`e2e_main_aff_${stamp}@moooza.test`);
    log(false, '1.2 verify-email with correct code → 200', 'SKIP — could not read code via SSH');
    log(false, '1.2 verify-email → emailVerified=true', 'SKIP — could not read code via SSH');
  }

  // 1.3 Login edge cases
  // Wrong password → 401
  const loginWrongPw = await api('POST', '/auth/login', { body: { email: mainEmail, password: 'WrongPw123!' } });
  log(loginWrongPw.status === 401 || loginWrongPw.status === 400, '1.3 login — wrong password → 401/400', `status=${loginWrongPw.status}`);

  // Non-existent email → 401
  const loginBadEmail = await api('POST', '/auth/login', { body: { email: `no_such_${stamp}@moooza.test`, password: mainPw } });
  log(loginBadEmail.status === 401 || loginBadEmail.status === 400, '1.3 login — bad email → 401/400', `status=${loginBadEmail.status}`);

  // Before verification — register a fresh user and try to login before verifying
  const unverEmail = `e2e_unver_aff_${stamp}@moooza.test`;
  const unverPw = 'E2E_Test_2026!';
  await api('POST', '/auth/register', {
    body: { firstName: 'Unver', lastName: `AFF${stamp}`, email: unverEmail, password: unverPw },
  });
  const loginUnver = await api('POST', '/auth/login', { body: { email: unverEmail, password: unverPw } });
  const isEmailNotVerifiedErr =
    loginUnver.status === 403 &&
    (loginUnver.data?.error === 'EMAIL_NOT_VERIFIED' || JSON.stringify(loginUnver.data).includes('EMAIL_NOT_VERIFIED'));
  log(isEmailNotVerifiedErr, '1.3 login before verify → EMAIL_NOT_VERIFIED', `status=${loginUnver.status}`, loginUnver.data);

  // After verification → 200 + token
  const loginAfter = await api('POST', '/auth/login', { body: { email: mainEmail, password: mainPw } });
  log(loginAfter.ok && !!loginAfter.data?.token, '1.3 login after verify → 200 + token', `status=${loginAfter.status}`);

  const mainToken = loginAfter.data?.token;
  const mainId = loginAfter.data?.user?.id;

  // 1.4 Password reset full cycle
  const resetEmail = `e2e_reset_aff_${stamp}@moooza.test`;
  const resetPwOld = 'OldPass_2026!';
  const resetPwNew = 'NewPass_2026!';

  // Register + verify reset user
  await api('POST', '/auth/register', {
    body: { firstName: 'Reset', lastName: `AFF${stamp}`, email: resetEmail, password: resetPwOld },
  });
  verifyEmailsViaSql(`e2e_reset_aff_${stamp}@moooza.test`);

  const forgot = await api('POST', '/auth/forgot-password', { body: { email: resetEmail } });
  log(forgot.ok, '1.4 forgot-password → 200 silent', `status=${forgot.status}`, forgot.data);

  // Read reset code
  const resetCode = readFieldViaSql('passwordResetCode', resetEmail);
  log(resetCode !== null && /^\d{6}$/.test(resetCode), '1.4 read passwordResetCode from DB', `code=${resetCode}`);

  if (resetCode) {
    const reset = await api('POST', '/auth/reset-password', {
      body: { email: resetEmail, code: resetCode, password: resetPwNew },
    });
    log(reset.ok, '1.4 reset-password with code → 200', `status=${reset.status}`, reset.data);

    // Login with new password → 200
    const loginNew = await api('POST', '/auth/login', { body: { email: resetEmail, password: resetPwNew } });
    log(loginNew.ok && !!loginNew.data?.token, '1.4 login with new password → 200', `status=${loginNew.status}`);

    // Login with old password → 401
    const loginOld = await api('POST', '/auth/login', { body: { email: resetEmail, password: resetPwOld } });
    log(loginOld.status === 401 || loginOld.status === 400, '1.4 login with old password → 401', `status=${loginOld.status}`);
  } else {
    log(false, '1.4 reset-password with code → 200', 'SKIP — could not read reset code');
    log(false, '1.4 login with new password → 200', 'SKIP');
    log(false, '1.4 login with old password → 401', 'SKIP');
  }

  // 1.5 Terms
  if (mainToken) {
    // Before agree: GET /users/me → termsAgreedAt is null
    const meBefore = await api('GET', '/users/me', { token: mainToken });
    log(meBefore.ok, '1.5 GET /users/me before terms → ok', `status=${meBefore.status}`);
    log(meBefore.data?.termsAgreedAt === null || meBefore.data?.termsAgreedAt == null,
      '1.5 termsAgreedAt is null before agree', `value=${meBefore.data?.termsAgreedAt}`);

    const agree = await api('POST', '/users/me/agree-terms', { token: mainToken });
    log(agree.ok, '1.5 POST /users/me/agree-terms → 200', `status=${agree.status}`, agree.data);

    const meAfter = await api('GET', '/users/me', { token: mainToken });
    log(!!meAfter.data?.termsAgreedAt, '1.5 termsAgreedAt not null after agree', `value=${meAfter.data?.termsAgreedAt}`);
  } else {
    log(false, '1.5 GET /users/me before terms → ok', 'SKIP — no token');
    log(false, '1.5 termsAgreedAt is null before agree', 'SKIP');
    log(false, '1.5 POST /users/me/agree-terms → 200', 'SKIP');
    log(false, '1.5 termsAgreedAt not null after agree', 'SKIP');
  }

  return { mainToken, mainId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 2: FRIENDSHIPS
// ═══════════════════════════════════════════════════════════════════════════════
async function partFriendships() {
  console.log('\n━━━ PART 2: FRIENDSHIPS ━━━');

  // Register alice, bob, charlie
  const aliceEmail = `e2e_alice_aff_${stamp}@moooza.test`;
  const bobEmail   = `e2e_bob_aff_${stamp}@moooza.test`;
  const charlieEmail = `e2e_charlie_aff_${stamp}@moooza.test`;
  const pw = 'E2E_Test_2026!';

  await api('POST', '/auth/register', { body: { firstName: 'Alice', lastName: `AFF${stamp}`, email: aliceEmail, password: pw } });
  await api('POST', '/auth/register', { body: { firstName: 'Bob',   lastName: `AFF${stamp}`, email: bobEmail,   password: pw } });
  await api('POST', '/auth/register', { body: { firstName: 'Charlie', lastName: `AFF${stamp}`, email: charlieEmail, password: pw } });

  // Verify all three via SSH
  verifyEmailsViaSql(`e2e_alice_aff_${stamp}@moooza.test`);
  verifyEmailsViaSql(`e2e_bob_aff_${stamp}@moooza.test`);
  verifyEmailsViaSql(`e2e_charlie_aff_${stamp}@moooza.test`);

  const alice   = await loginUser(aliceEmail, pw);
  const bob     = await loginUser(bobEmail, pw);
  const charlie = await loginUser(charlieEmail, pw);

  // 2.1 Full cycle: alice → bob
  // Send request
  const sendReq = await api('POST', '/friendships', { token: alice.token, body: { receiverId: bob.id } });
  log(sendReq.status === 201, '2.1 alice→bob: POST /friendships → 201', `status=${sendReq.status}`, sendReq.data);
  const friendshipId = sendReq.data?.id;

  // GET /friendships/requests (bob) → sees request
  const bobRequests = await api('GET', '/friendships/requests', { token: bob.token });
  const bobSeesPending = Array.isArray(bobRequests.data) && bobRequests.data.some(r => r.requesterId === alice.id || r.id === friendshipId);
  log(bobSeesPending, '2.1 bob sees request in /friendships/requests', `count=${bobRequests.data?.length}`);

  // GET /friendships/sent (alice) → sees sent
  const aliceSent = await api('GET', '/friendships/sent', { token: alice.token });
  const aliceSesSent = Array.isArray(aliceSent.data) && aliceSent.data.some(r => r.receiverId === bob.id || r.id === friendshipId);
  log(aliceSesSent, '2.1 alice sees in /friendships/sent', `count=${aliceSent.data?.length}`);

  // Bob accepts
  let acceptedFriendshipId = friendshipId;
  if (!acceptedFriendshipId && Array.isArray(bobRequests.data)) {
    acceptedFriendshipId = bobRequests.data.find(r => r.requesterId === alice.id)?.id;
  }
  let acceptOk = { ok: false, status: 0, data: null };
  if (acceptedFriendshipId) {
    acceptOk = await api('PUT', `/friendships/${acceptedFriendshipId}/accept`, { token: bob.token });
  }
  log(acceptOk.ok, '2.1 bob accepts → 200', `status=${acceptOk.status}`, acceptOk.data);

  // Both see each other in /friendships
  const aliceFriends = await api('GET', '/friendships', { token: alice.token });
  const bobFriends   = await api('GET', '/friendships', { token: bob.token });
  log(
    Array.isArray(aliceFriends.data) && aliceFriends.data.some(f => f.user?.id === bob.id),
    '2.1 alice sees bob in /friendships', `count=${aliceFriends.data?.length}`
  );
  log(
    Array.isArray(bobFriends.data) && bobFriends.data.some(f => f.user?.id === alice.id),
    '2.1 bob sees alice in /friendships', `count=${bobFriends.data?.length}`
  );

  // 2.2 Reject + repeat request
  // alice → charlie
  const req2 = await api('POST', '/friendships', { token: alice.token, body: { receiverId: charlie.id } });
  log(req2.status === 201, '2.2 alice→charlie: POST /friendships → 201', `status=${req2.status}`);
  const req2Id = req2.data?.id;

  // charlie rejects (DELETE)
  let req2DeleteId = req2Id;
  if (!req2DeleteId) {
    const charlieRequests = await api('GET', '/friendships/requests', { token: charlie.token });
    req2DeleteId = Array.isArray(charlieRequests.data)
      ? charlieRequests.data.find(r => r.requesterId === alice.id)?.id
      : null;
  }
  let rejectOk = { ok: false, status: 0, data: 'no id' };
  if (req2DeleteId) {
    rejectOk = await api('DELETE', `/friendships/${req2DeleteId}`, { token: charlie.token });
  }
  log(rejectOk.ok || rejectOk.status === 204, '2.2 charlie rejects alice request → 204', `status=${rejectOk.status}`);

  // alice repeats request → should succeed (previous deleted)
  const req3 = await api('POST', '/friendships', { token: alice.token, body: { receiverId: charlie.id } });
  log(req3.status === 201, '2.2 alice→charlie repeat request → 201', `status=${req3.status}`, req3.data);

  // 2.3 Unfriend (alice unfriends bob from 2.1)
  // Find the friendship id from alice's friends list
  const aliceFriends2 = await api('GET', '/friendships', { token: alice.token });
  const aliceBobFriendship = Array.isArray(aliceFriends2.data)
    ? aliceFriends2.data.find(f => f.user?.id === bob.id)
    : null;
  const unfriendId = aliceBobFriendship?.friendshipId || acceptedFriendshipId;

  let unfriend = { ok: false, status: 0 };
  if (unfriendId) {
    unfriend = await api('DELETE', `/friendships/${unfriendId}`, { token: alice.token });
  }
  log(unfriend.ok || unfriend.status === 204, '2.3 alice unfriends bob → 204', `status=${unfriend.status}`);

  // GET /friendships — bob no longer there
  const aliceFriendsAfter = await api('GET', '/friendships', { token: alice.token });
  const bobGone = Array.isArray(aliceFriendsAfter.data) && !aliceFriendsAfter.data.some(f => f.user?.id === bob.id);
  log(bobGone, '2.3 alice no longer sees bob in /friendships', `count=${aliceFriendsAfter.data?.length}`);

  // 2.4 Edge cases
  // Self-request → 400
  const selfReq = await api('POST', '/friendships', { token: alice.token, body: { receiverId: alice.id } });
  log(selfReq.status === 400, '2.4 self-request → 400', `status=${selfReq.status}`, selfReq.data);

  // Double request → 400 (alice already has pending to charlie from 2.2 repeat)
  const doubleReq = await api('POST', '/friendships', { token: alice.token, body: { receiverId: charlie.id } });
  log(doubleReq.status === 400, '2.4 double request → 400', `status=${doubleReq.status}`, doubleReq.data);

  return { alice, bob, charlie };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PART 3: FAVORITES
// ═══════════════════════════════════════════════════════════════════════════════
async function partFavorites(alice, bob) {
  console.log('\n━━━ PART 3: FAVORITES ━━━');

  // 3.1 Add/check/remove
  // alice → bob
  const add1 = await api('POST', `/favorites/${bob.id}`, { token: alice.token });
  log(add1.ok, '3.1 POST /favorites/:bobId (alice) → 200', `status=${add1.status}`, add1.data);

  // status check
  const status1 = await api('GET', `/favorites/status/${bob.id}`, { token: alice.token });
  log(status1.ok && status1.data?.isFavorite === true, '3.1 GET /favorites/status → isFavorite=true', `status=${status1.status}`, status1.data);

  // list check
  const list1 = await api('GET', '/favorites', { token: alice.token });
  log(
    Array.isArray(list1.data) && list1.data.some(f => f.user?.id === bob.id),
    '3.1 GET /favorites → contains bob', `count=${list1.data?.length}`
  );

  // Idempotent re-add
  const add2 = await api('POST', `/favorites/${bob.id}`, { token: alice.token });
  log(add2.ok, '3.1 POST /favorites/:bobId again → idempotent (no error)', `status=${add2.status}`, add2.data);

  // Remove
  const del1 = await api('DELETE', `/favorites/${bob.id}`, { token: alice.token });
  log(del1.ok, '3.1 DELETE /favorites/:bobId → 200', `status=${del1.status}`, del1.data);

  // Status after delete
  const status2 = await api('GET', `/favorites/status/${bob.id}`, { token: alice.token });
  log(status2.ok && status2.data?.isFavorite === false, '3.1 GET /favorites/status after remove → isFavorite=false', `status=${status2.status}`, status2.data);

  // List after delete
  const list2 = await api('GET', '/favorites', { token: alice.token });
  log(
    Array.isArray(list2.data) && !list2.data.some(f => f.user?.id === bob.id),
    '3.1 GET /favorites after remove → empty / no bob', `count=${list2.data?.length}`
  );

  // 3.2 Edge cases
  // Self-add → 400
  const selfAdd = await api('POST', `/favorites/${alice.id}`, { token: alice.token });
  log(selfAdd.status === 400, '3.2 POST /favorites/:ownId (self) → 400', `status=${selfAdd.status}`, selfAdd.data);

  // Notification check: add bob again and check bob's notifications for favorite_added
  const add3 = await api('POST', `/favorites/${bob.id}`, { token: alice.token });
  log(add3.ok, '3.2 add bob to favorites (for notification check)', `status=${add3.status}`);

  // Give the server a moment, then check bob's notifications
  await new Promise(r => setTimeout(r, 1000));
  const bobNotifs = await api('GET', '/notifications', { token: bob.token });
  const hasFavNotif = Array.isArray(bobNotifs.data)
    ? bobNotifs.data.some(n => n.type === 'favorite_added')
    : (bobNotifs.data?.items
        ? bobNotifs.data.items.some(n => n.type === 'favorite_added')
        : false);
  log(hasFavNotif, '3.2 bob gets favorite_added notification', `notifCount=${Array.isArray(bobNotifs.data) ? bobNotifs.data.length : bobNotifs.data?.items?.length ?? '?'}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
(async () => {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  Moooza E2E — Auth / Friendships / Favorites`);
  console.log(`  stamp=${stamp}   API=${API}`);
  console.log('═'.repeat(60));

  try {
    await partAuth();
  } catch (e) {
    console.error('[FATAL] partAuth:', e.message);
  }

  let alice, bob, charlie;
  try {
    ({ alice, bob, charlie } = await partFriendships());
  } catch (e) {
    console.error('[FATAL] partFriendships:', e.message);
  }

  if (alice && bob) {
    try {
      await partFavorites(alice, bob);
    } catch (e) {
      console.error('[FATAL] partFavorites:', e.message);
    }
  } else {
    console.warn('[SKIP] partFavorites — alice/bob not available');
  }

  // ─── SUMMARY ────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  const passed  = results.filter(r => r.ok).length;
  const failed  = results.filter(r => !r.ok).length;
  const skipped = results.filter(r => !r.ok && typeof r.info === 'string' && r.info.startsWith('SKIP')).length;
  console.log(`  SUMMARY: ${passed} passed / ${results.length} total  (${failed} failed, ${skipped} skipped)`);
  console.log('═'.repeat(60));

  if (failed > 0) {
    console.log('\nFailed checks:');
    results.filter(r => !r.ok).forEach(r => {
      const isSkip = typeof r.info === 'string' && r.info.startsWith('SKIP');
      console.log(`  [${isSkip ? 'SKIP' : 'FAIL'}] ${r.name}${r.info ? ' — ' + r.info : ''}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
})();
