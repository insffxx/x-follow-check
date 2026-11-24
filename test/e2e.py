"""v1.3 端到端（含 v1.1 全部场景 + 场景 C 一键清理）：真实 Chromium 加载插件，合成 x.com 单页应用 + 合成 Following 接口。不访问真实 X。
场景 A：接口可用 → 不滚动页面直接读完；第二次发现取关；「去取关」直接跳主页并高亮按钮，用户点后自动标已处理；「下一个」。
场景 B：接口 404 → 自动改用滚动列表方式。
"""
import asyncio, json, pathlib, re, sys, tempfile, urllib.parse
from playwright.async_api import async_playwright

EXT = pathlib.Path(__file__).resolve().parent.parent / 'ext'
_found = sorted(pathlib.Path.home().glob('.cache/ms-playwright/chromium-*/chrome-linux/chrome'))
CHROME = _found[-1] if _found else None  # None = Playwright's bundled Chromium
N = 260
QID = 'TESTqueryId_Following1'
BEARER = 'AAAAAAAAAAAAAAAAAAAAAtestbearer' + 'x' * 60
S = {'follows': {i for i in range(N) if i % 3 == 0}, 'unfollowed_by_me': set(), 'api_ok': True, 'api_calls': 0, 'need_feature': True, 'auth_ok': True, 'no_spam': {6}, 'acts': [], 'dialogs': []}

MAINJS = 'var a={queryId:"%s",operationName:"Following",operationType:"query"};var b="%s";' % (QID, BEARER)

