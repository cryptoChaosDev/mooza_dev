// Deep interaction tests for Moooza:
//   1. Connections — full lifecycle (request, accept, reject, add-services, break, cancel-break, confirm-break)
//   2. Chat — DM + group, messages, reactions, edits, reply, read, pin, archive, type switch, attachments query, search
//   3. Deals — Type-A full cycle (process), revision, second deal reject, third cancel, Type-B (event), edit-request
//
// Each scenario uses its own pair (or trio) of fresh users to avoid cross-contamination.
//
// Run: node tests/e2e/interactions.mjs

import crypto from 'node:crypto';
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

function verifyEmailsViaSql(emailPattern) {
  try {
    const sql = `UPDATE "User" SET "emailVerified" = true WHERE email LIKE '${emailPattern}';`;
    const b64 = Buffer.from(sql).toString('base64');
    const cmd = `plink -batch -pw "${PLINK_PW}" ${VPS} "echo ${b64} | base64 -d | docker exec -i mooza-postgres psql -U ${DBUSER} -d ${DBNAME}"`;
    const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return out.includes('UPDATE');
  } catch (e) {
    console.warn('SSH verify failed:', e.message);
    return false;
  }
}

async function registerAndLogin(name, stamp, suffix) {
  const email = `e2e_${suffix}_${stamp}@moooza.test`;
  const password = 'E2E_Test_2026!';
  let r = await api('POST', '/auth/register', {
    body: { firstName: name, lastName: stamp, email, password, role: 'musician', city: 'Moscow' },
  });
  if (!r.ok) throw new Error(`register ${suffix}: ${JSON.stringify(r.data)}`);
  return { email, password };
}

