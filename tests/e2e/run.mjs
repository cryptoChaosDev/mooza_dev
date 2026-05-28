// E2E smoke test for Moooza. Hits the live API directly.
// Auto-verifies email via SSH+psql so login works.

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
  console.log(`[${tag}] ${name}${info ? ' — ' + info : ''}${!ok && details ? '\n        ↪ ' + JSON.stringify(details).slice(0, 200) : ''}`);
};

async function api(method, path, { token, body, isForm } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  let data;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

function verifyEmailsViaSql(emailPattern) {
  try {
    // We base64-encode SQL to avoid quoting issues entirely.
    // Single-line remote command, no nested quotes.
    const sql = `UPDATE "User" SET "emailVerified" = true WHERE email LIKE '${emailPattern}';`;
    const b64 = Buffer.from(sql).toString('base64');
    // plink sends one string; remote bash sees: echo <b64> | base64 -d | docker exec -i ... psql ...
    const remote = `echo ${b64} | base64 -d | docker exec -i mooza-postgres psql -U ${DBUSER} -d ${DBNAME}`;
    const cmd = `plink -batch -pw "${PLINK_PW}" ${VPS} "${remote}"`;
    const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe' });
    return out.includes('UPDATE');
  } catch (e) {
    console.warn('SSH verify failed:', e.message);
    return false;
  }
}

async function main() {
  const stamp = Date.now().toString(36);
  const aliceEmail = `e2e_alice_${stamp}@moooza.test`;
  const bobEmail = `e2e_bob_${stamp}@moooza.test`;
  const password = 'E2E_Test_2026!';

  // ── Registration ──────────────────────────────────────────────
  let r = await api('POST', '/auth/register', {
    body: {
      firstName: 'AliceE2E',
      lastName: stamp,
      email: aliceEmail,
      password,
      role: 'musician',
      city: 'Moscow',
    },
  });
  log(r.ok, 'Register Alice', `status=${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(r.data)); return finish(); }
  const alice = { token: r.data.token, id: r.data.user?.id || r.data.id, email: aliceEmail };
  console.log('  ↪ Alice id:', alice.id, ' token?', !!alice.token);

  r = await api('POST', '/auth/register', {
    body: {
      firstName: 'BobE2E',
      lastName: stamp,
      email: bobEmail,
      password,
      role: 'musician',
      city: 'SaintPetersburg',
    },
  });
  log(r.ok, 'Register Bob', `status=${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(r.data)); return finish(); }
  const bob = { token: r.data.token, id: r.data.user?.id || r.data.id, email: bobEmail };
  console.log('  ↪ Bob id:', bob.id, ' token?', !!bob.token);

  // ── Auto-verify both emails via SQL ────────────────────────────
  const verified = verifyEmailsViaSql(`e2e_%_${stamp}@moooza.test`);
  log(verified, 'SQL verify emails', verified ? 'updated' : 'skipped');

  // ── Login ─────────────────────────────────────────────────────
  r = await api('POST', '/auth/login', { body: { email: aliceEmail, password } });
  log(r.ok, 'Login Alice', `status=${r.status}`);
  if (r.ok) {
    alice.token = r.data.token;
    alice.id = r.data.user?.id || r.data.id || alice.id;
  }

  r = await api('POST', '/auth/login', { body: { email: bobEmail, password } });
  log(r.ok, 'Login Bob', `status=${r.status}`);
  if (r.ok) {
    bob.token = r.data.token;
    bob.id = r.data.user?.id || r.data.id || bob.id;
  }

  // Backfill IDs from /users/me if still missing
  if (!alice.id) {
    const me = await api('GET', '/users/me', { token: alice.token });
    alice.id = me.data?.id;
  }
  if (!bob.id) {
    const me = await api('GET', '/users/me', { token: bob.token });
    bob.id = me.data?.id;
  }
  console.log(`  ↪ Resolved IDs: alice=${alice.id} bob=${bob.id}`);

  // ── Forgot/reset password flow ────────────────────────────────
  r = await api('POST', '/auth/forgot-password', { body: { email: aliceEmail } });
  log(r.ok, 'Forgot-password Alice', `status=${r.status}`);

  // ── Profile fetch (GET /users/me) ─────────────────────────────
  r = await api('GET', '/users/me', { token: alice.token });
  log(r.ok, 'GET /users/me Alice', `status=${r.status}`);

  // ── Update profile (PUT /users/me) ────────────────────────────
  r = await api('PUT', '/users/me', {
    token: alice.token,
    body: { bio: 'E2E test bio', occupancyStatus: 'AVAILABLE' },
  });
  log(r.ok, 'Update Alice profile', `status=${r.status}`);

  // ── Catalog ───────────────────────────────────────────────────
  r = await api('GET', '/references/professions');
  log(r.ok, 'GET /references/professions', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);
  const allProfessions = Array.isArray(r.data) ? r.data : [];

  r = await api('GET', '/references/directions');
  log(r.ok, 'GET /references/directions', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  r = await api('GET', '/references/genres');
  log(r.ok, 'GET /references/genres', `status=${r.status}`);

  // ── Feed (load posts) ─────────────────────────────────────────
  r = await api('GET', '/posts/feed', { token: alice.token });
  log(r.ok, 'GET /posts/feed', `status=${r.status}`);

  // ── Alice creates blog post ───────────────────────────────────
  r = await api('POST', '/posts', {
    token: alice.token,
    body: { content: `E2E post from Alice ${stamp}`, type: 'blog' },
  });
  log(r.ok, 'Alice creates blog post', `status=${r.status}`);
  const alicePost = r.data;

  // ── Alice creates poll ────────────────────────────────────────
  r = await api('POST', '/posts', {
    token: alice.token,
    body: {
      content: 'Какой стиль лучше?',
      type: 'poll',
      pollOptions: ['Rock', 'Jazz', 'Electronic'],
      pollEndsAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  log(r.ok, 'Alice creates poll', `status=${r.status}`);
  const alicePoll = r.data;

  // ── Alice creates employment post ─────────────────────────────
  r = await api('POST', '/posts', {
    token: alice.token,
    body: {
      content: 'Ищу группу для совместных репетиций',
      type: 'employment',
      employmentStatus: 'LOOKING',
    },
  });
  log(r.ok, 'Alice creates employment post', `status=${r.status}`);

  // ── Bob interacts with Alice's blog post ──────────────────────
  if (alicePost?.id) {
    r = await api('POST', `/posts/${alicePost.id}/like`, { token: bob.token });
    log(r.ok, 'Bob likes Alice post', `status=${r.status}`);

    r = await api('POST', `/posts/${alicePost.id}/comments`, {
      token: bob.token,
      body: { content: 'Отличный пост! E2E' },
    });
    log(r.ok, 'Bob comments Alice post', `status=${r.status}`);
    const bobComment = r.data;

    if (bobComment?.id) {
      r = await api('POST', `/posts/${alicePost.id}/comments`, {
        token: alice.token,
        body: { content: 'Спасибо за комментарий!', parentCommentId: bobComment.id },
      });
      log(r.ok, 'Alice replies to Bob comment', `status=${r.status}`);
    }

    r = await api('POST', `/posts/${alicePost.id}/reactions`, {
      token: bob.token,
      body: { emoji: '🔥' },
    });
    log(r.ok, 'Bob reacts 🔥 Alice post', `status=${r.status}`);

    r = await api('POST', `/posts/${alicePost.id}/save`, { token: bob.token });
    log(r.ok, 'Bob saves Alice post', `status=${r.status}`);
  }

  // ── Bob votes in Alice's poll ─────────────────────────────────
  if (alicePoll?.id) {
    r = await api('POST', `/posts/${alicePoll.id}/vote`, {
      token: bob.token,
      body: { optionIndex: 1 },
    });
    log(r.ok, 'Bob votes in Alice poll', `status=${r.status}`);
  }

  // ── Friendship: Alice → Bob, Bob accepts ──────────────────────
  r = await api('POST', '/friendships', {
    token: alice.token,
    body: { receiverId: bob.id },
  });
  log(r.ok, 'Alice → Bob friend request', `status=${r.status}`, r.ok ? null : r.data);
  const friendshipId = r.data?.id;

  if (friendshipId) {
    r = await api('PUT', `/friendships/${friendshipId}/accept`, { token: bob.token });
    log(r.ok, 'Bob accepts friend request', `status=${r.status}`);
  }

  // ── Favorite ──────────────────────────────────────────────────
  r = await api('POST', `/favorites/${bob.id}`, { token: alice.token });
  log(r.ok, 'Alice favorites Bob', `status=${r.status}`, r.ok ? null : r.data);

  // ── DM conversation (resolve userId → conversation) ───────────
  r = await api('GET', `/messages/resolve/${bob.id}`, { token: alice.token });
  log(r.ok, 'Resolve DM Alice↔Bob', `status=${r.status}`, r.ok ? null : r.data);
  const convId = r.data?.conversationId;

  if (convId) {
    r = await api('POST', `/messages/conversations/${convId}/messages`, {
      token: alice.token,
      body: { content: `E2E hello Bob! ${stamp}` },
    });
    log(r.ok, 'Alice → Bob message', `status=${r.status}`);

    r = await api('POST', `/messages/conversations/${convId}/messages`, {
      token: bob.token,
      body: { content: 'E2E hi Alice!' },
    });
    log(r.ok, 'Bob → Alice reply', `status=${r.status}`);

    r = await api('PATCH', `/messages/conversations/${convId}/read`, { token: bob.token });
    log(r.ok, 'Bob marks read', `status=${r.status}`);
  }

  // ── Services (Alice publishes catalog services) ───────────────
  // First need a profession with customFilters available
  const targetProf = allProfessions.find(p => p.serviceId) || allProfessions[0];
  if (targetProf?.id && targetProf?.serviceId) {
    r = await api('PUT', '/users/me/services', {
      token: alice.token,
      body: [
        {
          professionId: targetProf.id,
          serviceId: targetProf.serviceId,
          priceFrom: 5000,
          priceTo: 15000,
        },
      ],
    });
    log(r.ok, 'Alice publishes catalog service', `status=${r.status}`);
  } else {
    log(false, 'Alice publishes catalog service', 'no suitable profession found');
  }

  // ── Read back Alice's services ────────────────────────────────
  r = await api('GET', `/users/${alice.id}/services`, { token: bob.token });
  log(r.ok, "Bob views Alice's services", `count=${Array.isArray(r.data) ? r.data.length : '?'}`);
  const aliceUserService = Array.isArray(r.data) && r.data[0] ? r.data[0] : null;

  // ── Search ────────────────────────────────────────────────────
  r = await api('GET', '/users/search?q=Alice', { token: bob.token });
  log(r.ok, 'Bob searches "Alice"', `status=${r.status}`);

  r = await api('GET', '/users/catalog', { token: bob.token });
  log(r.ok, 'GET /users/catalog', `status=${r.status}`);

  // ── Connection: Bob → Alice (request → accept) ────────────────
  r = await api('POST', '/connections', {
    token: bob.token,
    body: {
      receiverId: alice.id,
      serviceIds: aliceUserService?.id ? [aliceUserService.id] : [],
      needsDeal: false,
    },
  });
  log(r.ok, 'Bob → Alice connection request', `status=${r.status}`, r.ok ? null : r.data);
  const connId = r.data?.id;

  if (connId) {
    r = await api('PATCH', `/connections/${connId}/accept`, { token: alice.token });
    log(r.ok, 'Alice accepts connection', `status=${r.status}`);
  }

  // ── Deal (Type A: process) ────────────────────────────────────
  r = await api('POST', '/deals', {
    token: bob.token,
    body: {
      executorId: alice.id,
      title: 'E2E deal A: подготовить трек',
      price: 10000,
      result: 'Готовый трек в WAV',
      dealType: 'process',
      revisionCount: 2,
      deadline: new Date(Date.now() + 7 * 86400000).toISOString(),
      acceptDeadline: new Date(Date.now() + 2 * 86400000).toISOString(),
    },
  });
  log(r.ok, 'Bob creates Type-A deal', `status=${r.status}`, r.ok ? null : r.data);
  const dealAId = r.data?.id;

  if (dealAId) {
    r = await api('PATCH', `/deals/${dealAId}/accept`, { token: alice.token });
    log(r.ok, 'Alice accepts deal', `status=${r.status}`);

    r = await api('PATCH', `/deals/${dealAId}/pay`, { token: bob.token });
    log(r.ok, 'Bob marks paid', `status=${r.status}`);

    r = await api('PATCH', `/deals/${dealAId}/submit`, {
      token: alice.token,
      body: { resultUrl: 'https://moooza.ru/result.wav', note: 'Готово, E2E' },
    });
    log(r.ok, 'Alice submits result', `status=${r.status}`);

    r = await api('PATCH', `/deals/${dealAId}/approve`, { token: bob.token });
    log(r.ok, 'Bob approves result', `status=${r.status}`);

    r = await api('PATCH', `/deals/${dealAId}/confirm`, { token: bob.token });
    log(r.ok || r.status === 400, 'Bob confirms (final)', `status=${r.status}`);
  }

  // ── Deal (Type B: event) ──────────────────────────────────────
  r = await api('POST', '/deals', {
    token: bob.token,
    body: {
      executorId: alice.id,
      title: 'E2E deal B: концерт',
      price: 50000,
      dealType: 'event',
      eventDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      deposit: 10000,
    },
  });
  log(r.ok, 'Bob creates Type-B (event) deal', `status=${r.status}`, r.ok ? null : r.data);

  // ── Review (Bob → Alice) ──────────────────────────────────────
  r = await api('POST', '/reviews', {
    token: bob.token,
    body: {
      targetId: alice.id,
      rating: 10,
      text: 'Отличная работа! E2E',
      type: 'connection',
    },
  });
  log(r.ok, 'Bob reviews Alice (10/10)', `status=${r.status}`, r.ok ? null : r.data);

  // ── Artist creation (Alice creates band) ──────────────────────
  r = await api('POST', '/artists', {
    token: alice.token,
    body: { name: `E2E Band ${stamp}`, type: 'BAND', city: 'Москва' },
  });
  log(r.ok, 'Alice creates artist/band', `status=${r.status}`, r.ok ? null : r.data);
  const artist = r.data;

  // ── Channel creation ──────────────────────────────────────────
  r = await api('POST', '/channels', {
    token: alice.token,
    body: { name: `E2E Channel ${stamp}`, description: 'E2E test channel' },
  });
  log(r.ok || r.status === 400, 'Alice creates channel', `status=${r.status}`, r.ok ? null : r.data);

  // ── Complaint (Alice complains on Bob) ────────────────────────
  r = await api('POST', '/complaints', {
    token: alice.token,
    body: {
      targetType: 'user',
      targetId: bob.id,
      category: 'Спам',
      text: 'E2E test complaint (ignore)',
    },
  });
  log(r.ok, 'Alice files complaint on Bob', `status=${r.status}`, r.ok ? null : r.data);

  // ── Notifications fetch ───────────────────────────────────────
  r = await api('GET', '/notifications', { token: bob.token });
  log(r.ok, 'Bob fetches notifications', `count=${Array.isArray(r.data) ? r.data.length : (r.data?.notifications?.length ?? '?')}`);

  r = await api('GET', '/notifications', { token: alice.token });
  log(r.ok, 'Alice fetches notifications', `count=${Array.isArray(r.data) ? r.data.length : (r.data?.notifications?.length ?? '?')}`);

  // ── Saved posts list ──────────────────────────────────────────
  r = await api('GET', '/posts/saved/list', { token: bob.token });
  log(r.ok, 'Bob views saved posts', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // ── Friends list ──────────────────────────────────────────────
  r = await api('GET', '/friendships', { token: alice.token });
  log(r.ok, 'Alice friends list', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // ── Conversations list ────────────────────────────────────────
  r = await api('GET', '/messages/conversations', { token: alice.token });
  log(r.ok, 'Alice conversations list', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // ── Reviews list ──────────────────────────────────────────────
  r = await api('GET', `/reviews/user/${alice.id}`);
  log(r.ok, 'GET reviews for Alice', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  return finish();
}

function finish() {
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`\n=== E2E SUMMARY ===`);
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
