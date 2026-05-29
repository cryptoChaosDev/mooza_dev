// E2E tests: Channels and Groups full coverage
// Covers: channels CRUD, posts in channels, subscriptions, admin groups, user groups
//
// Run: node tests/e2e/channels_groups.mjs

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
    `[${tag}] ${name}${info ? ' — ' + info : ''}` +
    (!ok && details ? '\n        ↪ ' + JSON.stringify(details).slice(0, 250) : '')
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

function runSql(sql) {
  try {
    const b64 = Buffer.from(sql).toString('base64');
    const cmd = `plink -batch -pw "${PLINK_PW}" ${VPS} "echo ${b64} | base64 -d | docker exec -i mooza-postgres psql -U ${DBUSER} -d ${DBNAME}"`;
    const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return out;
  } catch (e) {
    console.warn('SSH SQL failed:', e.message);
    return '';
  }
}

function verifyEmailsViaSql(emailPattern) {
  const out = runSql(`UPDATE "User" SET "emailVerified" = true WHERE email LIKE '${emailPattern}';`);
  return out.includes('UPDATE');
}

async function registerAndLogin(firstName, suffix) {
  const email = `e2e_${suffix}_cg_${stamp}@moooza.test`;
  const password = 'E2E_Test_2026!';
  const r = await api('POST', '/auth/register', {
    body: { firstName, lastName: stamp, email, password, role: 'musician', city: 'Moscow' },
  });
  if (!r.ok && r.status !== 409) throw new Error(`register ${suffix}: ${JSON.stringify(r.data)}`);
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

// ─────────────────────────────────────────────────────────────────────────────
// SETUP: register alice, bob, admin
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━ SETUP: registering users ━━━');

const { email: aliceEmail, password: alicePw } = await registerAndLogin('Alice', 'alice');
const { email: bobEmail, password: bobPw } = await registerAndLogin('Bob', 'bob');
const { email: adminEmail, password: adminPw } = await registerAndLogin('Admin', 'admin');

// Verify emails + grant admin via SQL
const emailPattern = `e2e_%_cg_${stamp}@moooza.test`;
const verified = verifyEmailsViaSql(emailPattern);
console.log(`SSH email verify: ${verified ? 'OK' : 'WARN (may fail logins)'}`);

// Grant admin
const adminSql = `UPDATE "User" SET "isAdmin" = true WHERE email = '${adminEmail}';`;
const adminOut = runSql(adminSql);
console.log(`SSH admin grant: ${adminOut.includes('UPDATE') ? 'OK' : 'WARN'}`);

const alice = await loginUser(aliceEmail, alicePw);
const bob = await loginUser(bobEmail, bobPw);
const adminUser = await loginUser(adminEmail, adminPw);

console.log(`alice id=${alice.id}  bob id=${bob.id}  admin id=${adminUser.id}`);

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: CHANNELS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━ PART 1: CHANNELS ━━━');

// 1.1 Create channel (alice)
let aliceChannelId;
{
  const r = await api('POST', '/channels', {
    token: alice.token,
    body: { name: `Alice CG ${stamp}`, description: 'E2E test channel' },
  });
  const ok = r.status === 201 && r.data?.id;
  log(ok, 'POST /channels — create', `status=${r.status}`, ok ? null : r.data);
  if (ok) aliceChannelId = r.data.id;
}

// 1.2 GET /channels/my — alice sees her channel
{
  const r = await api('GET', '/channels/my', { token: alice.token });
  const ok = r.ok && r.data?.id === aliceChannelId;
  log(ok, 'GET /channels/my — alice has channel', `id=${r.data?.id}`, ok ? null : r.data);
}

// 1.3 GET /channels/:id — fetch channel by id
{
  const r = await api('GET', `/channels/${aliceChannelId}`, { token: alice.token });
  const ok = r.ok && r.data?.id === aliceChannelId;
  log(ok, 'GET /channels/:id — fetch by id', `status=${r.status}`, ok ? null : r.data);
}

// 1.4 PUT /channels/my — update name/description
{
  const r = await api('PUT', '/channels/my', {
    token: alice.token,
    body: { name: `Alice CG Updated ${stamp}`, description: 'Updated desc' },
  });
  const ok = r.ok && r.data?.name?.includes('Updated');
  log(ok, 'PUT /channels/my — update', `status=${r.status}`, ok ? null : r.data);
}

// 1.5 Duplicate channel → 400
{
  const r = await api('POST', '/channels', {
    token: alice.token,
    body: { name: 'Duplicate attempt' },
  });
  const ok = r.status === 400;
  log(ok, 'POST /channels — duplicate → 400', `status=${r.status}`, ok ? null : r.data);
}

// 1.6 Create a separate channel (for delete test) — use bob
let deleteChannelId;
{
  const r = await api('POST', '/channels', {
    token: bob.token,
    body: { name: `Bob CG ${stamp}` },
  });
  const ok = r.status === 201 && r.data?.id;
  log(ok, 'POST /channels — bob creates channel for delete test', `status=${r.status}`, ok ? null : r.data);
  if (ok) deleteChannelId = r.data.id;
}

// 1.7 DELETE /channels/my — bob deletes his channel
{
  const r = await api('DELETE', '/channels/my', { token: bob.token });
  const ok = r.status === 204;
  log(ok, 'DELETE /channels/my — bob deletes channel', `status=${r.status}`, ok ? null : r.data);
}

// 1.8 Create post in alice's channel
let channelPostId;
{
  const r = await api('POST', '/posts', {
    token: alice.token,
    body: { content: `Channel post ${stamp}`, channelId: aliceChannelId },
  });
  const ok = r.ok && r.data?.id && r.data?.channelId === aliceChannelId;
  log(ok, 'POST /posts with channelId — create channel post', `status=${r.status}`, ok ? null : r.data);
  if (ok) channelPostId = r.data.id;
}

// 1.9 GET /channels/feed — alice sees her own channel in combined feed
{
  const r = await api('GET', '/channels/feed', { token: alice.token });
  const ok = r.ok && Array.isArray(r.data);
  const hasPost = ok && r.data.some(p => p.id === channelPostId);
  log(ok && hasPost, 'GET /channels/feed — alice sees own channel post', `count=${r.data?.length}`, (ok && hasPost) ? null : r.data?.slice(0, 2));
}

// 1.10 GET /channels/feed/mine — alice sees only her channel posts
{
  const r = await api('GET', '/channels/feed/mine', { token: alice.token });
  const ok = r.ok && Array.isArray(r.data);
  const hasPost = ok && r.data.some(p => p.id === channelPostId);
  log(ok && hasPost, 'GET /channels/feed/mine — alice sees her channel post', `count=${r.data?.length}`, (ok && hasPost) ? null : { status: r.status, data: r.data?.slice(0, 2) });
}

// 1.11 bob subscribes to alice's channel
{
  const r = await api('POST', `/channels/${aliceChannelId}/subscribe`, { token: bob.token });
  const ok = r.ok && r.data?.subscribed === true;
  log(ok, 'POST /channels/:id/subscribe — bob subscribes to alice', `status=${r.status}`, ok ? null : r.data);
}

// 1.12 GET /channels/subscriptions (bob) — sees alice's channel
{
  const r = await api('GET', '/channels/subscriptions', { token: bob.token });
  const ok = r.ok && Array.isArray(r.data) && r.data.some(c => c.id === aliceChannelId);
  log(ok, "GET /channels/subscriptions — bob sees alice's channel", `count=${r.data?.length}`, ok ? null : r.data);
}

// 1.13 GET /channels/feed/subscribed (bob) — sees posts from alice's channel
{
  const r = await api('GET', '/channels/feed/subscribed', { token: bob.token });
  const ok = r.ok && Array.isArray(r.data) && r.data.some(p => p.id === channelPostId);
  log(ok, "GET /channels/feed/subscribed — bob sees alice's channel post", `count=${r.data?.length}`, ok ? null : { status: r.status, first: r.data?.slice(0, 2) });
}

// 1.14 GET /channels/my/subscribers (alice) — sees bob
{
  const r = await api('GET', '/channels/my/subscribers', { token: alice.token });
  const ok = r.ok && Array.isArray(r.data) && r.data.some(u => u.id === bob.id);
  log(ok, "GET /channels/my/subscribers — alice sees bob", `count=${r.data?.length}`, ok ? null : r.data);
}

// 1.15 Cannot subscribe to own channel
{
  const r = await api('POST', `/channels/${aliceChannelId}/subscribe`, { token: alice.token });
  const ok = r.status === 400;
  log(ok, 'POST /channels/:id/subscribe — own channel → 400', `status=${r.status}`, ok ? null : r.data);
}

// 1.16 GET /channels/:id — shows isSubscribed=true for bob
{
  const r = await api('GET', `/channels/${aliceChannelId}`, { token: bob.token });
  const ok = r.ok && r.data?.isSubscribed === true;
  log(ok, 'GET /channels/:id — isSubscribed=true for bob', `isSubscribed=${r.data?.isSubscribed}`, ok ? null : r.data);
}

// 1.17 DELETE /channels/:id/subscribe (bob unsubscribes)
{
  const r = await api('DELETE', `/channels/${aliceChannelId}/subscribe`, { token: bob.token });
  const ok = r.ok && r.data?.subscribed === false;
  log(ok, 'DELETE /channels/:id/subscribe — bob unsubscribes', `status=${r.status}`, ok ? null : r.data);
}

// 1.18 GET /channels/subscriptions (bob) — channel gone
{
  const r = await api('GET', '/channels/subscriptions', { token: bob.token });
  const ok = r.ok && Array.isArray(r.data) && !r.data.some(c => c.id === aliceChannelId);
  log(ok, "GET /channels/subscriptions — bob no longer subscribed", `count=${r.data?.length}`, ok ? null : r.data);
}

// 1.19 GET /channels/feed/subscribed (bob) — empty after unsubscribe
{
  const r = await api('GET', '/channels/feed/subscribed', { token: bob.token });
  const ok = r.ok && Array.isArray(r.data) && !r.data.some(p => p.id === channelPostId);
  log(ok, "GET /channels/feed/subscribed — empty after unsubscribe", `count=${r.data?.length}`, ok ? null : { status: r.status });
}

// 1.20 GET /channels/:id — 404 for nonexistent
{
  const r = await api('GET', '/channels/nonexistent-id-000', { token: alice.token });
  const ok = r.status === 404;
  log(ok, 'GET /channels/:id — 404 for nonexistent', `status=${r.status}`, ok ? null : r.data);
}

// 1.21 POST /channels — missing name → 400
{
  const r = await api('POST', '/channels', {
    token: adminUser.token,
    body: { description: 'no name' },
  });
  const ok = r.status === 400;
  log(ok, 'POST /channels — missing name → 400', `status=${r.status}`, ok ? null : r.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: GROUPS — admin endpoints
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━ PART 2: GROUPS (admin) ━━━');

// 2.1 GET /admin/groups — list
{
  const r = await api('GET', '/admin/groups', { token: adminUser.token });
  const ok = r.ok && Array.isArray(r.data);
  log(ok, 'GET /admin/groups — list', `status=${r.status} count=${r.data?.length}`, ok ? null : r.data);
}

// 2.2 Non-admin cannot access admin/groups
{
  const r = await api('GET', '/admin/groups', { token: alice.token });
  const ok = r.status === 403;
  log(ok, 'GET /admin/groups — non-admin → 403', `status=${r.status}`, ok ? null : r.data);
}

// 2.3 POST /admin/groups — create
let adminGroupId;
{
  const r = await api('POST', '/admin/groups', {
    token: adminUser.token,
    body: { name: `Admin Group ${stamp}`, type: 'GROUP', city: 'Moscow', description: 'E2E admin group' },
  });
  const ok = r.status === 201 && r.data?.id;
  log(ok, 'POST /admin/groups — create', `status=${r.status}`, ok ? null : r.data);
  if (ok) adminGroupId = r.data.id;
}

// 2.4 PUT /admin/groups/:id — update
{
  if (adminGroupId) {
    const r = await api('PUT', `/admin/groups/${adminGroupId}`, {
      token: adminUser.token,
      body: { name: `Admin Group Updated ${stamp}`, status: 'APPROVED' },
    });
    const ok = r.ok && r.data?.name?.includes('Updated');
    log(ok, 'PUT /admin/groups/:id — update', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'PUT /admin/groups/:id — skipped (no adminGroupId)', '');
  }
}

// 2.5 DELETE /admin/groups/:id
{
  if (adminGroupId) {
    const r = await api('DELETE', `/admin/groups/${adminGroupId}`, { token: adminUser.token });
    const ok = r.ok && r.data?.ok === true;
    log(ok, 'DELETE /admin/groups/:id — delete', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'DELETE /admin/groups/:id — skipped (no adminGroupId)', '');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 3: GROUPS — user-facing endpoints (routes/groups.ts)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━ PART 3: GROUPS (user) ━━━');

// 3.1 POST /groups — alice creates a group
let groupId;
let aliceOwnerMembershipId;
{
  const r = await api('POST', '/groups', {
    token: alice.token,
    body: { name: `Alice Band ${stamp}`, description: 'E2E band', city: 'Moscow', type: 'GROUP' },
  });
  const ok = r.status === 201 && r.data?.id;
  log(ok, 'POST /groups — alice creates group', `status=${r.status}`, ok ? null : r.data);
  if (ok) {
    groupId = r.data.id;
    // Find alice's owner membership
    const ownerMembership = r.data.userArtists?.find(m => m.user?.id === alice.id && m.isOwner);
    if (ownerMembership) aliceOwnerMembershipId = ownerMembership.id;
  }
}

// 3.2 POST /groups — missing name → 400
{
  const r = await api('POST', '/groups', {
    token: bob.token,
    body: { description: 'no name' },
  });
  const ok = r.status === 400;
  log(ok, 'POST /groups — missing name → 400', `status=${r.status}`, ok ? null : r.data);
}

// 3.3 GET /groups/my — alice sees her group
{
  const r = await api('GET', '/groups/my', { token: alice.token });
  const ok = r.ok && Array.isArray(r.data) && r.data.some(g => g.id === groupId);
  log(ok, 'GET /groups/my — alice sees her group', `count=${r.data?.length}`, ok ? null : r.data);
}

// 3.4 GET /groups/:id — fetch group by id
{
  if (groupId) {
    const r = await api('GET', `/groups/${groupId}`, { token: alice.token });
    const ok = r.ok && r.data?.id === groupId;
    log(ok, 'GET /groups/:id — fetch', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'GET /groups/:id — skipped (no groupId)', '');
  }
}

// 3.5 GET /groups/:id — 404 for nonexistent
{
  const r = await api('GET', '/groups/nonexistent-000', { token: alice.token });
  const ok = r.status === 404;
  log(ok, 'GET /groups/:id — 404 for nonexistent', `status=${r.status}`, ok ? null : r.data);
}

// 3.6 PATCH /groups/:id — alice (owner) edits group
{
  if (groupId) {
    const r = await api('PATCH', `/groups/${groupId}`, {
      token: alice.token,
      body: { name: `Alice Band Updated ${stamp}`, city: 'SPb' },
    });
    const ok = r.ok && r.data?.name?.includes('Updated');
    log(ok, 'PATCH /groups/:id — owner edits', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'PATCH /groups/:id — skipped', '');
  }
}

// 3.7 PATCH /groups/:id — bob (non-owner) cannot edit → 403
{
  if (groupId) {
    const r = await api('PATCH', `/groups/${groupId}`, {
      token: bob.token,
      body: { name: 'Bob hijack' },
    });
    const ok = r.status === 403;
    log(ok, 'PATCH /groups/:id — non-owner → 403', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'PATCH /groups/:id non-owner — skipped', '');
  }
}

// 3.8 POST /groups/:id/submit — submit for moderation (DRAFT → PENDING)
{
  if (groupId) {
    const r = await api('POST', `/groups/${groupId}/submit`, { token: alice.token });
    const ok = r.ok && r.data?.status === 'PENDING';
    log(ok, 'POST /groups/:id/submit — DRAFT→PENDING', `status=${r.status} groupStatus=${r.data?.status}`, ok ? null : r.data);
  } else {
    log(false, 'POST /groups/:id/submit — skipped', '');
  }
}

// 3.9 POST /groups/:id/submit — cannot submit twice → 400
{
  if (groupId) {
    const r = await api('POST', `/groups/${groupId}/submit`, { token: alice.token });
    const ok = r.status === 400;
    log(ok, 'POST /groups/:id/submit — double submit → 400', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'POST /groups/:id/submit double — skipped', '');
  }
}

// 3.10 POST /groups/:id/submit — non-owner → 403
{
  if (groupId) {
    const r = await api('POST', `/groups/${groupId}/submit`, { token: bob.token });
    const ok = r.status === 403;
    log(ok, 'POST /groups/:id/submit — non-owner → 403', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'POST /groups/:id/submit non-owner — skipped', '');
  }
}

// 3.11 GET /groups/invites — bob has no pending invites (empty array)
{
  const r = await api('GET', '/groups/invites', { token: bob.token });
  const ok = r.ok && Array.isArray(r.data);
  log(ok, 'GET /groups/invites — bob empty invites list', `count=${r.data?.length}`, ok ? null : r.data);
}

// 3.12 DELETE /groups/:id/leave — owner cannot leave without transfer → 400
{
  if (groupId) {
    const r = await api('DELETE', `/groups/${groupId}/leave`, { token: alice.token });
    const ok = r.status === 400 && r.data?.code === 'OWNER_MUST_TRANSFER';
    log(ok, 'DELETE /groups/:id/leave — owner cannot leave → 400 OWNER_MUST_TRANSFER', `status=${r.status} code=${r.data?.code}`, ok ? null : r.data);
  } else {
    log(false, 'DELETE /groups/:id/leave owner — skipped', '');
  }
}

// 3.13 DELETE /groups/:id/leave — non-member → 404
{
  if (groupId) {
    const r = await api('DELETE', `/groups/${groupId}/leave`, { token: bob.token });
    const ok = r.status === 404;
    log(ok, 'DELETE /groups/:id/leave — non-member → 404', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'DELETE /groups/:id/leave non-member — skipped', '');
  }
}

// 3.14 DELETE /groups/:id — non-owner cannot delete → 403
{
  if (groupId) {
    const r = await api('DELETE', `/groups/${groupId}`, { token: bob.token });
    const ok = r.status === 403;
    log(ok, 'DELETE /groups/:id — non-owner → 403', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'DELETE /groups/:id non-owner — skipped', '');
  }
}

// 3.15 DELETE /groups/:id — owner deletes
{
  if (groupId) {
    const r = await api('DELETE', `/groups/${groupId}`, { token: alice.token });
    const ok = r.ok && r.data?.ok === true;
    log(ok, 'DELETE /groups/:id — owner deletes', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'DELETE /groups/:id — skipped', '');
  }
}

// 3.16 GET /groups/:id — 404 after delete
{
  if (groupId) {
    const r = await api('GET', `/groups/${groupId}`, { token: alice.token });
    const ok = r.status === 404;
    log(ok, 'GET /groups/:id — 404 after delete', `status=${r.status}`, ok ? null : r.data);
  } else {
    log(false, 'GET /groups/:id after delete — skipped', '');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n━━━ SUMMARY ━━━');
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(`Passed ${passed}/${results.length}  (${failed} failed)`);

if (failed > 0) {
  console.log('\nFailed checks:');
  results.filter(r => !r.ok).forEach(r => {
    console.log(`  ✗ ${r.name}${r.info ? ' — ' + r.info : ''}`);
  });
}

process.exit(failed > 0 ? 1 : 0);
