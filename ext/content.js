/* X 回关检查 · 页面面板
 * 扫描：优先直接读取 X 网页版自己用的「正在关注」数据（不用滚动页面）；读不到时自动改用滚动列表方式。
 * 定位：直接打开对方主页并高亮「正在关注」按钮，你自己点它取关；插件不会替你关注或取关任何人。
 * 一键清理（仅「取关了我」）：确认后在对方主页依次点 X 自带的「从列表中添加/移除」「屏蔽」「举报→垃圾信息」，一次一人。
 */
(() => {
  'use strict';
  if (window.__xfcLoaded) return;
  window.__xfcLoaded = true;
  const X = window.XFC;
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const SCROLL = { maxRounds: 2500, idleLimit: 12, intervalMs: 1050 };
  const API = { pageSize: 100, gapMs: 900, maxPages: 120 };
  const DEFAULT_BEARER = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
  const FEATURES = {
    rweb_video_screen_enabled: false, profile_label_improvements_pcf_label_in_post_enabled: true,
    responsive_web_profile_redirect_enabled: false, rweb_tipjar_consumption_enabled: true,
    verified_phone_label_enabled: false, creator_subscriptions_tweet_preview_api_enabled: true,
    responsive_web_graphql_timeline_navigation_enabled: true, responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
    premium_content_api_read_enabled: false, communities_web_enable_tweet_community_results_fetch: true,
    c9s_tweet_anatomy_moderator_badge_enabled: true, responsive_web_grok_analyze_button_fetch_trends_enabled: false,
    responsive_web_grok_analyze_post_followups_enabled: true, responsive_web_jetfuel_frame: true,
    responsive_web_grok_share_attachment_enabled: true, articles_preview_enabled: true,
    responsive_web_edit_tweet_api_enabled: true, graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
    view_counts_everywhere_api_enabled: true, longform_notetweets_consumption_enabled: true,
    responsive_web_twitter_article_tweet_consumption_enabled: true, tweet_awards_web_tipping_enabled: false,
    responsive_web_grok_show_grok_translated_post: false, responsive_web_grok_analysis_button_from_backend: true,
    creator_subscriptions_quote_tweet_preview_enabled: false, freedom_of_speech_not_reach_fetch_enabled: true,
    standardized_nudges_misinfo: true, tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
    longform_notetweets_rich_text_read_enabled: true, longform_notetweets_inline_media_enabled: true,
    payments_enabled: false, responsive_web_grok_image_annotation_enabled: true,
    responsive_web_grok_imagine_annotation_enabled: true, responsive_web_grok_community_note_auto_translation_is_enabled: false,
    responsive_web_enhance_cards_enabled: false,
  };

  const ui = { tab: 'nfb', q: '', hideDone: true, open: false };
  let job = null;          // {kind, stop}
  let data = null;         // 当前账号的保存数据
  let me = null;           // 当前登录账号 {handle, id}
  let focus = null;        // 正在处理的人 {key, handle, mode}

  // ---------- 存储 ----------
  const keyOf = (h) => 'xfc:' + String(h).toLowerCase();
  const store = {
    get: (k) => new Promise((res) => chrome.storage.local.get(k, (v) => res(v[k]))),
    set: (k, v) => new Promise((res, rej) => chrome.storage.local.set({ [k]: v }, () =>
      chrome.runtime.lastError ? rej(new Error(chrome.runtime.lastError.message)) : res())),
    del: (k) => new Promise((res) => chrome.storage.local.remove(k, res)),
  };
  const cookie = (n) => { const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : null; };

  function whoAmI() {
    const a = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    const m = a && (a.getAttribute('href') || '').match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
    const t = (cookie('twid') || '').match(/u[=%3D]+(\d+)/i);
    return m ? { handle: m[1], id: t ? t[1] : null } : null;
  }

  // ---------- 界面 ----------
  const host = document.createElement('div');
  host.id = 'xfc-root';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
<style>
:host{all:initial}
*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.fab{position:fixed;right:20px;bottom:24px;z-index:2147483646;border:0;border-radius:999px;padding:11px 16px;
 background:#1d9bf0;color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(29,155,240,.35)}
.fab:hover{background:#1a8cd8}
.panel{position:fixed;right:20px;bottom:80px;z-index:2147483647;width:390px;max-width:calc(100vw - 32px);
 height:min(660px,calc(100vh - 110px));display:none;flex-direction:column;background:#fff;color:#0f1419;
 border:1px solid #e6ecf0;border-radius:16px;box-shadow:0 12px 40px rgba(15,20,25,.16);overflow:hidden}
.panel.open{display:flex}
.hd{padding:14px 16px 12px;border-bottom:1px solid #eff3f4}
.ttl{display:flex;align-items:center;justify-content:space-between;font-size:16px;font-weight:700}
.x{border:0;background:none;font-size:22px;line-height:1;cursor:pointer;color:#536471}
.meta{margin-top:6px;font-size:12.5px;color:#536471;line-height:1.6}
.warn{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fff8e1;color:#7a5b00;font-size:12.5px;line-height:1.55}
.bar{display:flex;gap:8px;margin-top:10px}
.btn{border:1px solid #cfd9de;background:#fff;color:#0f1419;border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.btn.pri{background:#0f1419;border-color:#0f1419;color:#fff}
.btn.blue{background:#1d9bf0;border-color:#1d9bf0;color:#fff}
.btn:disabled{opacity:.45;cursor:default}
.prog{margin-top:8px;font-size:12.5px;color:#536471;min-height:18px;line-height:1.5}
.pbar{height:4px;border-radius:4px;background:#eff3f4;margin-top:6px;overflow:hidden;display:none}
.pbar i{display:block;height:100%;width:0;background:#1d9bf0;transition:width .3s}
.cur{margin:10px 12px 0;padding:10px 12px;border-radius:12px;background:#fdf2f8;border:1px solid #fbcfe8;display:none;align-items:center;gap:8px}
.cur.show{display:flex}
.cur .t{flex:1;min-width:0;font-size:13px;line-height:1.5}
.cur b{color:#be185d}
.tabs{display:flex;border-bottom:1px solid #eff3f4;margin-top:6px}
.tab{flex:1;border:0;background:none;padding:11px 2px;font-size:13px;font-weight:600;color:#536471;cursor:pointer;border-bottom:3px solid transparent}
.tab.on{color:#0f1419;border-bottom-color:#1d9bf0}
.tools{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #eff3f4}
.tools input[type=search]{flex:1;min-width:0;border:1px solid #cfd9de;border-radius:999px;padding:6px 12px;font-size:13px;outline:none}
.tools label{font-size:12px;color:#536471;white-space:nowrap;display:flex;gap:4px;align-items:center}
.list{flex:1;min-height:0;overflow:auto;padding-bottom:8px}
.row{display:flex;align-items:center;gap:6px;padding:9px 12px;border-bottom:1px solid #f4f6f7}
.row.done{opacity:.45}
.row.cur1{background:#fdf2f8}
.who{flex:1;min-width:0;cursor:pointer}
.nm{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hd2{font-size:12.5px;color:#536471;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tag{display:inline-block;margin-left:4px;padding:0 6px;border-radius:6px;font-size:11px;background:#eff3f4;color:#536471}
.sm{border:1px solid #cfd9de;background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;white-space:nowrap;color:#0f1419}
.sm.go{border-color:#f91880;color:#f91880;font-weight:600}
.sm.cl{border-color:#f4212e;background:#f4212e;color:#fff;font-weight:600}
.sm:disabled{opacity:.45;cursor:default}
.empty{padding:28px 16px;text-align:center;color:#536471;font-size:13px;line-height:1.7}
</style>
<button class="fab" id="fab">回关检查</button>
<div class="panel" id="panel">
  <div class="hd">
    <div class="ttl"><span>X 回关检查</span><button class="x" id="close" title="收起">×</button></div>
    <div class="meta" id="meta"></div>
    <div id="warn"></div>
    <div class="bar">
      <button class="btn pri" id="scan">重新扫描</button>
      <button class="btn" id="stop" disabled>停止</button>
      <button class="btn" id="csv">导出表格</button>
    </div>
    <div class="pbar" id="pbar"><i id="pfill"></i></div>
    <div class="prog" id="prog"></div>
  </div>
  <div class="cur" id="cur"><div class="t" id="curt"></div><button class="btn blue" id="next">下一个</button></div>
  <div class="tabs">
    <button class="tab on" data-t="nfb" id="t-nfb">没回关我</button>
    <button class="tab" data-t="unf" id="t-unf">取关了我</button>
    <button class="tab" data-t="nbv" id="t-nbv">非蓝V</button>
  </div>
  <div class="tools">
    <input type="search" id="q" placeholder="搜名字或 @用户名">
    <label><input type="checkbox" id="hide" checked>隐藏已处理</label>
  </div>
  <div class="list" id="list"></div>
</div>`;
  const $ = (id) => shadow.getElementById(id);
  (document.body || document.documentElement).appendChild(host);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmt(t) { return t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '—'; }
  function prog(msg, pct) {
    $('prog').textContent = msg || '';
    $('pbar').style.display = pct == null ? 'none' : 'block';
    if (pct != null) $('pfill').style.width = Math.max(3, Math.min(100, pct)) + '%';
  }

  function rows() {
    if (!data) return [];
    const q = ui.q.trim().toLowerCase();
    let list;
    if (ui.tab === 'nfb') {
      list = X.nonFollowers(data).map((u) => Object.assign({ doneKey: 'nfb:' + u.key }, u));
    } else if (ui.tab === 'nbv') {
      list = X.nonVerified(data).map((u) => Object.assign({ doneKey: 'nbv:' + u.key }, u));
    } else {
      const latest = new Map();
      for (const e of data.unfollowEvents || []) latest.set(e.key, e);
      list = [...latest.values()].sort((a, b) => b.at - a.at).map((e) => Object.assign({ doneKey: 'unf:' + e.key }, e));
    }
    list.forEach((r) => { r.done = !!(data.done || {})[r.doneKey]; });
    if (q) list = list.filter((r) => (r.name + ' ' + r.handle).toLowerCase().includes(q));
    if (ui.hideDone) list = list.filter((r) => !r.done || (focus && focus.key === r.key));
    return list;
  }

  function render() {
    me = whoAmI() || me;
    let meta = me ? `账号 <b>@${esc(me.handle)}</b>` : '没识别到登录账号，请先登录 X。';
    if (me && data && data.lastScanAt) meta += ` · 上次扫描 ${esc(fmt(data.lastScanAt))}，共关注 ${data.lastScanCount} 人${data.lastScanComplete ? '' : '（没扫完整）'}`;
    $('meta').innerHTML = meta;
    $('warn').innerHTML = data && data.lastScanAt && !data.lastScanComplete ? '<div class="warn">上次扫描没走完，名单可能不全，建议点「重新扫描」。</div>' : '';
    const busy = !!job && job.kind === 'scan';
    $('scan').disabled = busy || !me;
    $('stop').disabled = !job;
    $('csv').disabled = !data || !data.lastScanAt;
    const done = (data && data.done) || {};
    const nNfb = data ? X.nonFollowers(data).filter((u) => !done['nfb:' + u.key]).length : 0;
    const nUnf = data ? new Set((data.unfollowEvents || []).filter((e) => !done['unf:' + e.key]).map((e) => e.key)).size : 0;
    $('t-nfb').textContent = `没回关我（${nNfb}）`;
    $('t-unf').textContent = `取关了我（${nUnf}）`;
    const nNbv = data ? X.nonVerified(data).filter((u) => !done['nbv:' + u.key]).length : 0;
    $('t-nbv').textContent = `非蓝V（${nNbv}）`;
    shadow.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.t === ui.tab));
    renderFocus();

    const list = rows();
    if (!data || !data.lastScanAt) { $('list').innerHTML = `<div class="empty">${busy ? '正在读取你的关注名单…' : '点「重新扫描」开始。'}</div>`; return; }
    if (!list.length) {
      const oldData = ui.tab === 'nbv' && Object.values(data.users || {}).some((u) => u.verified === undefined);
      $('list').innerHTML = `<div class="empty">${oldData ? '这份名单是旧版本扫的，没记录蓝V。点「重新扫描」后就能看到。' : ui.tab === 'nbv' ? '你关注的人全是蓝V' : ui.tab === 'nfb' ? '没有没回关你的人 🎉' : '还没发现取关你的人。<br>第一次扫描只是记下谁关注了你；以后每次扫描，会把关注过你、现在又不关注的人列在这里。'}</div>`;
      return;
    }
    $('list').innerHTML = list.map((r) => {
      let tag = '';
      if (ui.tab === 'nbv') tag = r.followsYou ? '<span class="tag">关注了你</span>' : '<span class="tag">没回关</span>';
      if (ui.tab === 'unf') {
        tag = `<span class="tag">${esc(fmt(r.at))} 发现</span>`;
        if (!r.stillFollowing) tag += '<span class="tag">你已取关</span>';
        else if (r.followsAgain) tag += '<span class="tag">又回关了</span>';
      }
      const cur = focus && focus.key === r.key;
      return `<div class="row${r.done ? ' done' : ''}${cur ? ' cur1' : ''}" data-k="${esc(r.key)}" data-d="${esc(r.doneKey)}" data-h="${esc(r.handle)}">
  <div class="who" data-a="go" title="打开主页"><div class="nm">${esc(r.name)}</div><div class="hd2">${esc(r.handle)}${tag}</div></div>
  ${ui.tab === 'unf' && !r.done ? '<button class="sm cl" data-a="clean" title="从你的列表中移除 + 屏蔽 + 举报为垃圾信息（会先让你确认）"' + (job && job.kind === 'clean' ? ' disabled' : '') + '>一键清理</button>' : '<button class="sm go" data-a="go">去取关</button>'}
  <button class="sm" data-a="done">${r.done ? '撤销' : '已处理'}</button>
</div>`;
    }).join('');
  }

  function renderFocus() {
    if (!focus) { $('cur').classList.remove('show'); return; }
    $('cur').classList.add('show');
    if (focus.state === 'clean') { $('curt').innerHTML = `<b>${esc(focus.handle)}</b>：${focus.msg || ''}`; return; }
    const st = { wait: '正在打开主页…', ready: '已高亮他的<b>「正在关注」</b>按钮，点它并确认即可取关', unfollowed: '<b>已取关</b>，已自动标记为已处理', gone: '没找到「正在关注」按钮，可能你已经取关了他', fail: '主页没打开，请稍后再试' }[focus.state] || '';
    $('curt').innerHTML = `<b>${esc(focus.handle)}</b>：${st}`;
  }

  // ---------- 扫描方式一：直接读取数据（不滚动） ----------
  async function discover(force) {
    const cached = await store.get('xfc:api');
    if (!force && cached && cached.queryId && Date.now() - cached.at < 7 * 864e5) return cached;
    const urls = [...document.querySelectorAll('script[src]')].map((s) => s.src).filter((u) => u.startsWith('https://abs.twimg.com/'));
    const res = await new Promise((r) => chrome.runtime.sendMessage({ type: 'xfc-discover', op: 'Following', urls }, (v) => r(v || {})));
    if (!res.queryId) return null;
    const out = { queryId: res.queryId, bearer: res.bearer || DEFAULT_BEARER, features: (cached && cached.queryId === res.queryId && cached.features) || null, at: Date.now() };
    await store.set('xfc:api', out);
    return out;
  }

  async function apiPage(api, userId, cursor) {
    const features = Object.assign({}, FEATURES, api.features || {});
    for (let attempt = 0; attempt < 4; attempt++) {
      const vars = { userId, count: API.pageSize, includePromotedContent: false };
      if (cursor) vars.cursor = cursor;
      const url = `/i/api/graphql/${api.queryId}/Following?variables=${encodeURIComponent(JSON.stringify(vars))}&features=${encodeURIComponent(JSON.stringify(features))}`;
      const r = await fetch(url, {
        credentials: 'include',
        headers: {
          authorization: 'Bearer ' + api.bearer, 'x-csrf-token': cookie('ct0') || '',
          'x-twitter-active-user': 'yes', 'x-twitter-auth-type': 'OAuth2Session', 'x-twitter-client-language': 'zh-cn',
          'content-type': 'application/json',
        },
      });
      if (r.status === 429) {
        const reset = +r.headers.get('x-rate-limit-reset');
        const wait = reset ? Math.min(16 * 60, Math.max(5, reset - Date.now() / 1000)) : 60;
        for (let s = Math.ceil(wait); s > 0 && !job.stop; s--) { prog(`X 限制了读取频率，${s} 秒后自动继续…`, job.pct); await delay(1000); }
        if (job.stop) throw new Error('stopped');
        continue;
      }
      const text = await r.text();
      if (r.status === 400) {
        const miss = X.missingFeatures(text);
        if (miss.length) { miss.forEach((f) => { features[f] = true; }); api.features = Object.assign(api.features || {}, Object.fromEntries(miss.map((f) => [f, true]))); continue; }
      }
      if (!r.ok) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
      let json; try { json = JSON.parse(text); } catch { throw new Error('返回内容不是数据'); }
      if (json.errors && !json.data) throw new Error((json.errors[0] && json.errors[0].message) || '接口报错');
      return X.parseFollowingPage(json);
    }
    throw new Error('多次重试仍失败');
  }

  async function scanApi(who) {
    let api = await discover(false);
    if (!api) throw new Error('没找到 X 的数据接口');
    const seen = new Map();
    let cursor = null, pages = 0, unknown = 0, total = 0, complete = false;
    while (pages < API.maxPages && !job.stop) {
      let page;
      try { page = await apiPage(api, who.id, cursor); } catch (e) {
        if (pages === 0 && (e.status === 404 || e.status === 400) && !api.retried) { api = await discover(true); if (!api) throw e; api.retried = true; continue; }
        throw e;
      }
      pages++;
      let added = 0;
      for (const u of page.users) { total++; if (!u.known) unknown++; if (!seen.has(u.key)) added++; seen.set(u.key, u); }
      if (total >= 10 && unknown / total > 0.5) throw new Error('读不到“是否关注了你”这一项');
      job.pct = Math.min(95, 5 + pages * 6);
      prog(`正在读取：已读到 ${seen.size} 人…`, job.pct);
      if (!page.bottom || page.bottom === cursor || added === 0) { complete = true; break; }
      cursor = page.bottom;
      await delay(API.gapMs);
    }
    if (api.features) await store.set('xfc:api', Object.assign({}, api, { retried: undefined }));
    if (job.stop) return { seen, complete: false, reason: '你手动停止了' };
    return { seen, complete, reason: complete ? '读取完成' : '达到读取上限' };
  }

  // ---------- 扫描方式二：滚动列表（后备） ----------
  function cells() {
    const main = document.querySelector('[data-testid="primaryColumn"]');
    const all = main ? main.querySelectorAll('[data-testid="UserCell"]') : document.querySelectorAll('[data-testid="UserCell"]');
    return [...all].filter((c) => !c.closest('[data-testid="sidebarColumn"], aside, [aria-label="推荐关注"], [aria-label="Who to follow"]'));
  }
  function scroller() {
    const cell = cells()[0];
    for (let el = cell && cell.parentElement; el && el !== document.body; el = el.parentElement) {
      const s = getComputedStyle(el);
      if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 120) return el;
    }
    return document.scrollingElement || document.documentElement;
  }
  async function spaGo(path) {
    if (location.pathname === path) return;
    history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  }
  async function scanScroll(who) {
    const path = '/' + who.handle + '/following';
    if (location.pathname !== path) { await spaGo(path); await delay(1500); }
    for (let i = 0; i < 15 && !job.stop && !cells().length; i++) await delay(1000);
    if (!cells().length) throw new Error('没找到关注列表');
    const seen = new Map();
    const capture = () => {
      let added = 0;
      for (const cell of cells()) {
        const a = X.extractAccount(cell, location.origin);
        if (!a) continue;
        if (!seen.has(a.key)) added++;
        const prev = seen.get(a.key);
        seen.set(a.key, { name: a.name, handle: a.handle, url: a.url, followsYou: X.followsYou(cell) || !!(prev && prev.followsYou), verified: a.verified || !!(prev && prev.verified) });
      }
      return added;
    };
    scroller().scrollTop = 0; window.scrollTo(0, 0);
    await delay(1200);
    let idle = 0, complete = false, reason = '达到扫描上限';
    for (let round = 1; round <= SCROLL.maxRounds; round++) {
      if (job.stop) { reason = '你手动停止了'; break; }
      if (location.pathname !== path) { reason = '页面已离开关注列表'; break; }
      const a1 = capture();
      const s = scroller(); const top = s.scrollTop, h = s.scrollHeight;
      s.scrollTop = top + Math.max(450, Math.floor(s.clientHeight * 0.75));
      await delay(SCROLL.intervalMs);
      const a2 = capture();
      const s2 = scroller();
      const bottom = s2.scrollTop + s2.clientHeight >= s2.scrollHeight - 70;
      idle = (bottom && s2.scrollTop <= top + 2 && s2.scrollHeight <= h + 2 && a1 + a2 === 0) ? idle + 1 : 0;
      prog(`（滚动方式）已看到 ${seen.size} 人${idle ? `，确认到底 ${idle}/${SCROLL.idleLimit}` : ''}`, null);
      if (idle >= SCROLL.idleLimit) { complete = true; reason = '已扫到列表底部'; break; }
    }
    scroller().scrollTop = 0; window.scrollTo(0, 0);
    return { seen, complete, reason };
  }

  async function scan() {
    if (job) return;
    const who = whoAmI();
    if (!who) { prog('没识别到登录账号，请先登录 X。'); return; }
    me = who;
    job = { kind: 'scan', stop: false, pct: 3 };
    prog('正在读取你的关注名单…', 3);
    render();
    try {
      let res = null;
      if (who.id) {
        try { res = await scanApi(who); } catch (e) {
          if (e.message === 'stopped' || job.stop) res = { seen: new Map(), complete: false, reason: '你手动停止了' };
          else { prog(`快速读取没成功（${e.message}），改用滚动列表方式…`); await delay(1200); }
        }
      }
      if (!res) res = await scanScroll(who);
      if (!res.seen.size) throw new Error(res.reason === '你手动停止了' ? '已停止，没有保存' : '一个账号都没读到，结果未保存。');
      const prev = (await store.get(keyOf(who.handle))) || null;
      const { data: next, newUnfollowers } = X.mergeScan(prev, res.seen, res.complete, Date.now());
      await store.set(keyOf(who.handle), next);
      await store.set('xfc:last', who.handle);
      data = next;
      prog(`${res.reason}：共关注 ${res.seen.size} 人，没回关你的 ${X.nonFollowers(next).length} 人` +
        (newUnfollowers.length ? `，新发现 ${newUnfollowers.length} 人取关了你` : '') + (res.complete ? '' : '（结果不完整）'), null);
      if (newUnfollowers.length) ui.tab = 'unf';
    } catch (e) {
      prog('扫描失败：' + (e && e.message || e), null);
    } finally {
      job = null;
      render();
    }
  }

  // ---------- 直接定位：打开对方主页并高亮「正在关注」按钮 ----------
  function profileFollowBtn(handle) {
    const main = document.querySelector('[data-testid="primaryColumn"]');
    if (!main) return null;
    const nameBox = main.querySelector('[data-testid="UserName"]');
    if (!nameBox || !(nameBox.textContent || '').toLowerCase().includes(handle.toLowerCase())) return null;
    return main.querySelector('[data-testid$="-unfollow"]') || main.querySelector('[data-testid$="-follow"]');
  }
  function clearHl() {
    document.querySelectorAll('[data-xfc-hl]').forEach((el) => { el.style.outline = ''; el.style.boxShadow = ''; el.style.outlineOffset = ''; el.removeAttribute('data-xfc-hl'); });
  }
  async function go(key, handle) {
    const token = {};
    if (job && job.kind === 'scan') { prog('正在扫描，扫完再去取关。'); return; }
    if (job) job.stop = true;
    job = { kind: 'go', stop: false, token };
    focus = { key, handle, state: 'wait' };
    clearHl();
    render();
    const name = handle.replace(/^@/, '');
    await spaGo('/' + name);
    let btn = null;
    for (let i = 0; i < 40 && job && job.token === token; i++) {
      btn = profileFollowBtn(name);
      if (btn) break;
      if (i === 16 && location.pathname.toLowerCase() !== '/' + name.toLowerCase()) location.assign('/' + name);
      await delay(250);
    }
    if (!job || job.token !== token) return;
    if (!btn) { focus.state = 'fail'; job = null; render(); return; }
    if (/-follow$/.test(btn.getAttribute('data-testid'))) {
      focus.state = 'gone';
      await markDone(key, true, true);
      job = null; render(); return;
    }
    btn.scrollIntoView({ block: 'center' });
    btn.setAttribute('data-xfc-hl', '1');
    btn.style.outline = '3px solid #f91880';
    btn.style.outlineOffset = '3px';
    btn.style.boxShadow = '0 0 0 8px rgba(249,24,128,.18)';
    focus.state = 'ready';
    render();
    // 等你自己点「正在关注」→ 确认取关；按钮变成「关注」就自动标记已处理
    while (job && job.token === token && !job.stop) {
      await delay(400);
      if (location.pathname.toLowerCase() !== '/' + name.toLowerCase()) break;
      const b = profileFollowBtn(name);
      if (b && /-follow$/.test(b.getAttribute('data-testid'))) {
        clearHl();
        focus.state = 'unfollowed';
        await markDone(key, true, true);
        break;
      }
    }
    if (job && job.token === token) job = null;
    render();
  }

  // ---------- 取关了我：一键 移出列表 + 屏蔽 + 举报垃圾信息 ----------
  // 每次只处理一个人、点之前要你确认；用的是 X 自己主页「…」菜单里的同名功能，不调未公开接口、不批量。
  // 任何一步在页面上找不到按钮就停下，把那一步留给你手动点（X 改版时不会乱点）。
  const TX = {
    lists: /从列表中添加\/移除|添加\/移除.*列表|Add\/remove .*Lists?/i,
    block: /^屏蔽\s*@|^Block\s*@/i, report: /^举报\s*@|^Report\s*@/i,
    spam: /垃圾信息|^Spam\b/i,
    save: /^(保存|完成|Save|Done)$/i,
    next: /^(下一步|下一个|提交|完成|Next|Submit|Done)$/i,
  };
  const vis = (el) => !!el && el.getClientRects().length > 0;
  const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  async function waitFor(fn, ms = 4000) { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await delay(150); } }
  const byText = (root, sel, re) => [...root.querySelectorAll(sel)].find((el) => vis(el) && re.test(txt(el))) || null;
  const topDialog = () => { const d = [...document.querySelectorAll('[role="dialog"]')].filter(vis); return d[d.length - 1] || null; };
  const mainCol = () => document.querySelector('[data-testid="primaryColumn"]');
  function closeLayer() {
    const d = topDialog();
    const x = d && (d.querySelector('[data-testid="app-bar-close"]') || byText(d, '[role="button"],button', /^(关闭|Close|取消|Cancel)$/i));
    if (x) { x.click(); return; }
    (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
  }
  async function menuItem(testid, re) {
    const main = mainCol(); const more = main && main.querySelector('[data-testid="userActions"]');
    if (!more) return null;
    more.click();
    const menu = await waitFor(() => [...document.querySelectorAll('[role="menu"]')].find(vis), 3000);
    if (!menu) return null;
    const it = (testid && menu.querySelector(`[data-testid="${testid}"]`)) || byText(menu, '[role="menuitem"]', re);
    if (!it) closeLayer();
    return it;
  }
  function hl(el) { if (!el) return; el.scrollIntoView({ block: 'center' }); el.setAttribute('data-xfc-hl', '1'); el.style.outline = '3px solid #f4212e'; el.style.outlineOffset = '2px'; }
  const isBlocked = () => { const m = mainCol(); return !!(m && (m.querySelector('[data-testid$="-unblock"]') || byText(m, 'button,[role="button"]', /^(已屏蔽|Blocked)$/i))); };

  async function stepLists() {
    const it = await menuItem('', TX.lists);
    if (!it) return { ok: false, msg: '没找到「从列表中添加/移除」' };
    it.click();
    const dlg = await waitFor(() => { const d = topDialog(); return d && d.querySelector('[role="checkbox"], input[type="checkbox"]') ? d : null; }, 6000);
    if (!dlg) { closeLayer(); return { ok: false, msg: '列表窗口没打开' }; }
    const on = [...dlg.querySelectorAll('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked')];
    for (const c of on) { c.click(); await delay(350); }
    if (on.length) {
      const save = byText(dlg, '[role="button"],button', TX.save);
      if (!save) return { ok: false, msg: '取消了勾选，但没找到「保存」，请你点一下保存', el: dlg };
      save.click();
      await waitFor(() => !document.body.contains(dlg) || !vis(dlg), 5000);
      return { ok: true, msg: `已从你的 ${on.length} 个列表中移除` };
    }
    closeLayer(); await delay(300);
    return { ok: true, msg: '他不在你的任何列表里' };
  }
  async function stepBlock() {
    if (isBlocked()) return { ok: true, msg: '之前已屏蔽' };
    const it = await menuItem('block', TX.block);
    if (!it) return { ok: false, msg: '菜单里没找到「屏蔽」' };
    it.click();
    const ok = await waitFor(() => document.querySelector('[data-testid="confirmationSheetConfirm"]'), 4000);
    if (!ok) return { ok: false, msg: '屏蔽确认框没出现' };
    ok.click();
    return (await waitFor(isBlocked, 6000)) ? { ok: true, msg: '已屏蔽' } : { ok: false, msg: '点了屏蔽，但页面没显示「已屏蔽」' };
  }
  async function stepReport() {
    const it = await menuItem('report', TX.report);
    if (!it) return { ok: false, msg: '菜单里没找到「举报」' };
    it.click();
    let chose = false;
    for (let i = 0; i < 6; i++) {
      const dlg = await waitFor(topDialog, i ? 2500 : 6000);
      if (!dlg) return chose ? { ok: true, msg: '已举报为垃圾信息' } : { ok: false, msg: '举报窗口没打开' };
      const opt = byText(dlg, '[role="radio"],label,[role="option"],[role="button"]', TX.spam);
      if (opt && !chose) { (opt.querySelector('input,[role="radio"]') || opt).click(); chose = true; await delay(400); }
      const nx = dlg.querySelector('[data-testid="ChoiceSelectionNextButton"]') || byText(dlg, '[role="button"],button', TX.next);
      if (!chose || !nx || nx.disabled || nx.getAttribute('aria-disabled') === 'true') {
        return { ok: false, msg: chose ? '举报窗口还差一步，请你在窗口里点完' : '举报窗口里没找到「垃圾信息」，请你在窗口里选', el: dlg };
      }
      nx.click();
      await delay(900);
      if (!topDialog()) return { ok: true, msg: '已举报为垃圾信息' };
    }
    return { ok: false, msg: '举报窗口步骤比预期多，请你在窗口里点完', el: topDialog() };
  }

  async function clean(key, handle) {
    if (job && job.kind === 'scan') { prog('正在扫描，扫完再处理。'); return; }
    const name = handle.replace(/^@/, '');
    if (!confirm(`对 @${name} 依次执行：\n1. 从你的列表中移除\n2. 屏蔽（会自动互相取关）\n3. 举报为垃圾信息\n\n只建议用在互关后又取关的营销号上。确定吗？`)) return;
    if (job) job.stop = true;
    const token = {};
    job = { kind: 'clean', stop: false, token };
    focus = { key, handle, state: 'clean', msg: '正在打开主页…' };
    clearHl(); render();
    await spaGo('/' + name);
    const ready = await waitFor(() => {
      const nb = mainCol() && mainCol().querySelector('[data-testid="UserName"]');
      return nb && txt(nb).toLowerCase().includes('@' + name.toLowerCase()) && mainCol().querySelector('[data-testid="userActions"]');
    }, 10000);
    if (!job || job.token !== token) return;
    if (!ready) { focus.msg = '主页没打开，请稍后再试'; job = null; render(); return; }
    const out = [];
    for (const [label, fn] of [['列表', stepLists], ['屏蔽', stepBlock], ['举报', stepReport]]) {
      if (!job || job.token !== token || job.stop) return;
      focus.msg = out.concat(`正在处理：${label}…`).join(' · '); render();
      let r;
      try { r = await fn(); } catch (e) { r = { ok: false, msg: label + '出错：' + (e && e.message || e) }; }
      out.push((r.ok ? '✅ ' : '⚠️ ') + r.msg);
      if (!r.ok) {
        if (r.el) hl(r.el); else hl(mainCol() && mainCol().querySelector('[data-testid="userActions"]'));
        focus.msg = out.join(' · ') + '<br>后面的步骤先停了，请你在页面上手动完成（已用红框标出）';
        job = null; render(); return;
      }
      await delay(500);
    }
    await markDone(key, true, true);
    focus.msg = out.join(' · ') + '<br><b>已全部完成</b>，已标记为已处理';
    job = null; render();
  }

  function nextTarget() {
    const list = rows().filter((r) => !r.done && (!focus || r.key !== focus.key));
    return list[0] || null;
  }

  async function markDone(key, val, both) {
    if (!me || !data) return;
    const cur = (await store.get(keyOf(me.handle))) || data;
    cur.done = cur.done || {};
    const keys = both ? ['nfb:' + key, 'unf:' + key, 'nbv:' + key] : [ui.tab + ':' + key];
    const on = val === undefined ? !cur.done[keys[0]] : val;
    for (const dk of keys) { if (on) cur.done[dk] = Date.now(); else delete cur.done[dk]; }
    await store.set(keyOf(me.handle), cur);
    data = cur;
  }

  function exportCsv() {
    if (!data) return;
    let rowsOut, cols, name;
    if (ui.tab === 'nfb') {
      rowsOut = X.nonFollowers(data).map((u) => Object.assign({}, u, { st: (data.done || {})['nfb:' + u.key] ? '已处理' : '' }));
      cols = [['显示名称', 'name'], ['用户名', 'handle'], ['个人主页', 'url'], ['状态', 'st']];
      name = '没回关我';
    } else if (ui.tab === 'nbv') {
      rowsOut = X.nonVerified(data).map((u) => Object.assign({}, u, { fy: u.followsYou ? '是' : '否', st: (data.done || {})['nbv:' + u.key] ? '已处理' : '' }));
      cols = [['显示名称', 'name'], ['用户名', 'handle'], ['个人主页', 'url'], ['是否关注了你', 'fy'], ['状态', 'st']];
      name = '非蓝V';
    } else {
      rowsOut = (data.unfollowEvents || []).map((e) => Object.assign({}, e, { t: fmt(e.at) }));
      cols = [['显示名称', 'name'], ['用户名', 'handle'], ['个人主页', 'url'], ['发现时间', 't']];
      name = '取关了我';
    }
    const blob = new Blob([X.csv(rowsOut, cols)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `X_${name}_${me ? me.handle : ''}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  // ---------- 打开面板：没扫过就自动开始 ----------
  async function openPanel() {
    ui.open = true;
    $('panel').classList.add('open');
    me = whoAmI() || me;
    for (let i = 0; i < 20 && !me; i++) { await delay(500); me = whoAmI(); }
    if (me) data = (await store.get(keyOf(me.handle))) || null;
    render();
    if (me && (!data || !data.lastScanAt) && !job) scan();
  }

  $('fab').onclick = () => { if (ui.open) { ui.open = false; $('panel').classList.remove('open'); } else openPanel(); };
  $('close').onclick = () => { ui.open = false; $('panel').classList.remove('open'); };
  $('scan').onclick = scan;
  $('stop').onclick = () => { if (job) job.stop = true; if (job && (job.kind === 'go' || job.kind === 'clean')) { job = null; focus = null; clearHl(); render(); } };
  $('csv').onclick = exportCsv;
  $('next').onclick = () => { const n = nextTarget(); if (n) go(n.key, n.handle); else { focus = null; prog('这一页的人都处理完了。'); render(); } };
  $('q').oninput = (e) => { ui.q = e.target.value; render(); };
  $('hide').onchange = (e) => { ui.hideDone = e.target.checked; render(); };
  shadow.querySelectorAll('.tab').forEach((t) => { t.onclick = () => { ui.tab = t.dataset.t; render(); }; });
  $('list').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const row = b.closest('.row');
    if (b.dataset.a === 'go') go(row.dataset.k, row.dataset.h);
    else if (b.dataset.a === 'clean') clean(row.dataset.k, row.dataset.h);
    else if (b.dataset.a === 'done') { await markDone(row.dataset.k); render(); }
  });

  chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === 'xfc-open') openPanel(); });
  store.get('xfc:autoOpen').then((t) => { if (t && Date.now() - t < 60000) { store.del('xfc:autoOpen'); openPanel(); } });
})();
