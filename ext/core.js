/* X 回关检查 · 纯逻辑（不碰存储和网络，便于测试） */
(function (root) {
  'use strict';
  const USER_RE = /^[A-Za-z0-9_]{1,15}$/;
  const FOLLOWS_YOU_RE = /^(Follows you|关注了你|关注你|正在关注你|フォローされています|Te sigue|Vous suit|Folgt dir|Segue você)$/i;

  function followingOwner(pathname) {
    const m = String(pathname || '').match(/^\/([A-Za-z0-9_]{1,15})\/following\/?$/);
    return m ? m[1] : null;
  }

  function extractAccount(cell, origin) {
    const nameArea = cell.querySelector('[data-testid="User-Name"]') || cell;
    const candidates = [...nameArea.querySelectorAll('a[href]')].map((a) => {
      let path;
      try { path = new URL(a.getAttribute('href'), origin).pathname; } catch { return null; }
      const m = path.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (!m || !USER_RE.test(m[1])) return null;
      return { username: m[1], text: (a.innerText || a.textContent || '').trim(), anchor: a };
    }).filter(Boolean);
    const account = candidates.find((c) => c.text.replace(/\s/g, '').includes('@' + c.username))
      || candidates.find((c) => c.anchor.matches('[tabindex="-1"]'))
      || (nameArea !== cell ? candidates[0] : null);
    if (!account) return null;
    const display = candidates.find((c) => c.username.toLowerCase() === account.username.toLowerCase()
      && c.text && !c.text.startsWith('@'));
    let name = (display && display.text || '').split('\n')[0].trim();
    if (!name || name === '@' + account.username) {
      const raw = (nameArea.innerText || nameArea.textContent || '').split('\n').map((s) => s.trim());
      name = raw.find((s) => s && s !== '@' + account.username && !FOLLOWS_YOU_RE.test(s)) || account.username;
    }
    const verified = !!nameArea.querySelector('[data-testid="icon-verified"], svg[aria-label="认证账号"], svg[aria-label="Verified account"]');
    return { key: account.username.toLowerCase(), name, handle: '@' + account.username, url: 'https://x.com/' + account.username, verified };
  }

  function followsYou(cell) {
    if (cell.querySelector('[data-testid="userFollowIndicator"]')) return true;
    return [...cell.querySelectorAll('span')].some((el) => FOLLOWS_YOU_RE.test((el.innerText || el.textContent || '').trim()));
  }

  /**
   * 合并一次扫描结果。
   * prev: 上次保存的数据 {users:{key:{name,handle,url,followsYou,firstFollowedBackAt?}}, unfollowEvents:[...]}
   * scanned: 本次看到的 Map/对象 key -> {name,handle,url,followsYou}
   * complete: 本次是否扫到底。扫完整才删除列表里已经没有的人（说明你已经取关了对方）。
   * 返回 {data, newUnfollowers}
   */
  function mergeScan(prev, scanned, complete, now) {
    const prevUsers = (prev && prev.users) || {};
    const events = ((prev && prev.unfollowEvents) || []).map((e) => Object.assign({}, e));
    const done = Object.assign({}, (prev && prev.done) || {});
    const users = complete ? {} : Object.assign({}, prevUsers);
    const newUnfollowers = [];
    const entries = scanned instanceof Map ? [...scanned.entries()] : Object.entries(scanned || {});
    for (const [key, u] of entries) {
      const old = prevUsers[key];
      if (old && old.followsYou === true && u.followsYou === false) {
        const ev = { key, name: u.name, handle: u.handle, url: u.url, at: now };
        events.push(ev); newUnfollowers.push(ev);
        delete done['unf:' + key];
      }
      if (u.followsYou) delete done['nfb:' + key];
      if (u.verified) delete done['nbv:' + key];
      users[key] = { name: u.name, handle: u.handle, url: u.url, followsYou: !!u.followsYou, verified: !!u.verified };
    }
    // 已不在关注列表里的人：取关事件保留，但标记为“你已取关”。
    for (const ev of events) {
      ev.stillFollowing = Object.prototype.hasOwnProperty.call(users, ev.key);
      ev.followsAgain = !!(users[ev.key] && users[ev.key].followsYou);
    }
    return {
      data: { users, unfollowEvents: events.slice(-500), done, lastScanAt: now, lastScanComplete: !!complete, lastScanCount: entries.length },
      newUnfollowers,
    };
  }

  function nonVerified(data) {
    return Object.entries((data && data.users) || {})
      .filter(([, u]) => u.verified === false)
      .map(([key, u]) => Object.assign({ key }, u))
      .sort((a, b) => a.handle.localeCompare(b.handle));
  }

  function nonFollowers(data) {
    return Object.entries((data && data.users) || {})
      .filter(([, u]) => !u.followsYou)
      .map(([key, u]) => Object.assign({ key }, u))
      .sort((a, b) => a.handle.localeCompare(b.handle));
  }

  /**
   * 解析 X 网页版「Following」接口的一页结果（兼容新旧两种字段位置）。
   * 返回 {users:[{key,name,handle,url,followsYou,known}], bottom:游标或null}
   */
  function parseFollowingPage(json) {
    const out = { users: [], bottom: null };
    const tl = json && json.data && json.data.user && json.data.user.result &&
      (json.data.user.result.timeline && json.data.user.result.timeline.timeline || json.data.user.result.timeline_v2 && json.data.user.result.timeline_v2.timeline);
    const instructions = (tl && tl.instructions) || [];
    const entries = [];
    for (const ins of instructions) {
      if (Array.isArray(ins.entries)) entries.push(...ins.entries);
      if (ins.entry) entries.push(ins.entry);
    }
    for (const e of entries) {
      const c = e && e.content || {};
      if (c.cursorType === 'Bottom' || /^cursor-bottom/.test(e.entryId || '')) { out.bottom = c.value || null; continue; }
      let r = c.itemContent && c.itemContent.user_results && c.itemContent.user_results.result;
      if (r && r.__typename === 'UserWithVisibilityResults' && r.user) r = r.user;
      if (!r || r.__typename === 'UserUnavailable') continue;
      const legacy = r.legacy || {};
      const core = r.core || {};
      const sn = core.screen_name || legacy.screen_name;
      if (!sn || !USER_RE.test(sn)) continue;
      const rp = r.relationship_perspectives || {};
      const verified = r.is_blue_verified === true || legacy.verified === true || !!(r.verification && r.verification.verified);
      let fy = legacy.followed_by;
      if (typeof fy !== 'boolean') fy = rp.followed_by;
      out.users.push({
        key: sn.toLowerCase(), name: core.name || legacy.name || sn, handle: '@' + sn,
        url: 'https://x.com/' + sn, followsYou: fy === true, known: typeof fy === 'boolean', verified,
      });
    }
    return out;
  }

  /** 从 X 的前端脚本里找某个接口的 queryId 与网页版公开 bearer。 */
  function findQueryId(jsText, op) {
    const re = new RegExp('queryId:"([A-Za-z0-9_-]{10,40})",operationName:"' + op + '"');
    const m = String(jsText).match(re);
    return m ? m[1] : null;
  }
  function findBearer(jsText) {
    const m = String(jsText).match(/"(AAAAAAAAAAAAAAAAAAAAA[A-Za-z0-9%]{40,140})"/);
    return m ? m[1] : null;
  }
  function missingFeatures(errText) {
    const m = String(errText || '').match(/features cannot be null:\s*([A-Za-z0-9_,\s]+)/i);
    return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  }

  function csv(rows, cols) {
    const q = (v) => {
      let s = String(v == null ? '' : v);
      if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [cols.map((c) => q(c[0])).join(','), ...rows.map((r) => cols.map((c) => q(r[c[1]])).join(','))].join('\r\n');
  }

  root.XFC = { followingOwner, extractAccount, followsYou, mergeScan, nonFollowers, nonVerified, csv, parseFollowingPage, findQueryId, findBearer, missingFeatures };
})(typeof window !== 'undefined' ? window : globalThis);
