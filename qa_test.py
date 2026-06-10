import json, subprocess, time, urllib.request, urllib.error, urllib.parse, sys

BASE = "https://dev.moooza.ru/api"
PW = "x-wGeH5uVZs-Y@"
HOST = "root@147.45.166.246"
TS = int(time.time())

def sql(q):
    # run SQL inside postgres container via plink
    inner = 'docker exec mooza-postgres psql -U mooza -d mooza_db -tAc "%s"' % q.replace('"', '\\"')
    r = subprocess.run(["plink","-batch","-pw",PW,HOST,inner], capture_output=True, text=True)
    if r.returncode != 0:
        print("SQL ERR:", r.stderr.strip())
    return r.stdout.strip()

def http(method, path, token=None, body=None):
    url = BASE + path
    data = None
    headers = {"Content-Type":"application/json"}
    if token: headers["Authorization"] = "Bearer " + token
    if body is not None: data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=30)
        raw = resp.read().decode()
        try: j = json.loads(raw)
        except: j = raw
        return resp.status, j
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: j = json.loads(raw)
        except: j = raw
        return e.code, j
    except Exception as e:
        return 0, str(e)

results = {}
def rec(t, ok, detail):
    results[t] = (ok, detail)
    print(f"[{t}] {'PASS' if ok else 'FAIL'}: {detail}")

def mkuser(tag):
    email = f"cc-qa-{TS}-{tag}@example.com"
    st, j = http("POST","/auth/register", body={"email":email,"firstName":"QA","lastName":tag,"password":"Test1234!"})
    code = sql(f"SELECT code FROM \\\"PendingRegistration\\\" WHERE email='{email}'")
    st2, j2 = http("POST","/auth/verify-email", body={"email":email,"code":code})
    if st2 != 200:
        print("  verify failed", st2, j2)
    return email, j2.get("token"), j2.get("user",{}).get("id")

print("=== Creating users ===")
u1_email, u1_token, u1_id = mkuser("u1")
u2_email, u2_token, u2_id = mkuser("u2")
print("U1", u1_id, "U2", u2_id)

# ---- T2 roles ----
def roles_ctx(ctx):
    st, j = http("GET", f"/roles?context={ctx}")
    return st, j
out = {}
for ctx in ["collective","release","clip"]:
    st, j = roles_ctx(ctx)
    cats = [(g["category"], len(g["roles"])) for g in j] if isinstance(j, list) else j
    out[ctx] = (st, cats)
    print(f"  roles {ctx}: {st} {cats}")
# stash a role id per context
collective_role = roles_ctx("collective")[1][0]["roles"][0]["id"]
release_role = roles_ctx("release")[1][0]["roles"][0]["id"]
clip_role = roles_ctx("clip")[1][0]["roles"][0]["id"]
rec("T2", all(out[c][0]==200 and len(out[c][1])>0 for c in out), str({c:out[c][1] for c in out}))

# ---- T3 SOLO create ----
solo_name = f"QA Solo {TS}"
st, j = http("POST","/artists", token=u1_token, body={"name":solo_name,"type":"SOLO","submitterRoles":["Музыкант"]})
solo_id = j.get("id") if isinstance(j, dict) else None
vcode = j.get("verificationCode") if isinstance(j, dict) else None
ua = sql(f"SELECT \\\"isOwner\\\",\\\"isAdmin\\\",\\\"inviteStatus\\\" FROM \\\"UserArtist\\\" WHERE \\\"artistId\\\"='{solo_id}' AND \\\"userId\\\"='{u1_id}'")
codefmt = bool(vcode and vcode.startswith("MOOOZA-") and len(vcode)==13)
rec("T3", st==201 and codefmt and j.get("status")=="DRAFT" and ua.startswith("t|t|ACCEPTED"),
    f"st={st} code={vcode} status={j.get('status') if isinstance(j,dict) else j} UA={ua}")

# ---- T4 duplicate check ----
st, j = http("GET", f"/artists/check-name?name={urllib.parse.quote(solo_name)}", token=u1_token)
rec("T4", st==200 and j.get("exists")==True and j.get("artist",{}).get("id")==solo_id, f"st={st} {j}")