APP = r"""<!doctype html><html><head><meta charset=utf-8><title>synthetic x</title>
<script src="https://abs.twimg.com/responsive-web/client-web/main.test123.js"></script>
<style>body{margin:0;font:15px sans-serif}.cell{height:80px;border-bottom:1px solid #eee;display:flex;align-items:center;justify-content:space-between;padding:0 16px;box-sizing:border-box;position:absolute;left:0;right:300px}</style></head>
<body><nav><a data-testid="AppTabBar_Profile_Link" href="/tester">Profile</a></nav>
<main data-testid="primaryColumn" id="main"></main>
<div data-testid="sidebarColumn" style="position:fixed;right:0;top:0;width:280px"><aside aria-label="推荐关注"><div data-testid="UserCell"><div data-testid="User-Name"><a href="/sidebar_suggest"><span>Sidebar Suggestion</span></a><a href="/sidebar_suggest" tabindex="-1"><span>@sidebar_suggest</span></a></div></div></aside></div>
<script>
const N=__N__; let FOLLOWS=new Set(__F__); const GONE=new Set(__G__);
window.__scrolls=0; addEventListener('scroll',()=>window.__scrolls++);
function route(){
  const p=location.pathname; const main=document.getElementById('main'); main.innerHTML='';
  let m=p.match(/^\/tester\/following$/); if(m) return following(main);
  m=p.match(/^\/u(\d+)$/); if(m) return profile(main,+m[1]);
  main.innerHTML='<div>home</div>';
}
function following(main){
  const list=document.createElement('div'); list.style.position='relative'; main.appendChild(list); let loaded=30;
  const ids=[...Array(N).keys()].filter(i=>!GONE.has(i));
  function render(){
    if(location.pathname!=='/tester/following') return;
    list.style.height=(loaded*80+400)+'px';
    const top=scrollY-200,bot=scrollY+innerHeight+200; const want=new Set();
    for(let k=0;k<Math.min(loaded,ids.length);k++){const y=k*80; if(y+80>=top&&y<=bot) want.add(k);}
    [...list.children].forEach(c=>{if(!want.has(+c.dataset.k)) c.remove();});
    for(const k of want){ if(list.querySelector('[data-k="'+k+'"]')) continue; const i=ids[k];
      const d=document.createElement('div'); d.className='cell'; d.dataset.k=k; d.setAttribute('data-testid','UserCell'); d.style.top=(k*80)+'px';
      d.innerHTML='<div data-testid="User-Name"><a href="/u'+i+'"><span>User '+i+'</span></a>'+(i%4===0?'<svg data-testid="icon-verified"></svg>':'')+'<a href="/u'+i+'" tabindex="-1"><span>@u'+i+'</span></a>'+(FOLLOWS.has(i)?'<div data-testid="userFollowIndicator"><span>关注了你</span></div>':'')+'</div><button>正在关注</button>';
      list.appendChild(d);}
    if(scrollY+innerHeight>=loaded*80-100&&loaded<ids.length) setTimeout(()=>{loaded=Math.min(ids.length,loaded+30);render();},300);
  }
  window.onscroll=render; render();
}
const PST={}; window.__NO_SPAM=new Set(__NOSPAM__);
function act(p){ fetch('/__act/'+p); }
function profile(main,i){
  setTimeout(()=>{ if(location.pathname!=='/u'+i) return;
    const st=PST[i]||(PST[i]={lists:i%2?['L1']:['L1','L2'],blocked:false});
    const following=!GONE.has(i)&&!st.blocked;
    const fbtn=st.blocked?'<button data-testid="'+(1000+i)+'-unblock">已屏蔽</button>':'<button id="fb" data-testid="'+(1000+i)+(following?'-unfollow':'-follow')+'">'+(following?'正在关注':'关注')+'</button>';
    main.innerHTML='<div style="height:500px">banner</div><div data-testid="UserName"><span>User '+i+'</span><span>@u'+i+'</span></div>'+fbtn+'<button data-testid="userActions" aria-label="更多" id="more">…</button>';
    const fb=document.getElementById('fb');
    if(fb) fb.onclick=()=>{ if(!confirm('取消关注 @u'+i+'?')) return; GONE.add(i); fetch('/__unfollow/'+i); fb.setAttribute('data-testid',(1000+i)+'-follow'); fb.textContent='关注'; };
    document.getElementById('more').onclick=()=>{
      const m=document.createElement('div'); m.setAttribute('role','menu'); m.style.cssText='position:fixed;top:100px;right:320px;background:#fff;border:1px solid #ccc';
      m.innerHTML='<div role="menuitem" id="mi-l">从列表中添加/移除 @u'+i+'</div><div role="menuitem" data-testid="block" id="mi-b">屏蔽 @u'+i+'</div><div role="menuitem" data-testid="report" id="mi-r">举报 @u'+i+'</div><div role="menuitem">复制链接</div>';
      document.body.appendChild(m);
      const close=()=>m.remove();
      m.querySelector('#mi-l').onclick=()=>{ close(); const dl=document.createElement('div'); dl.setAttribute('role','dialog');
        dl.innerHTML=['L1','L2','L3'].map(n=>'<div>'+n+'<div role="checkbox" aria-checked="'+st.lists.includes(n)+'" data-n="'+n+'">✓</div></div>').join('')+'<button>保存</button>';
        dl.querySelectorAll('[role=checkbox]').forEach(c=>c.onclick=()=>c.setAttribute('aria-checked',c.getAttribute('aria-checked')==='true'?'false':'true'));
        dl.querySelector('button').onclick=()=>{ st.lists=[...dl.querySelectorAll('[role=checkbox][aria-checked=true]')].map(c=>c.dataset.n); act('lists/'+i+'/'+st.lists.join(',')); dl.remove(); };
        setTimeout(()=>document.body.appendChild(dl),300); };
      m.querySelector('#mi-b').onclick=()=>{ close(); const sh=document.createElement('div'); sh.setAttribute('role','dialog');
        sh.innerHTML='<div>屏蔽 @u'+i+'?</div><button data-testid="confirmationSheetConfirm">屏蔽</button><button data-testid="confirmationSheetCancel">取消</button>';
        sh.querySelector('[data-testid=confirmationSheetConfirm]').onclick=()=>{ st.blocked=true; act('block/'+i); sh.remove(); setTimeout(()=>profile(main,i),0); };
        document.body.appendChild(sh); };
      m.querySelector('#mi-r').onclick=()=>{ close(); const dl=document.createElement('div'); dl.setAttribute('role','dialog');
        const opts=window.__NO_SPAM.has(i)?['仇恨言论','其他']:['仇恨言论','垃圾信息','其他'];
        dl.innerHTML='<h2>你为什么要举报</h2>'+opts.map(o=>'<label><input type="radio" name="r" value="'+o+'">'+o+'</label>').join('')+'<button data-testid="ChoiceSelectionNextButton" disabled>下一步</button>';
        dl.querySelectorAll('input').forEach(r=>r.onchange=()=>{dl.querySelector('button').disabled=false;});
        dl.querySelector('button').onclick=()=>{ const v=dl.querySelector('input:checked').value; dl.innerHTML='<div>感谢你的举报</div><button>完成</button>';
          dl.querySelector('button').onclick=()=>{ act('report/'+i+'/'+encodeURIComponent(v)); dl.remove(); }; };
        setTimeout(()=>document.body.appendChild(dl),400); };
    };
  },400);
}
addEventListener('popstate',route); route();
</script></body></html>"""

