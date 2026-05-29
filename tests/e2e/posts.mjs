// Deep E2E tests for Moooza posts API
//
// Covers: post types (blog, employment, poll), feed, single post,
//         likes, comments, reactions, save, poll voting, edit/delete, access control
//
// Run: node tests/e2e/posts.mjs

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

async function registerUser(name, suffix, stamp) {
  const email = `e2e_${suffix}_posts_${stamp}@moooza.test`;
  const password = 'E2E_Test_2026!';
  const r = await api('POST', '/auth/register', {
    body: { firstName: name, lastName: `Posts${stamp}`, email, password, role: 'musician', city: 'Moscow' },
  });
  if (!r.ok) throw new Error(`register ${suffix}: ${JSON.stringify(r.data)}`);
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
// A: Post types — creation
// ─────────────────────────────────────────────────────────────────────────────
async function sectionA(alice, bob) {
  console.log('\n━━━ A: POST TYPES — CREATION ━━━');

  // A1: blog post
  let r = await api('POST', '/posts', {
    token: alice.token,
    body: { type: 'blog', content: 'Hello, Moooza! This is a blog post from E2E.' },
  });
  log(r.ok && r.status === 201, '[A1] blog post → 201', `status=${r.status}`, r.ok ? null : r.data);
  const blogPostId = r.data?.id;

  // A2: employment post — occupancyStatus update
  r = await api('POST', '/posts', {
    token: alice.token,
    body: { type: 'employment', employmentStatus: 'LOOKING', content: 'Looking for work' },
  });
  log(r.ok && r.status === 201, '[A2a] employment post → 201', `status=${r.status}`, r.ok ? null : r.data);
  const empPostId = r.data?.id;

  // Check occupancyStatus updated
  if (r.ok) {
    const me = await api('GET', '/users/me', { token: alice.token });
    log(me.ok && me.data?.occupancyStatus === 'LOOKING', '[A2b] occupancyStatus updated to LOOKING', `status=${me.data?.occupancyStatus}`);
  } else {
    log(false, '[A2b] occupancyStatus updated to LOOKING', 'skipped — post failed');
  }

  // A3: poll post with 3 options and pollEndsAt
  const pollEndsAt = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  r = await api('POST', '/posts', {
    token: alice.token,
    body: {
      type: 'poll',
      pollOptions: ['Option A', 'Option B', 'Option C'],
      pollEndsAt,
    },
  });
  log(r.ok && r.status === 201, '[A3] poll post (3 options, pollEndsAt) → 201', `status=${r.status}`, r.ok ? null : r.data);
  const pollPostId = r.data?.id;

  // A4: empty post → 400
  r = await api('POST', '/posts', {
    token: alice.token,
    body: { type: 'blog' },
  });
  log(!r.ok && r.status === 400, '[A4] empty post → 400', `status=${r.status}`, r.ok ? r.data : null);

  // A5: poll with < 2 options → 400
  r = await api('POST', '/posts', {
    token: alice.token,
    body: { type: 'poll', pollOptions: ['Only one'] },
  });
  log(!r.ok && r.status === 400, '[A5] poll < 2 options → 400', `status=${r.status}`, r.ok ? r.data : null);

  // A6: poll with 0 options → 400
  r = await api('POST', '/posts', {
    token: alice.token,
    body: { type: 'poll', pollOptions: [] },
  });
  log(!r.ok && r.status === 400, '[A6] poll empty options → 400', `status=${r.status}`, r.ok ? r.data : null);

  return { blogPostId, empPostId, pollPostId, pollEndsAt };
}

// ─────────────────────────────────────────────────────────────────────────────
// B: Feed
// ─────────────────────────────────────────────────────────────────────────────
async function sectionB(alice) {
  console.log('\n━━━ B: FEED ━━━');

  // B1: default feed
  let r = await api('GET', '/posts/feed', { token: alice.token });
  log(r.ok && r.status === 200 && Array.isArray(r.data), '[B1] GET /posts/feed → 200 array', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // B2: feed with type=blog filter
  r = await api('GET', '/posts/feed?type=blog', { token: alice.token });
  log(r.ok && r.status === 200 && Array.isArray(r.data), '[B2] GET /posts/feed?type=blog → 200', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // B3: feed with type=poll filter
  r = await api('GET', '/posts/feed?type=poll', { token: alice.token });
  log(r.ok && r.status === 200 && Array.isArray(r.data), '[B3] GET /posts/feed?type=poll → 200', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // B4: feed sort=popular
  r = await api('GET', '/posts/feed?sort=popular', { token: alice.token });
  log(r.ok && r.status === 200 && Array.isArray(r.data), '[B4] GET /posts/feed?sort=popular → 200', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // B5: pagination
  r = await api('GET', '/posts/feed?limit=5&offset=0', { token: alice.token });
  log(r.ok && r.status === 200 && Array.isArray(r.data), '[B5] GET /posts/feed?limit=5&offset=0 → 200', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);

  // B6: saved list — initially empty (no saves yet)
  r = await api('GET', '/posts/saved/list', { token: alice.token });
  log(r.ok && r.status === 200 && Array.isArray(r.data), '[B6] GET /posts/saved/list → 200 array', `count=${Array.isArray(r.data) ? r.data.length : '?'}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// C: Single post
// ─────────────────────────────────────────────────────────────────────────────
async function sectionC(alice, postId) {
  console.log('\n━━━ C: SINGLE POST ━━━');

  const r = await api('GET', `/posts/${postId}`, { token: alice.token });
  log(r.ok && r.status === 200, '[C1] GET /posts/:id → 200', `status=${r.status}`, r.ok ? null : r.data);
  if (r.ok) {
    const p = r.data;
    log(!!p.author, '[C2] post has author', `authorId=${p.author?.id?.slice(0, 8)}`);
    log(typeof p.isLiked === 'boolean', '[C3] post has isLiked boolean', `isLiked=${p.isLiked}`);
    log(Array.isArray(p.comments), '[C4] post has comments array', `comments=${p.comments?.length}`);
    log(!!p._count, '[C5] post has _count', `likes=${p._count?.likes}`);
  } else {
    log(false, '[C2] post has author', 'skipped');
    log(false, '[C3] post has isLiked boolean', 'skipped');
    log(false, '[C4] post has comments array', 'skipped');
    log(false, '[C5] post has _count', 'skipped');
  }

  // C6: non-existent post → 404
  const fake = await api('GET', '/posts/non-existent-id-000', { token: alice.token });
  log(!fake.ok && fake.status === 404, '[C6] GET /posts/nonexistent → 404', `status=${fake.status}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// D: Likes
// ─────────────────────────────────────────────────────────────────────────────
async function sectionD(alice, bob, postId) {
  console.log('\n━━━ D: LIKES ━━━');

  // D1: Bob likes Alice's post
  let r = await api('POST', `/posts/${postId}/like`, { token: bob.token });
  log(r.ok && r.status === 201, '[D1] Bob likes post → 201', `status=${r.status}`, r.ok ? null : r.data);

  // D2: duplicate like → 400
  r = await api('POST', `/posts/${postId}/like`, { token: bob.token });
  log(!r.ok && r.status === 400, '[D2] duplicate like → 400', `status=${r.status}`, r.ok ? r.data : null);

  // D3: unlike → 204
  r = await api('DELETE', `/posts/${postId}/like`, { token: bob.token });
  log(r.ok && r.status === 204, '[D3] unlike → 204', `status=${r.status}`, r.ok ? null : r.data);

  // D4: like again after unlike → 201
  r = await api('POST', `/posts/${postId}/like`, { token: bob.token });
  log(r.ok && r.status === 201, '[D4] like again after unlike → 201', `status=${r.status}`, r.ok ? null : r.data);

  // D5: Alice likes her own post
  r = await api('POST', `/posts/${postId}/like`, { token: alice.token });
  log(r.ok && r.status === 201, '[D5] author likes own post → 201', `status=${r.status}`, r.ok ? null : r.data);

  // D6: verify like count increased
  r = await api('GET', `/posts/${postId}`, { token: alice.token });
  log(r.ok && r.data?._count?.likes >= 2, '[D6] like count ≥ 2 after two likes', `likes=${r.data?._count?.likes}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// E: Comments
// ─────────────────────────────────────────────────────────────────────────────
async function sectionE(alice, bob, postId) {
  console.log('\n━━━ E: COMMENTS ━━━');

  // E1: Bob comments on Alice's post
  let r = await api('POST', `/posts/${postId}/comments`, {
    token: bob.token,
    body: { content: 'Great post, Alice! E2E comment.' },
  });
  log(r.ok && r.status === 201, '[E1] Bob comments → 201', `status=${r.status}`, r.ok ? null : r.data);
  const commentId = r.data?.id;

  // E2: reply to Bob's comment
  let replyId = null;
  if (commentId) {
    r = await api('POST', `/posts/${postId}/comments`, {
      token: alice.token,
      body: { content: 'Thanks, Bob!', parentCommentId: commentId },
    });
    log(r.ok && r.status === 201, '[E2] Alice replies to Bob comment → 201', `status=${r.status}`, r.ok ? null : r.data);
    replyId = r.data?.id;
  } else {
    log(false, '[E2] Alice replies to Bob comment → 201', 'skipped — no commentId');
  }

  // E3: comments visible in GET /posts/:id
  r = await api('GET', `/posts/${postId}`, { token: alice.token });
  log(
    r.ok && Array.isArray(r.data?.comments) && r.data.comments.length > 0,
    '[E3] comments visible in GET /posts/:id',
    `count=${r.data?.comments?.length}`
  );

  // E4: reply visible in comment's replies
  if (r.ok && commentId) {
    const topComment = r.data.comments.find(c => c.id === commentId);
    log(
      topComment && Array.isArray(topComment.replies) && topComment.replies.length > 0,
      '[E4] reply visible in parent comment.replies',
      `replies=${topComment?.replies?.length}`
    );
  } else {
    log(false, '[E4] reply visible in parent comment.replies', 'skipped');
  }

  // E5: comment without content → 400
  r = await api('POST', `/posts/${postId}/comments`, {
    token: bob.token,
    body: {},
  });
  log(!r.ok && r.status === 400, '[E5] comment without content → 400', `status=${r.status}`, r.ok ? r.data : null);

  // E6: Alice cannot delete Bob's comment → 403
  if (commentId) {
    r = await api('DELETE', `/posts/${postId}/comments/${commentId}`, { token: alice.token });
    log(!r.ok && r.status === 403, '[E6] Alice cannot delete Bob comment → 403', `status=${r.status}`, r.ok ? r.data : null);
  } else {
    log(false, '[E6] Alice cannot delete Bob comment → 403', 'skipped');
  }

  // E7: Bob deletes his own comment → 204
  if (commentId) {
    // First delete the reply (Bob can't delete Alice's reply, so Alice deletes it)
    if (replyId) {
      await api('DELETE', `/posts/${postId}/comments/${replyId}`, { token: alice.token });
    }
    r = await api('DELETE', `/posts/${postId}/comments/${commentId}`, { token: bob.token });
    log(r.ok && r.status === 204, '[E7] Bob deletes own comment → 204', `status=${r.status}`, r.ok ? null : r.data);
  } else {
    log(false, '[E7] Bob deletes own comment → 204', 'skipped');
  }

  // E8: Alice adds a comment (for later reaction tests)
  r = await api('POST', `/posts/${postId}/comments`, {
    token: alice.token,
    body: { content: 'Alice standalone comment for reactions.' },
  });
  log(r.ok && r.status === 201, '[E8] Alice comment for reaction tests → 201', `status=${r.status}`, r.ok ? null : r.data);
  const aliceCommentId = r.data?.id;

  return { aliceCommentId };
}

// ─────────────────────────────────────────────────────────────────────────────
// F: Post reactions
// ─────────────────────────────────────────────────────────────────────────────
async function sectionF(alice, bob, postId) {
  console.log('\n━━━ F: POST REACTIONS ━━━');

  // F1: Bob reacts with 🎵
  let r = await api('POST', `/posts/${postId}/reactions`, {
    token: bob.token,
    body: { emoji: '🎵' },
  });
  log(r.ok && (r.status === 200 || r.status === 201), '[F1] Bob reacts 🎵 → 200/201', `status=${r.status}`, r.ok ? null : r.data);

  // F2: upsert — change reaction to 🔥
  r = await api('POST', `/posts/${postId}/reactions`, {
    token: bob.token,
    body: { emoji: '🔥' },
  });
  log(r.ok && (r.status === 200 || r.status === 201), '[F2] Bob changes reaction to 🔥 (upsert) → OK', `status=${r.status}`, r.ok ? null : r.data);
  log(r.ok && r.data?.emoji === '🔥', '[F3] reaction emoji is 🔥', `emoji=${r.data?.emoji}`);

  // F4: no emoji → 400
  r = await api('POST', `/posts/${postId}/reactions`, {
    token: bob.token,
    body: {},
  });
  log(!r.ok && r.status === 400, '[F4] no emoji → 400', `status=${r.status}`, r.ok ? r.data : null);

  // F5: Alice also reacts
  r = await api('POST', `/posts/${postId}/reactions`, {
    token: alice.token,
    body: { emoji: '🎸' },
  });
  log(r.ok, '[F5] Alice reacts 🎸', `status=${r.status}`, r.ok ? null : r.data);

  // F6: reactions visible in feed (GET /posts/:id does NOT include post-level reactions —
  //     only /feed does; verify via feed that reactions are attached there)
  r = await api('GET', '/posts/feed', { token: alice.token });
  const feedPost = Array.isArray(r.data) ? r.data.find(p => p.id === postId) : null;
  log(
    r.ok && feedPost && Array.isArray(feedPost.reactions) && feedPost.reactions.length >= 1,
    '[F6] reactions visible in /feed for the post (≥1)',
    `count=${feedPost?.reactions?.length}`
  );

  // F7: Bob removes his reaction → 204
  r = await api('DELETE', `/posts/${postId}/reactions`, { token: bob.token });
  log(r.ok && r.status === 204, '[F7] Bob removes reaction → 204', `status=${r.status}`, r.ok ? null : r.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// G: Save
// ─────────────────────────────────────────────────────────────────────────────
async function sectionG(alice, bob, postId) {
  console.log('\n━━━ G: SAVE (TOGGLE) ━━━');

  // G1: Bob saves the post → { saved: true }
  let r = await api('POST', `/posts/${postId}/save`, { token: bob.token });
  log(r.ok && r.data?.saved === true, '[G1] save → { saved: true }', `saved=${r.data?.saved}`, r.ok ? null : r.data);

  // G2: toggle again → { saved: false }
  r = await api('POST', `/posts/${postId}/save`, { token: bob.token });
  log(r.ok && r.data?.saved === false, '[G2] toggle save → { saved: false }', `saved=${r.data?.saved}`, r.ok ? null : r.data);

  // G3: save again
  r = await api('POST', `/posts/${postId}/save`, { token: bob.token });
  log(r.ok && r.data?.saved === true, '[G3] save again → { saved: true }', `saved=${r.data?.saved}`, r.ok ? null : r.data);

  // G4: GET /posts/saved/list — contains the post
  r = await api('GET', '/posts/saved/list', { token: bob.token });
  log(
    r.ok && Array.isArray(r.data) && r.data.some(p => p.id === postId),
    '[G4] saved/list contains the post',
    `total=${r.data?.length}`
  );

  // G5: Alice's saved list should NOT contain this post (different user)
  r = await api('GET', '/posts/saved/list', { token: alice.token });
  log(
    r.ok && Array.isArray(r.data) && !r.data.some(p => p.id === postId),
    '[G5] Alice saved/list does NOT contain Bob-saved post',
    `total=${r.data?.length}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// H: Poll voting
// ─────────────────────────────────────────────────────────────────────────────
async function sectionH(alice, bob, pollPostId, stamp) {
  console.log('\n━━━ H: POLL VOTING ━━━');

  if (!pollPostId) {
    log(false, '[H] skipped — no pollPostId', 'poll creation failed');
    return;
  }

  // H1: Bob votes option 0
  let r = await api('POST', `/posts/${pollPostId}/vote`, {
    token: bob.token,
    body: { optionIndex: 0 },
  });
  log(r.ok, '[H1] Bob votes option 0', `status=${r.status}`, r.ok ? null : r.data);
  log(r.ok && Array.isArray(r.data?.options), '[H2] vote returns options array', `options=${JSON.stringify(r.data?.options)}`);
  log(r.ok && r.data?.myVote === 0, '[H3] vote returns myVote=0', `myVote=${r.data?.myVote}`);

  // H4: Bob changes vote to option 2 (upsert)
  r = await api('POST', `/posts/${pollPostId}/vote`, {
    token: bob.token,
    body: { optionIndex: 2 },
  });
  log(r.ok, '[H4] Bob changes vote to option 2 (upsert)', `status=${r.status}`, r.ok ? null : r.data);
  log(r.ok && r.data?.myVote === 2, '[H5] myVote updated to 2', `myVote=${r.data?.myVote}`);

  // H6: Alice votes option 1
  r = await api('POST', `/posts/${pollPostId}/vote`, {
    token: alice.token,
    body: { optionIndex: 1 },
  });
  log(r.ok, '[H6] Alice votes option 1', `status=${r.status}`, r.ok ? null : r.data);

  // H7: missing optionIndex → 400
  r = await api('POST', `/posts/${pollPostId}/vote`, {
    token: bob.token,
    body: {},
  });
  log(!r.ok && r.status === 400, '[H7] vote without optionIndex → 400', `status=${r.status}`, r.ok ? r.data : null);

  // H8: closed poll → 400
  // Create a poll that ended in the past
  r = await api('POST', '/posts', {
    token: alice.token,
    body: {
      type: 'poll',
      pollOptions: ['Past A', 'Past B'],
      pollEndsAt: new Date(Date.now() - 1000).toISOString(), // already ended
    },
  });
  log(r.ok && r.status === 201, '[H8a] create expired poll → 201', `status=${r.status}`, r.ok ? null : r.data);
  const expiredPollId = r.data?.id;

  if (expiredPollId) {
    // Small wait to ensure the timestamp is definitely in the past
    await new Promise(res => setTimeout(res, 100));
    r = await api('POST', `/posts/${expiredPollId}/vote`, {
      token: bob.token,
      body: { optionIndex: 0 },
    });
    log(!r.ok && r.status === 400, '[H8b] vote in expired poll → 400', `status=${r.status}`, r.ok ? r.data : null);
  } else {
    log(false, '[H8b] vote in expired poll → 400', 'skipped');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// I: Edit and delete posts
// ─────────────────────────────────────────────────────────────────────────────
async function sectionI(alice, bob, blogPostId) {
  console.log('\n━━━ I: EDIT & DELETE ━━━');

  if (!blogPostId) {
    console.log('  Skipped — no blogPostId');
    return;
  }

  // First create a second post (Bob) for cross-author tests
  let r = await api('POST', '/posts', {
    token: bob.token,
    body: { type: 'blog', content: 'Bob blog post for edit/delete tests' },
  });
  log(r.ok && r.status === 201, '[I0] Bob creates his own post → 201', `status=${r.status}`, r.ok ? null : r.data);
  const bobPostId = r.data?.id;

  // I1: Alice edits her own post → 200
  r = await api('PUT', `/posts/${blogPostId}`, {
    token: alice.token,
    body: { content: 'Updated blog post content from E2E' },
  });
  log(r.ok && r.status === 200, '[I1] Alice edits own post → 200', `status=${r.status}`, r.ok ? null : r.data);
  log(r.ok && r.data?.content === 'Updated blog post content from E2E', '[I2] content updated correctly', `content=${r.data?.content?.slice(0, 30)}`);

  // I3: Bob tries to edit Alice's post → 403
  r = await api('PUT', `/posts/${blogPostId}`, {
    token: bob.token,
    body: { content: 'Unauthorized edit' },
  });
  log(!r.ok && r.status === 403, '[I3] Bob cannot edit Alice post → 403', `status=${r.status}`, r.ok ? r.data : null);

  // I4: Alice tries to delete Bob's post → 403
  if (bobPostId) {
    r = await api('DELETE', `/posts/${bobPostId}`, { token: alice.token });
    log(!r.ok && r.status === 403, '[I4] Alice cannot delete Bob post → 403', `status=${r.status}`, r.ok ? r.data : null);
  } else {
    log(false, '[I4] Alice cannot delete Bob post → 403', 'skipped');
  }

  // I5: Bob deletes his own post → 204
  if (bobPostId) {
    r = await api('DELETE', `/posts/${bobPostId}`, { token: bob.token });
    log(r.ok && r.status === 204, '[I5] Bob deletes own post → 204', `status=${r.status}`, r.ok ? null : r.data);
  } else {
    log(false, '[I5] Bob deletes own post → 204', 'skipped');
  }

  // I6: GET deleted post → 404
  if (bobPostId) {
    r = await api('GET', `/posts/${bobPostId}`, { token: alice.token });
    log(!r.ok && r.status === 404, '[I6] GET deleted post → 404', `status=${r.status}`);
  } else {
    log(false, '[I6] GET deleted post → 404', 'skipped');
  }

  // I7: Alice deletes her own blog post
  r = await api('DELETE', `/posts/${blogPostId}`, { token: alice.token });
  log(r.ok && r.status === 204, '[I7] Alice deletes own post → 204', `status=${r.status}`, r.ok ? null : r.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// J: Comment reactions (bonus — available via routes)
// ─────────────────────────────────────────────────────────────────────────────
async function sectionJ(alice, bob, postId, commentId) {
  console.log('\n━━━ J: COMMENT REACTIONS ━━━');

  if (!commentId || !postId) {
    log(false, '[J] skipped — no comment or post', 'prerequisites missing');
    return;
  }

  // J1: Bob reacts to Alice's comment
  let r = await api('POST', `/posts/${postId}/comments/${commentId}/reactions`, {
    token: bob.token,
    body: { emoji: '👍' },
  });
  log(r.ok, '[J1] Bob reacts 👍 to comment', `status=${r.status}`, r.ok ? null : r.data);

  // J2: upsert — change to 🔥
  r = await api('POST', `/posts/${postId}/comments/${commentId}/reactions`, {
    token: bob.token,
    body: { emoji: '🔥' },
  });
  log(r.ok && r.data?.emoji === '🔥', '[J2] Bob changes comment reaction to 🔥', `emoji=${r.data?.emoji}`, r.ok ? null : r.data);

  // J3: no emoji → 400
  r = await api('POST', `/posts/${postId}/comments/${commentId}/reactions`, {
    token: bob.token,
    body: {},
  });
  log(!r.ok && r.status === 400, '[J3] no emoji → 400', `status=${r.status}`, r.ok ? r.data : null);

  // J4: remove reaction → 204
  r = await api('DELETE', `/posts/${postId}/comments/${commentId}/reactions`, { token: bob.token });
  log(r.ok && r.status === 204, '[J4] Bob removes comment reaction → 204', `status=${r.status}`, r.ok ? null : r.data);
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  const stamp = Date.now().toString(36);
  console.log(`Stamp: ${stamp}`);
  console.log(`API: ${API}`);

  // Register users
  console.log('\n━━━ SETUP: Register & Login ━━━');
  const aliceCred = await registerUser('AlicePosts', 'alice', stamp);
  const bobCred = await registerUser('BobPosts', 'bob', stamp);
  log(true, 'Register alice + bob', `stamp=${stamp}`);

  // Verify emails via SSH
  const verified = verifyEmailsViaSql(`e2e_%_posts_${stamp}@moooza.test`);
  log(verified, 'SQL verify emails', verified ? 'updated' : 'skipped (check SSH)');

  // Login
  const alice = await loginUser(aliceCred.email, aliceCred.password);
  const bob = await loginUser(bobCred.email, bobCred.password);
  log(!!alice.token && !!bob.token, 'Login alice + bob', `alice=${alice.id?.slice(0, 8)} bob=${bob.id?.slice(0, 8)}`);

  // Run sections
  const { blogPostId, empPostId, pollPostId } = await sectionA(alice, bob);

  await sectionB(alice);
  await sectionC(alice, blogPostId);
  await sectionD(alice, bob, blogPostId);
  const { aliceCommentId } = await sectionE(alice, bob, blogPostId);
  await sectionF(alice, bob, blogPostId);
  await sectionG(alice, bob, blogPostId);
  await sectionH(alice, bob, pollPostId, stamp);

  // J: comment reactions (uses aliceCommentId on blogPostId)
  await sectionJ(alice, bob, blogPostId, aliceCommentId);

  // I: edit/delete (must run LAST — deletes blogPostId)
  await sectionI(alice, bob, blogPostId);

  finish();
}

function finish() {
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  const skipped = results.filter(r => r.info === 'skipped');

  console.log('\n═══════ POSTS E2E SUMMARY ═══════');
  console.log(`Passed: ${passed}/${total}`);
  if (skipped.length) {
    console.log(`\nSkipped (${skipped.length}):`);
    skipped.forEach(s => console.log(`  - ${s.name}`));
  }
  if (failed.length) {
    console.log(`\nFailures (${failed.length}):`);
    failed.forEach(f => console.log(`  - ${f.name}${f.info ? ' (' + f.info + ')' : ''}`));
  }
  process.exit(failed.length ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(2);
});