# ---- T5 GROUP submit unmet ----
group_name = f"QA Group {TS}"
st, jg = http("POST","/artists", token=u1_token, body={"name":group_name,"type":"GROUP","submitterRoles":["Менеджер"]})
group_id = jg.get("id")
# blocked platform (instagram)
st_b, j_b = http("PATCH", f"/artists/{group_id}/request-verification", token=u1_token, body={"verificationUrl":"https://instagram.com/foo"})
# allowed platform (vk) but still members short
st_a, j_a = http("PATCH", f"/artists/{group_id}/request-verification", token=u1_token, body={"verificationUrl":"https://vk.com/foo"})
unmet_b = j_b.get("unmet") if isinstance(j_b,dict) else None
unmet_a = j_a.get("unmet") if isinstance(j_a,dict) else None
blocked_mentioned = unmet_b and any("разреш" in u or "соцсет" in u or "instagram" in u.lower() or "запрещ" in u.lower() for u in unmet_b)
members_mentioned_b = unmet_b and any("участ" in u for u in unmet_b)
members_mentioned_a = unmet_a and any("участ" in u for u in unmet_a)
rec("T5", st_b==400 and j_b.get("error")=="CONDITIONS_NOT_MET" and members_mentioned_b and st_a==400 and members_mentioned_a,
    f"blocked: st={st_b} unmet={unmet_b} | allowed: st={st_a} unmet={unmet_a}")

# ---- T6 SOLO submit met -> PENDING ----
# SOLO needs avatar + type. type SOLO already set. Need avatar -> set via SQL.
sql(f"UPDATE \\\"Artist\\\" SET avatar='/uploads/test.png' WHERE id='{solo_id}'")
st, j = http("PATCH", f"/artists/{solo_id}/request-verification", token=u1_token, body={"verificationUrl":"https://vk.com/myband"})
dbrow = sql(f"SELECT status,\\\"verificationProofUrl\\\" FROM \\\"Artist\\\" WHERE id='{solo_id}'")
rec("T6", st==200 and dbrow.startswith("PENDING|"), f"st={st} resp_status={j.get('status') if isinstance(j,dict) else j} db={dbrow}")

# ---- T7 catalog VERIFIED-only (PENDING not present) ----
st, j = http("GET","/references/artists")
present = isinstance(j,list) and any(a.get("id")==solo_id for a in j)
rec("T7", st==200 and not present, f"st={st} pending_artist_in_catalog={present} catalog_count={len(j) if isinstance(j,list) else j}")

# ---- T8 withdraw -> DRAFT ----
st, j = http("PATCH", f"/artists/{solo_id}/withdraw", token=u1_token)
dbrow = sql(f"SELECT status FROM \\\"Artist\\\" WHERE id='{solo_id}'")
rec("T8", st==200 and dbrow=="DRAFT", f"st={st} db_status={dbrow}")

# ---- T9 admin verify end-to-end ----
sql(f"UPDATE \\\"User\\\" SET \\\"isAdmin\\\"=true WHERE id='{u1_id}'")
# re-request
st_r, _ = http("PATCH", f"/artists/{solo_id}/request-verification", token=u1_token, body={"verificationUrl":"https://vk.com/myband"})
st_v, j_v = http("PATCH", f"/admin/artists/{solo_id}/verify", token=u1_token)
db_status = sql(f"SELECT status FROM \\\"Artist\\\" WHERE id='{solo_id}'")
st_cat, j_cat = http("GET","/references/artists")
in_cat = isinstance(j_cat,list) and any(a.get("id")==solo_id for a in j_cat)
notif = sql(f"SELECT COUNT(*) FROM \\\"Notification\\\" WHERE \\\"userId\\\"='{u1_id}' AND type='artist_verified'")
rec("T9", st_r==200 and st_v==200 and db_status=="VERIFIED" and in_cat and notif!="0",
    f"rerequest={st_r} verify={st_v} db={db_status} in_catalog={in_cat} artist_verified_notif={notif}")

# ---- T10 members add + confirm (on GROUP) ----
st_add, j_add = http("POST", f"/artists/{group_id}/members", token=u1_token,
    body={"userId":u2_id,"roleIds":[collective_role],"participationStatus":"ACTIVE_MEMBER"})
membership_id = j_add.get("membershipId") if isinstance(j_add,dict) else None
notif_inv = sql(f"SELECT COUNT(*) FROM \\\"Notification\\\" WHERE \\\"userId\\\"='{u2_id}' AND type='artist_member_invite'")
st_conf, j_conf = http("PATCH", f"/artists/memberships/{membership_id}/confirm", token=u2_token)
st_get, j_get = http("GET", f"/artists/{group_id}", token=u1_token)
confirmed_ids = [m["user"]["id"] for m in j_get.get("confirmedMembers",[])] if isinstance(j_get,dict) else []
u2_confirmed = u2_id in confirmed_ids
notif_conf = sql(f"SELECT COUNT(*) FROM \\\"Notification\\\" WHERE \\\"userId\\\"='{u1_id}' AND type='artist_member_confirmed'")
rec("T10", st_add in (200,201) and j_add.get("inviteStatus")=="PENDING" and notif_inv!="0" and st_conf==200 and u2_confirmed and notif_conf!="0",
    f"add={st_add} invStatus={j_add.get('inviteStatus') if isinstance(j_add,dict) else j_add} invite_notif={notif_inv} confirm={st_conf} u2_in_confirmed={u2_confirmed} confirmed_notif={notif_conf}")