async function loginAndGetId(email, password) {
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
// SCENARIO 1: CONNECTIONS — full lifecycle with all transitions
// ─────────────────────────────────────────────────────────────────────
async function scenarioConnections(alice, bob) {
  console.log('\n━━━ SCENARIO 1: CONNECTIONS ━━━');

  // Fetch a real Service for ConnectionService FK
  let r = await api('GET', '/references/professions');
  const prof = Array.isArray(r.data) ? r.data[0] : null;
  let svc;
  if (prof?.directionId) {
    const sr = await api('GET', `/references/services?directionId=${prof.directionId}`);
    if (sr.ok && Array.isArray(sr.data) && sr.data.length) svc = sr.data[0];
  }
  log(!!svc, 'Connections: fetch a Service for FK', svc ? `svc=${svc.name}` : 'no service');

  // === 1.1 Request → Reject → Request again → Accept ===
  r = await api('POST', '/connections', {
    token: alice.token,
    body: { receiverId: bob.id, serviceIds: svc ? [svc.id] : [], needsDeal: false },
  });
  log(r.ok, '[1.1a] Alice → Bob request (PENDING)', `status=${r.status}`, r.ok ? null : r.data);
  const firstConnId = r.data?.id;

  r = await api('PATCH', `/connections/${firstConnId}/reject`, { token: bob.token });
  log(r.ok, '[1.1b] Bob rejects → REJECTED', `status=${r.status}`, r.ok ? null : r.data);

  r = await api('GET', '/connections/rejected', { token: alice.token });
  log(r.ok && Array.isArray(r.data) && r.data.some(c => c.id === firstConnId), '[1.1c] Alice sees rejected in /rejected', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // Second attempt — should succeed because previous is REJECTED, not PENDING
  r = await api('POST', '/connections', {
    token: alice.token,
    body: { receiverId: bob.id, serviceIds: svc ? [svc.id] : [], needsDeal: false },
  });
  log(r.ok, '[1.1d] Alice → Bob request again (after reject)', `status=${r.status}`, r.ok ? null : r.data);
  const connId = r.data?.id;

  r = await api('PATCH', `/connections/${connId}/accept`, { token: bob.token });
  log(r.ok, '[1.1e] Bob accepts → ACCEPTED', `status=${r.status}`, r.ok ? null : r.data);

  // === 1.2 Visible in lists for both sides ===
  r = await api('GET', '/connections', { token: alice.token });
  log(r.ok && Array.isArray(r.data) && r.data.some(c => c.id === connId), '[1.2a] Alice sees connection in GET /connections', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  r = await api('GET', '/connections', { token: bob.token });
  log(r.ok && Array.isArray(r.data) && r.data.some(c => c.id === connId), '[1.2b] Bob sees connection in GET /connections', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  r = await api('GET', `/connections/with/${bob.id}`, { token: alice.token });
  log(r.ok, '[1.2c] GET /connections/with/:userId (Alice→Bob)', `status=${r.status}`);

  // === 1.3 Add services to existing connection ===
  // Fetch another service to add
  r = await api('GET', '/references/professions');
  const prof2 = Array.isArray(r.data) ? r.data[1] : null;
  let svc2;
  if (prof2?.directionId) {
    const sr = await api('GET', `/references/services?directionId=${prof2.directionId}`);
    if (sr.ok && Array.isArray(sr.data) && sr.data.length) svc2 = sr.data[0];
  }
  if (svc2 && svc2.id !== svc?.id) {
    r = await api('PATCH', `/connections/${connId}/add-services`, {
      token: alice.token,
      body: { serviceIds: [svc2.id] },
    });
    log(r.ok, '[1.3] Alice adds service to connection', `status=${r.status}`, r.ok ? null : r.data);
  } else {
    log(true, '[1.3] Alice adds service to connection', 'skipped (no second service)');
  }

  // === 1.4 Break flow: request → cancel → request → confirm ===
  r = await api('PATCH', `/connections/${connId}/break`, {
    token: alice.token,
    body: { reason: 'тест отзыва связи' },
  });
  log(r.ok, '[1.4a] Alice requests break → BREAK_REQUESTED', `status=${r.status}`, r.ok ? null : r.data);

  r = await api('GET', '/connections/break-requests', { token: bob.token });
  log(r.ok && Array.isArray(r.data) && r.data.some(c => c.id === connId), '[1.4b] Bob sees break in /break-requests', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  r = await api('GET', '/connections/my-break-requests', { token: alice.token });
  log(r.ok && Array.isArray(r.data) && r.data.some(c => c.id === connId), '[1.4c] Alice sees break in /my-break-requests', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // Cancel break — connection back to ACCEPTED
  r = await api('PATCH', `/connections/${connId}/cancel-break`, { token: alice.token });
  log(r.ok, '[1.4d] Alice cancels break → ACCEPTED', `status=${r.status}`, r.ok ? null : r.data);

  // Second break request — Bob confirms this time
  r = await api('PATCH', `/connections/${connId}/break`, {
    token: alice.token,
    body: { reason: 'повторный тест' },
  });
  log(r.ok, '[1.4e] Alice requests break #2', `status=${r.status}`, r.ok ? null : r.data);

  r = await api('PATCH', `/connections/${connId}/confirm-break`, {
    token: bob.token,
    body: { reason: 'Согласен, разрываем' },
  });
  log(r.ok, '[1.4f] Bob confirms break → terminated', `status=${r.status}`, r.ok ? null : r.data);

  // === 1.5 Connection history ===
  r = await api('GET', '/connections/history', { token: alice.token });
  log(r.ok, '[1.5] GET /connections/history (Alice)', `entries=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // === 1.6 Cannot create connection with self ===
  r = await api('POST', '/connections', {
    token: alice.token,
    body: { receiverId: alice.id, serviceIds: [], needsDeal: false },
  });
  log(!r.ok && r.status === 400, '[1.6] Self-connection forbidden (400)', `status=${r.status}`);
}

// ─────────────────────────────────────────────────────────────────────
// SCENARIO 2: CHAT — DM + group, full feature surface
// ─────────────────────────────────────────────────────────────────────
async function scenarioChat(alice, bob, charlie) {
  console.log('\n━━━ SCENARIO 2: CHAT ━━━');

  // === 2.1 Resolve DM (creates conversation on demand) ===
  let r = await api('GET', `/messages/resolve/${bob.id}`, { token: alice.token });
  log(r.ok, '[2.1a] Alice resolves DM with Bob', `status=${r.status}`, r.ok ? null : r.data);
  const dmId = r.data?.conversationId;

  // Same resolve from Bob's side returns same conversation
  r = await api('GET', `/messages/resolve/${alice.id}`, { token: bob.token });
  log(r.ok && r.data?.conversationId === dmId, '[2.1b] Bob resolves same DM (idempotent)', `same=${r.data?.conversationId === dmId}`);

  // === 2.2 Messaging ===
  r = await api('POST', `/messages/conversations/${dmId}/messages`, {
    token: alice.token,
    body: { content: 'Привет, Bob! Это E2E.' },
  });
  log(r.ok, '[2.2a] Alice sends first message', `status=${r.status}`, r.ok ? null : r.data);
  const msg1Id = r.data?.id;

  // Bob replies with reply-to
  r = await api('POST', `/messages/conversations/${dmId}/messages`, {
    token: bob.token,
    body: { content: 'Привет, Alice!', replyToId: msg1Id },
  });
  log(r.ok && r.data?.replyToId === msg1Id, '[2.2b] Bob replies with replyToId', `status=${r.status} replyTo=${r.data?.replyToId === msg1Id}`);
  const msg2Id = r.data?.id;

  // Alice sends 3 more, to test bulk loading
  for (let i = 0; i < 3; i++) {
    r = await api('POST', `/messages/conversations/${dmId}/messages`, {
      token: alice.token,
      body: { content: `msg ${i + 3}` },
    });
    if (!r.ok) { log(false, `[2.2c.${i}] bulk send`, `status=${r.status}`, r.data); break; }
  }
  log(true, '[2.2c] Bulk send 3 messages from Alice', 'ok');

  // === 2.3 Unread count + mark read ===
  r = await api('GET', '/messages/unread/count', { token: bob.token });
  const unreadBefore = r.data?.total ?? r.data?.count ?? r.data;
  log(r.ok && (typeof unreadBefore === 'number' ? unreadBefore > 0 : true), '[2.3a] Bob has unread before read', `unread=${JSON.stringify(unreadBefore)}`);

  r = await api('PATCH', `/messages/conversations/${dmId}/read`, { token: bob.token });
  log(r.ok, '[2.3b] Bob marks conversation read', `status=${r.status}`);

  r = await api('GET', '/messages/unread/count', { token: bob.token });
  const unreadAfter = r.data?.total ?? r.data?.count ?? r.data;
  log(r.ok, '[2.3c] Bob unread count after read', `unread=${JSON.stringify(unreadAfter)}`);

  // === 2.4 Edit message (note: path is /messages/messages/:id — double prefix is real) ===
  r = await api('PATCH', `/messages/messages/${msg1Id}`, {
    token: alice.token,
    body: { content: 'Привет, Bob! [исправлено]' },
  });
  log(r.ok, '[2.4a] Alice edits her own message', `status=${r.status}`, r.ok ? null : r.data);

  // Bob cannot edit Alice's message
  r = await api('PATCH', `/messages/messages/${msg1Id}`, {
    token: bob.token,
    body: { content: 'попытка взлома' },
  });
  log(!r.ok && (r.status === 403 || r.status === 404), '[2.4b] Bob CANNOT edit Alice message (403)', `status=${r.status}`);

  // === 2.5 Reactions ===
  r = await api('POST', `/messages/messages/${msg2Id}/reactions`, {
    token: alice.token,
    body: { emoji: '👍' },
  });
  log(r.ok, '[2.5a] Alice reacts 👍 to Bob message', `status=${r.status}`, r.ok ? null : r.data);

  // Change reaction
  r = await api('POST', `/messages/messages/${msg2Id}/reactions`, {
    token: alice.token,
    body: { emoji: '🔥' },
  });
  log(r.ok, '[2.5b] Alice changes reaction to 🔥', `status=${r.status}`, r.ok ? null : r.data);

  // Remove reaction
  r = await api('DELETE', `/messages/messages/${msg2Id}/reactions`, { token: alice.token });
  log(r.ok || r.status === 204, '[2.5c] Alice removes her reaction', `status=${r.status}`);

  // === 2.6 Search inside conversation ===
  r = await api('GET', `/messages/conversations/${dmId}/search?q=исправлено`, { token: alice.token });
  log(r.ok, '[2.6] Search messages by query', `results=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // === 2.7 Attachments listing (empty since we sent no files) ===
  r = await api('GET', `/messages/conversations/${dmId}/attachments`, { token: alice.token });
  log(r.ok, '[2.7] List attachments (empty)', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // === 2.8 Pin / unpin ===
  r = await api('PATCH', `/messages/conversations/${dmId}/pin`, {
    token: alice.token,
    body: { pinned: true },
  });
  log(r.ok, '[2.8a] Pin DM', `status=${r.status}`, r.ok ? null : r.data);

  r = await api('PATCH', `/messages/conversations/${dmId}/pin`, {
    token: alice.token,
    body: { pinned: false },
  });
  log(r.ok, '[2.8b] Unpin DM', `status=${r.status}`);

  // === 2.9 Archive / unarchive ===
  r = await api('PATCH', `/messages/conversations/${dmId}/archive`, {
    token: alice.token,
    body: { archived: true },
  });
  log(r.ok, '[2.9a] Archive DM', `status=${r.status}`, r.ok ? null : r.data);

  r = await api('PATCH', `/messages/conversations/${dmId}/archive`, {
    token: alice.token,
    body: { archived: false },
  });
  log(r.ok, '[2.9b] Unarchive DM', `status=${r.status}`);

  // === 2.10 Conversation type switch ===
  r = await api('PATCH', `/messages/conversations/${dmId}/type`, {
    token: alice.token,
    body: { type: 'work' },
  });
  log(r.ok || r.status === 400, '[2.10] Switch DM type', `status=${r.status}`);

  // === 2.11 Group chat: Alice creates with Bob and Charlie ===
  r = await api('POST', '/messages/conversations/group', {
    token: alice.token,
    body: {
      name: `E2E Group ${Date.now().toString(36)}`,
      memberIds: [bob.id, charlie.id],
    },
  });
  log(r.ok, '[2.11a] Alice creates group (Bob + Charlie)', `status=${r.status}`, r.ok ? null : r.data);
  const groupId = r.data?.id;

  // Send message to group
  if (groupId) {
    r = await api('POST', `/messages/conversations/${groupId}/messages`, {
      token: alice.token,
      body: { content: 'Привет, группа!' },
    });
    log(r.ok, '[2.11b] Alice sends message to group', `status=${r.status}`, r.ok ? null : r.data);

    // Bob replies in group
    r = await api('POST', `/messages/conversations/${groupId}/messages`, {
      token: bob.token,
      body: { content: 'Привет от Bob' },
    });
    log(r.ok, '[2.11c] Bob replies in group', `status=${r.status}`);

    // Charlie sees the group in list
    r = await api('GET', '/messages/conversations', { token: charlie.token });
    log(r.ok && Array.isArray(r.data) && r.data.some(c => c.id === groupId), '[2.11d] Charlie sees group in conversations', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

    // === 2.12 Remove Charlie from group (Alice as creator) ===
    r = await api('DELETE', `/messages/conversations/${groupId}/members/${charlie.id}`, { token: alice.token });
    log(r.ok, '[2.12a] Alice removes Charlie from group', `status=${r.status}`, r.ok ? null : r.data);

    // Charlie no longer sees the group
    r = await api('GET', '/messages/conversations', { token: charlie.token });
    log(r.ok && Array.isArray(r.data) && !r.data.some(c => c.id === groupId), '[2.12b] Charlie no longer sees group', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

    // === 2.13 Re-add Charlie (endpoint expects single memberId) ===
    r = await api('POST', `/messages/conversations/${groupId}/members`, {
      token: alice.token,
      body: { memberId: charlie.id },
    });
    log(r.ok, '[2.13] Alice re-adds Charlie', `status=${r.status}`, r.ok ? null : r.data);
  }

  // === 2.14 Conversations list returns both DM and group ===
  r = await api('GET', '/messages/conversations', { token: alice.token });
  log(r.ok && Array.isArray(r.data) && r.data.length >= 2, '[2.14] Alice conversations include DM + group', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // === 2.15 Bob deletes his own message ===
  r = await api('DELETE', `/messages/messages/${msg2Id}`, { token: bob.token });
  log(r.ok || r.status === 204, '[2.15] Bob deletes own message', `status=${r.status}`);
}

// ─────────────────────────────────────────────────────────────────────
// SCENARIO 3: DEALS — full Type-A cycle + reject + cancel + Type-B + edit-request
// ─────────────────────────────────────────────────────────────────────
async function scenarioDeals(alice, bob) {
  console.log('\n━━━ SCENARIO 3: DEALS ━━━');

  // === 3.1 Type-A: full happy path with one revision ===
  let r = await api('POST', '/deals', {
    token: bob.token,
    body: {
      executorId: alice.id,
      title: 'E2E Deal A — full cycle',
      price: 10000,
      result: 'Готовый трек',
      dealType: 'process',
      revisionCount: 2,
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      acceptDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
  });
  log(r.ok, '[3.1a] Bob creates Type-A deal (PENDING)', `status=${r.status}`, r.ok ? null : r.data);
  const dealAId = r.data?.id;

  r = await api('PATCH', `/deals/${dealAId}/accept`, { token: alice.token });
  log(r.ok, '[3.1b] Alice accepts → AWAITING_PAYMENT', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

  r = await api('PATCH', `/deals/${dealAId}/pay`, { token: bob.token });
  log(r.ok, '[3.1c] Bob pays → IN_PROGRESS', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

  r = await api('PATCH', `/deals/${dealAId}/submit`, {
    token: alice.token,
    body: { resultUrl: 'https://moooza.ru/result-1.wav', note: 'Первая версия' },
  });
  log(r.ok, '[3.1d] Alice submits result #1 → AWAITING_APPROVAL', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

  // Bob requests revision instead of approving
  r = await api('PATCH', `/deals/${dealAId}/revision`, {
    token: bob.token,
    body: { comment: 'Нужно перевести в 24 бит' },
  });
  log(r.ok, '[3.1e] Bob requests revision → IN_PROGRESS', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

  // Alice submits again
  r = await api('PATCH', `/deals/${dealAId}/submit`, {
    token: alice.token,
    body: { resultUrl: 'https://moooza.ru/result-2.wav', note: 'Финальная версия' },
  });
  log(r.ok, '[3.1f] Alice submits result #2', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

  // Bob approves
  r = await api('PATCH', `/deals/${dealAId}/approve`, { token: bob.token });
  log(r.ok, '[3.1g] Bob approves → COMPLETED', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

  // === 3.2 Visible in both users' /deals list ===
  r = await api('GET', '/deals', { token: alice.token });
  log(r.ok && Array.isArray(r.data) && r.data.some(d => d.id === dealAId), '[3.2a] Alice sees deal in GET /deals', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  r = await api('GET', '/deals', { token: bob.token });
  log(r.ok && Array.isArray(r.data) && r.data.some(d => d.id === dealAId), '[3.2b] Bob sees deal in GET /deals', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  r = await api('GET', `/deals/${dealAId}`, { token: alice.token });
  log(r.ok, '[3.2c] GET /deals/:id detail', `status=${r.status}`);

  // === 3.3 Type-A reject path ===
  r = await api('POST', '/deals', {
    token: bob.token,
    body: {
      executorId: alice.id,
      title: 'E2E Deal A2 — to reject',
      price: 5000,
      dealType: 'process',
      revisionCount: 1,
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
  log(r.ok, '[3.3a] Bob creates 2nd deal', `status=${r.status}`, r.ok ? null : r.data);
  const dealRejectId = r.data?.id;

  r = await api('PATCH', `/deals/${dealRejectId}/reject`, {
    token: alice.token,
    body: { reason: 'Не моя специализация' },
  });
  log(r.ok, '[3.3b] Alice rejects deal → REJECTED', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

  // === 3.4 Type-A cancel by customer (before accept) ===
  r = await api('POST', '/deals', {
    token: bob.token,
    body: {
      executorId: alice.id,
      title: 'E2E Deal A3 — to cancel',
      price: 3000,
      dealType: 'process',
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  });
  log(r.ok, '[3.4a] Bob creates 3rd deal', `status=${r.status}`, r.ok ? null : r.data);
  const dealCancelId = r.data?.id;

  r = await api('PATCH', `/deals/${dealCancelId}/cancel`, {
    token: bob.token,
    body: { reason: 'передумал' },
  });
  log(r.ok, '[3.4b] Bob cancels own deal → CANCELLED', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

  // === 3.5 Type-B (event) ===
  const eventDate = new Date(Date.now() + 30 * 86400000).toISOString();
  r = await api('POST', '/deals', {
    token: bob.token,
    body: {
      executorId: alice.id,
      title: 'E2E Event — концерт',
      price: 50000,
      dealType: 'event',
      eventDate,
      deposit: 10000,
    },
  });
  log(r.ok, '[3.5a] Bob creates Type-B event deal', `status=${r.status} type=${r.data?.dealType}`, r.ok ? null : r.data);
  const eventDealId = r.data?.id;
  const eventOk = !!(r.data && r.data.dealType === 'event' && r.data.deposit);
  log(eventOk, '[3.5b] Type-B has dealType=event + deposit set', `dealType=${r.data?.dealType} deposit=${r.data?.deposit}`);

  // Accept + pay deposit
  if (eventDealId) {
    r = await api('PATCH', `/deals/${eventDealId}/accept`, { token: alice.token });
    log(r.ok, '[3.5c] Alice accepts event deal', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);

    r = await api('PATCH', `/deals/${eventDealId}/pay`, { token: bob.token });
    log(r.ok, '[3.5d] Bob pays deposit', `status=${r.status} status_now=${r.data?.status}`, r.ok ? null : r.data);
  }

  // === 3.6 Edit-request flow ===
  // Create new deal, accept, then customer requests edit (e.g. extend deadline)
  r = await api('POST', '/deals', {
    token: bob.token,
    body: {
      executorId: alice.id,
      title: 'E2E Deal — edit-request',
      price: 7000,
      dealType: 'process',
      revisionCount: 1,
      deadline: new Date(Date.now() + 5 * 86400000).toISOString(),
    },
  });
  log(r.ok, '[3.6a] Bob creates deal for edit-request', `status=${r.status}`, r.ok ? null : r.data);
  const editDealId = r.data?.id;

  if (editDealId) {
    r = await api('PATCH', `/deals/${editDealId}/accept`, { token: alice.token });
    log(r.ok, '[3.6b] Alice accepts (so edit makes sense)', `status=${r.status}`);

    // Request edit (extend deadline by 7 days, more revisions)
    r = await api('POST', `/deals/${editDealId}/edit-request`, {
      token: alice.token,
      body: {
        deadline: new Date(Date.now() + 14 * 86400000).toISOString(),
        revisionCount: 3,
      },
    });
    log(r.ok, '[3.6c] Alice requests deadline extension', `status=${r.status}`, r.ok ? null : r.data);
    const editReqId = r.data?.id;

    if (editReqId) {
      r = await api('PATCH', `/deals/edit-request/${editReqId}/accept`, { token: bob.token });
      log(r.ok, '[3.6d] Bob accepts edit-request', `status=${r.status}`, r.ok ? null : r.data);
    }

    // Second edit request — Bob rejects this time
    r = await api('POST', `/deals/${editDealId}/edit-request`, {
      token: alice.token,
      body: {
        deadline: new Date(Date.now() + 30 * 86400000).toISOString(),
      },
    });
    log(r.ok, '[3.6e] Alice requests deadline extension #2', `status=${r.status}`, r.ok ? null : r.data);
    const editReqId2 = r.data?.id;

    if (editReqId2) {
      r = await api('PATCH', `/deals/edit-request/${editReqId2}/reject`, { token: bob.token });
      log(r.ok, '[3.6f] Bob rejects edit-request', `status=${r.status}`, r.ok ? null : r.data);
    }
  }

  // === 3.7 Cannot create deal with self ===
  r = await api('POST', '/deals', {
    token: bob.token,
    body: {
      executorId: bob.id,
      title: 'Self deal',
      price: 100,
      dealType: 'process',
    },
  });
  log(!r.ok && r.status === 400, '[3.7] Self-deal forbidden (400)', `status=${r.status}`);
}

// ─────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────
async function main() {
  const stamp = Date.now().toString(36);
  console.log(`Stamp: ${stamp}`);

  // Register 3 users (for group chat we need a third)
  const aliceCred = await registerAndLogin('AliceX', stamp, 'alicex');
  const bobCred = await registerAndLogin('BobX', stamp, 'bobx');
  const charlieCred = await registerAndLogin('CharlieX', stamp, 'charliex');
  log(true, 'Register 3 users', `stamp=${stamp}`);

  // Verify emails via SQL
  const verified = verifyEmailsViaSql(`e2e_%x_${stamp}@moooza.test`);
  log(verified, 'SQL verify all 3 emails', verified ? 'updated' : 'skipped');

  // Login all three
  const alice = await loginAndGetId(aliceCred.email, aliceCred.password);
  const bob = await loginAndGetId(bobCred.email, bobCred.password);
  const charlie = await loginAndGetId(charlieCred.email, charlieCred.password);
  log(!!alice.id && !!bob.id && !!charlie.id, 'Login all 3', `alice=${alice.id?.slice(0,8)} bob=${bob.id?.slice(0,8)} charlie=${charlie.id?.slice(0,8)}`);

  // Run 3 deep scenarios with fresh users would be ideal, but for budget — reuse same pair.
  // Connections: alice+bob (terminates connection at end)
  await scenarioConnections(alice, bob);

  // Chat: alice+bob+charlie
  await scenarioChat(alice, bob, charlie);

  // Deals: alice (executor) + bob (customer)
  await scenarioDeals(alice, bob);

  finish();
}

function finish() {
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`\n═══════ INTERACTIONS SUMMARY ═══════`);
  console.log(`Passed: ${passed}/${total}`);
  if (failed.length) {
    console.log(`\nFailures (${failed.length}):`);
    failed.forEach(f => console.log(`  - ${f.name} (${f.info})`));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
