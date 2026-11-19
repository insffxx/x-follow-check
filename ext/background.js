/* X 回关检查 · 后台：点工具栏图标直接打开面板；读取 X 前端脚本里的接口编号（只读 abs.twimg.com 公开脚本）。 */
importScripts('core.js');
const X = self.XFC;

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.storage.local.set({ 'xfc:autoOpen': Date.now() });
  if (tab && /^https:\/\/(x|twitter)\.com\//.test(tab.url || '')) {
    try { await chrome.tabs.sendMessage(tab.id, { type: 'xfc-open' }); return; } catch (e) { /* 页面还没注入，刷新一次 */ }
    chrome.tabs.reload(tab.id);
    return;
  }
  const [xt] = await chrome.tabs.query({ url: ['https://x.com/*', 'https://twitter.com/*'] });
  if (xt) {
    await chrome.tabs.update(xt.id, { active: true });
    await chrome.windows.update(xt.windowId, { focused: true });
    try { await chrome.tabs.sendMessage(xt.id, { type: 'xfc-open' }); } catch (e) { chrome.tabs.reload(xt.id); }
  } else {
    chrome.tabs.create({ url: 'https://x.com/home' });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'xfc-discover') return;
  (async () => {
    const urls = (msg.urls || []).filter((u) => /^https:\/\/abs\.twimg\.com\/responsive-web\/client-web[^/]*\/[A-Za-z0-9._~-]+\.js$/.test(u)).slice(0, 40);
    // main.* 优先，接口编号通常在里面
    urls.sort((a, b) => (/\/main\./.test(b) ? 1 : 0) - (/\/main\./.test(a) ? 1 : 0));
    const res = { queryId: null, bearer: null, checked: 0 };
    for (const u of urls) {
      try {
        const r = await fetch(u, { credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!r.ok) continue;
        const t = await r.text();
        res.checked++;
        res.queryId = res.queryId || X.findQueryId(t, msg.op || 'Following');
        res.bearer = res.bearer || X.findBearer(t);
        if (res.queryId && res.bearer) break;
      } catch (e) { /* 换下一个 */ }
    }
    reply(res);
  })();
  return true;
});