# ---- T11 invite link ----
st_link, j_link = http("POST", f"/artists/{group_id}/invite-link", token=u1_token,
    body={"roleIds":[collective_role],"participationStatus":"ACTIVE_MEMBER"})
token_inv = j_link.get("token") if isinstance(j_link,dict) else None
st_pub, j_pub = http("GET", f"/artists/invite/{token_inv}")  # no auth
rec("T11", st_link in (200,201) and token_inv and j_link.get("url") and st_pub==200 and j_pub.get("artist") and isinstance(j_pub.get("roles"),list) and j_pub.get("participationStatus")=="ACTIVE_MEMBER",
    f"create={st_link} hasToken={bool(token_inv)} hasUrl={bool(j_link.get('url') if isinstance(j_link,dict) else None)} public={st_pub} roles={j_pub.get('roles') if isinstance(j_pub,dict) else j_pub} part={j_pub.get('participationStatus') if isinstance(j_pub,dict) else None}")

# ---- T12 releases ----
st_meta, j_meta = http("POST","/releases/metadata", token=u1_token, body={"platform":"SPOTIFY","url":"https://open.spotify.com/track/xxxxxxxxxxxxxxxxxxxxxx"})
st_cr, j_cr = http("POST","/releases", token=u1_token,
    body={"artistId":group_id,"platform":"VK","url":"https://vk.com/x","title":"QA Release","participants":[{"userId":u2_id,"roleIds":[release_role]}]})
release_id = j_cr.get("id") if isinstance(j_cr,dict) else None
part_status = None
if isinstance(j_cr,dict) and j_cr.get("participants"):
    part_status = j_cr["participants"][0].get("confirmStatus")
notif_rel = sql(f"SELECT COUNT(*) FROM \\\"Notification\\\" WHERE \\\"userId\\\"='{u2_id}' AND type='release_participant_invite'")
st_rget, j_rget = http("GET", f"/releases/{release_id}", token=u1_token)
st_rlist, j_rlist = http("GET", f"/releases/artist/{group_id}")
in_list = isinstance(j_rlist,list) and any(r.get("id")==release_id for r in j_rlist)
rec("T12", st_meta==200 and st_cr in (200,201) and part_status=="PENDING" and notif_rel!="0" and st_rget==200 and isinstance(j_rget.get("participants"),list) and in_list,
    f"meta={st_meta} create={st_cr} partStatus={part_status} rel_notif={notif_rel} detail={st_rget} inList={in_list}")

# ---- T13 clips ----
st_cc, j_cc = http("POST","/clips", token=u1_token,
    body={"artistId":group_id,"platform":"RUTUBE","url":"https://rutube.ru/video/x","title":"QA Clip","participants":[]})
clip_id = j_cc.get("id") if isinstance(j_cc,dict) else None
st_clist, j_clist = http("GET", f"/clips/artist/{group_id}")
in_clist = isinstance(j_clist,list) and any(c.get("id")==clip_id for c in j_clist)
rec("T13", st_cc in (200,201) and clip_id and in_clist, f"create={st_cc} inList={in_clist}")

# ---- CLEANUP ----
print("=== CLEANUP ===")
sql(f"DELETE FROM \\\"Artist\\\" WHERE id IN ('{solo_id}','{group_id}')")
sql(f"DELETE FROM \\\"User\\\" WHERE email LIKE 'cc-qa-{TS}-%@example.com'")
sql(f"DELETE FROM \\\"PendingRegistration\\\" WHERE email LIKE 'cc-qa-{TS}-%@example.com'")
# verify cleanup
left_artist = sql(f"SELECT COUNT(*) FROM \\\"Artist\\\" WHERE id IN ('{solo_id}','{group_id}')")
left_user = sql(f"SELECT COUNT(*) FROM \\\"User\\\" WHERE email LIKE 'cc-qa-{TS}-%@example.com'")
left_pend = sql(f"SELECT COUNT(*) FROM \\\"PendingRegistration\\\" WHERE email LIKE 'cc-qa-{TS}-%@example.com'")
# leftover notifications referencing deleted users should cascade; check orphan notifs by our test users impossible now
print(f"CLEANUP leftovers: artists={left_artist} users={left_user} pending={left_pend}")
rec("CLEANUP", left_artist=="0" and left_user=="0" and left_pend=="0", f"artists={left_artist} users={left_user} pending={left_pend}")

print("\n=== SUMMARY ===")
for k in sorted(results.keys()):
    ok, d = results[k]
    print(f"{k}: {'PASS' if ok else 'FAIL'}")