def app_html():
    return APP.replace('__N__', str(N)).replace('__F__', json.dumps(sorted(S['follows']))).replace('__G__', json.dumps(sorted(S['unfollowed_by_me']))).replace('__NOSPAM__', json.dumps(sorted(S['no_spam'])))

def api_body(req_url):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(req_url).query)
    v = json.loads(q['variables'][0]); f = json.loads(q['features'][0])
    if S['need_feature'] and 'brand_new_feature_x' not in f:
        return 400, json.dumps({'errors': [{'message': 'The following features cannot be null: brand_new_feature_x'}]})
    ids = [i for i in range(N) if i not in S['unfollowed_by_me']]
    start = int(v.get('cursor') or 0); page = ids[start:start + v['count']]
    entries = []
    for i in page:
        r = {'__typename': 'User', 'rest_id': str(1000 + i), 'core': {'name': 'User %d' % i, 'screen_name': 'u%d' % i},
             'relationship_perspectives': {'followed_by': i in S['follows'], 'following': True}, 'legacy': {}, 'is_blue_verified': i % 4 == 0}
        if i % 7 == 0:  # 旧字段位置
            r = {'__typename': 'User', 'rest_id': str(1000 + i), 'legacy': {'name': 'User %d' % i, 'screen_name': 'u%d' % i, 'followed_by': i in S['follows'], 'verified': i % 4 == 0}}
        entries.append({'entryId': 'user-%d' % (1000 + i), 'content': {'itemContent': {'user_results': {'result': r}}}})
    nxt = start + len(page)
    entries.append({'entryId': 'cursor-bottom-x', 'content': {'cursorType': 'Bottom', 'value': str(nxt) if nxt < len(ids) else str(start)}})
    entries.append({'entryId': 'cursor-top-x', 'content': {'cursorType': 'Top', 'value': '0'}})
    return 200, json.dumps({'data': {'user': {'result': {'timeline': {'timeline': {'instructions': [{'type': 'TimelineAddEntries', 'entries': entries}]}}}}}})

def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg, flush=True)
    if not cond: raise SystemExit(1)

async def wait_idle(root, sec=240):
    for _ in range(sec * 2):
        await asyncio.sleep(0.5)
        if not await root.locator('#scan').is_disabled(): return
    raise SystemExit('FAIL 等待扫描超时')

async def main():
    profile = tempfile.mkdtemp(prefix='xfc-profile-')
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(profile, executable_path=str(CHROME) if CHROME else None, headless=True,
            args=[f'--disable-extensions-except={EXT}', f'--load-extension={EXT}'], viewport={'width': 1280, 'height': 900}, accept_downloads=True)
        await ctx.add_cookies([{'name': 'ct0', 'value': 'csrf123', 'domain': '.x.com', 'path': '/', 'secure': True},
                               {'name': 'twid', 'value': 'u%3D999', 'domain': '.x.com', 'path': '/', 'secure': True}])
        bad_headers = []
        async def route(r):
            u = r.request.url
            if u.startswith('https://abs.twimg.com/responsive-web/client-web/main.test123.js'):
                return await r.fulfill(status=200, content_type='application/javascript', body=MAINJS, headers={'access-control-allow-origin': '*'})
            if u.startswith('https://x.com/i/api/graphql/'):
                S['api_calls'] += 1
                h = r.request.headers
                if h.get('authorization') != 'Bearer ' + BEARER or h.get('x-csrf-token') != 'csrf123': bad_headers.append(u); return await r.fulfill(status=403, body='{}')
                if not S['api_ok'] or QID not in u: return await r.fulfill(status=404, body='')
                st, body = api_body(u)
                return await r.fulfill(status=st, content_type='application/json', body=body)
            if u.startswith('https://x.com/__act/'):
                S['acts'].append(urllib.parse.unquote(u.split('/__act/', 1)[1])); return await r.fulfill(status=200, body='ok')
            if u.startswith('https://x.com/__unfollow/'):
                return await r.fulfill(status=200, body='ok')
            if re.match(r'https://x\.com/', u):
                return await r.fulfill(status=200, content_type='text/html', body=app_html())
            return await r.abort()
        await ctx.route('**/*', route)
        errors = []
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        def on_dialog(d):
            S['dialogs'].append(d.message)
            if S.get('reject_next'):
                S['reject_next'] = False; asyncio.ensure_future(d.dismiss())
            else:
                asyncio.ensure_future(d.accept())
        page.on('dialog', on_dialog)
        await page.goto('https://x.com/home')
        await page.wait_for_selector('#xfc-root', state='attached', timeout=15000)
        root = page.locator('#xfc-root')

        # 场景 A1：在首页点一次「回关检查」→ 自动开始读取，不滚动、不跳页面
        await root.locator('#fab').click()
        await asyncio.sleep(0.5)
        await wait_idle(root)
        prog = await root.locator('#prog').inner_text()
        print('  扫描1:', prog)
        nfb = N - len(S['follows'])
        check('读取完成' in prog and f'共关注 {N} 人' in prog and f'没回关你的 {nfb} 人' in prog, '点一次就自动扫描完成，人数正确')
        check(urllib.parse.urlparse(page.url).path == '/home', '扫描时没跳去关注列表页')
        check(await page.evaluate('window.__scrolls') == 0, '扫描过程没有滚动页面')
        check(S['api_calls'] >= 3 and not bad_headers, f'按页读取接口（{S["api_calls"]} 次），带上了登录凭据头，缺失特性自动补上重试')
        rows = await root.locator('.row .hd2').all_inner_texts()
        check(len(rows) == nfb and not any('sidebar_suggest' in r for r in rows) and '@u0' not in rows, '名单不含关注了你的人和侧栏推荐')
        check('（0）' in await root.locator('#t-unf').inner_text(), '首次扫描不误报取关')
        nbv = sum(1 for i in range(N) if i % 4)
        await root.locator('.tab[data-t="nbv"]').click()
        t = await root.locator('#t-nbv').inner_text(); nb_rows = await root.locator('.row .hd2').all_inner_texts()
        check(f'（{nbv}）' in t and len(nb_rows) == nbv and all(int(re.match(r'@u(\d+)', r).group(1)) % 4 for r in nb_rows), f'非蓝V {t}，新旧字段都识别，蓝V不在名单')
        await root.locator('.tab[data-t="nfb"]').click()

        # 场景 A2：去取关 → 直接跳到主页、高亮按钮；用户点按钮确认后自动标已处理
        await page.evaluate('window.__marker=42')
        await root.locator('#q').fill('u250')
        await root.locator('.row', has_text='@u250').locator('[data-a="go"]').first.click()
        for _ in range(40):
            await asyncio.sleep(0.25)
            if 'ready' in (await root.locator('#curt').inner_text()) or '已高亮' in await root.locator('#curt').inner_text(): break
        cur = await root.locator('#curt').inner_text()
        hl = await page.evaluate("()=>{const b=document.querySelector('[data-xfc-hl]'); if(!b) return null; const r=b.getBoundingClientRect(); return {id:b.dataset.testid, top:r.top, bottom:r.bottom}}")
        check(urllib.parse.urlparse(page.url).path == '/u250' and hl and hl['id'] == '1250-unfollow' and 0 <= hl['top'] and hl['bottom'] <= 900, f'直接打开 @u250 主页并高亮「正在关注」: {cur} {hl}')
        check(await page.evaluate('window.__marker') == 42, '单页内跳转，页面没有整页刷新')
        await page.click('#fb')
        for _ in range(20):
            await asyncio.sleep(0.25)
            if '已取关' in await root.locator('#curt').inner_text(): break
        check('已取关' in await root.locator('#curt').inner_text(), '你点了取关后，插件自动识别并标记已处理')
        await root.locator('#q').fill('')
        rows2 = await root.locator('.row .hd2').all_inner_texts()
        # 下一个
        first_left = (await root.locator('.row:not(.done) .hd2').first.inner_text()).split('2026')[0]
        await root.locator('#next').click()
        for _ in range(40):
            await asyncio.sleep(0.25)
            if '已高亮' in await root.locator('#curt').inner_text(): break
        cur2 = await root.locator('#curt').inner_text()
        check('已高亮' in cur2 and '@u250' not in cur2, '「下一个」直接跳到下一位并高亮: ' + cur2)
        await root.locator('#stop').click()

        # 场景 A3：u3、u6 取关了你，你取关了 u250 → 再扫描
        S['follows'] -= {3, 6}; S['unfollowed_by_me'].add(250)
        await root.locator('#scan').click(); await asyncio.sleep(0.5); await wait_idle(root)
        prog2 = await root.locator('#prog').inner_text()
        print('  扫描2:', prog2)
        check('新发现 2 人取关了你' in prog2 and f'共关注 {N-1} 人' in prog2, '第二次扫描发现 2 人取关')
        unf = await root.locator('.row .hd2').all_inner_texts()
        check(len(unf) == 2 and any(x.startswith('@u3') for x in unf) and any(x.startswith('@u6') for x in unf), '取关名单是 u3/u6')


        # 场景 C：取关了我 → 一键清理（移出列表 + 屏蔽 + 举报垃圾信息）
        check(await root.locator('.row', has_text='@u3').locator('[data-a="clean"]').count() == 1, '取关名单每行有「一键清理」按钮')
        await root.locator('.tab[data-t="nfb"]').click()
        check(await root.locator('[data-a="clean"]').count() == 0, '「没回关我」名单不显示一键清理')
        await root.locator('.tab[data-t="unf"]').click()
        nd = len(S['dialogs'])
        await root.locator('.row', has_text='@u3').locator('[data-a="clean"]').click()
        for _ in range(80):
            await asyncio.sleep(0.25)
            if '已全部完成' in await root.locator('#curt').inner_text(): break
        cur = await root.locator('#curt').inner_text(); print('  清理u3:', cur)
        check(len(S['dialogs']) == nd + 1 and '屏蔽' in S['dialogs'][-1] and '举报' in S['dialogs'][-1], '动手前先弹确认框')
        check('已全部完成' in cur and '已从你的 1 个列表中移除' in cur and '已屏蔽' in cur and '已举报为垃圾信息' in cur, '三步全部完成')
        check(S['acts'][-3:] == ['lists/3/', 'block/3', 'report/3/垃圾信息'], 'X 页面收到：移出全部列表→屏蔽→举报选了垃圾信息 ' + str(S['acts']))
        check('（1）' in await root.locator('#t-unf').inner_text(), '清理完自动标记已处理，取关计数减 1')
        # C2：举报窗口里没有「垃圾信息」→ 停下交给你手动，不乱点、不标记已处理
        n_acts = len(S['acts'])
        await root.locator('.row', has_text='@u6').locator('[data-a="clean"]').click()
        for _ in range(80):
            await asyncio.sleep(0.25)
            if '手动' in await root.locator('#curt').inner_text(): break
        cur6 = await root.locator('#curt').inner_text(); print('  清理u6:', cur6)
        check('没找到「垃圾信息」' in cur6 and '手动' in cur6 and await page.locator('[data-xfc-hl]').count() >= 1, '找不到垃圾信息选项时停下并红框标出举报窗口')
        check(S['acts'][n_acts:] == ['lists/6/', 'block/6'] and not any(a.startswith('report/6') for a in S['acts']), '前两步完成、举报没有乱选 ' + str(S['acts'][n_acts:]))
        check('（1）' in await root.locator('#t-unf').inner_text(), '没做完的不标记已处理')
        # C3：确认框点取消 → 什么都不做
        S['reject_next'] = True; n_acts = len(S['acts']); nd = len(S['dialogs'])
        await root.locator('.row', has_text='@u6').locator('[data-a="clean"]').click()
        await asyncio.sleep(3)
        check(len(S['dialogs']) == nd + 1 and len(S['acts']) == n_acts, '确认框点取消就什么都不做')
        # 场景 B：接口失效 → 自动改用滚动
        S['api_ok'] = False
        await page.goto('https://x.com/home'); await page.wait_for_selector('#xfc-root', state='attached')
        await root.locator('#fab').click(); await asyncio.sleep(1)
        await root.locator('#scan').click(); await asyncio.sleep(0.5); await wait_idle(root, 400)
        prog3 = await root.locator('#prog').inner_text()
        print('  扫描3:', prog3)
        check('已扫到列表底部' in prog3 and f'共关注 {N-1} 人' in prog3 and f'没回关你的 {N-1-(len(S["follows"]))} 人' in prog3, '接口不可用时自动改用滚动方式并扫完整')
        t3 = await root.locator('#t-nbv').inner_text()
        check(f'（{sum(1 for i in range(N) if i % 4 and i not in (250, 3))}）' in t3, '滚动方式也能识别蓝V（u3 已清理计入已处理）: ' + t3)
        check(not errors, '页面无报错 ' + str(errors))
        await page.evaluate("history.pushState({},'','/home'); dispatchEvent(new PopStateEvent('popstate'))")
        await asyncio.sleep(0.6)
        await page.screenshot(path=str(EXT.parent / 'panel-v11.png'))
        await ctx.close()
    print('ALL PASS')

asyncio.run(main())
