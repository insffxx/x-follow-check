# X Follow Check（X 回关检查）

一个 Chrome 扩展（Manifest V3）：一键找出你在 X（Twitter）上关注的人里——

- **谁没有回关你**
- **谁关注过你、后来又取关了你**（靠两次扫描对比）
- **谁不是蓝 V**

然后直接跳到对方主页，高亮「正在关注」按钮，**由你自己点击取关**。扩展不会自动关注或取关任何人。

[English](#english)

## 安装

1. 下载 [`dist/x-follow-check-v1.2.0.zip`](dist/x-follow-check-v1.2.0.zip)（进去后点右上角的下载按钮）。
2. 打开 `chrome://extensions`，打开右上角「开发者模式」。
3. 把 zip 拖进页面；如果不行，就先解压，再点「加载已解压的扩展程序」，选中含 `manifest.json` 的文件夹（这个文件夹之后不要删，也不要移动）。

## 使用

1. 登录 x.com，点工具栏上的扩展图标，页面里会弹出面板。第一次打开会自动扫描。
2. 在面板里切换「没回关 / 取关了我 / 非蓝V」三个名单。
3. 点「去取关」会跳到对方主页并高亮按钮。你点了取关之后会自动标成已处理，再点「下一个」继续。
4. 名单可以导出为 CSV。

「取关了我」需要扫描两次以上才有数据：第一次扫描会记下谁关注了你，之后再扫，发现不再关注你的人就会列出来。

## 工作原理与隐私

- 扫描时调用 X 网页版自己的「正在关注」接口，用的是你当前登录的会话，与在浏览器里正常浏览相同。接口出错时，会自动改成滚动页面读取列表。
- 扫描结果只存在本机的 `chrome.storage.local` 里，**不会上传到任何服务器**。
- 只访问 `x.com`、`twitter.com` 和 `abs.twimg.com`（用来读取 X 网页脚本里的公开参数）。代码里的 bearer 是 X 网页版所有访客共用的公开常量，不是个人凭据。
- 权限只有 `storage`，外加以上三个域名。

## 注意

- 本扩展依赖 X 网页版的内部接口和页面结构，X 改版后可能失效。
- 请自行遵守 X 的使用条款。扩展只读取数据、只帮你定位，取关始终由你亲手点击。
- 如果频繁扫描触发了 X 的频率限制，面板会显示倒计时，到时间后再扫即可。

## 开发与测试

`test/e2e.py` 用 Playwright 在真实 Chromium 里加载扩展，把 `x.com` 换成合成的单页应用和合成接口，不访问真实 X。测试覆盖以下场景：接口正常、接口 404 时退回滚动、侧栏推荐不算进名单、取关检测和跳转定位。

```bash
pip install playwright && playwright install chromium
python test/e2e.py
```

## License

MIT

---

## English

A Manifest V3 Chrome extension that lists, among the accounts you follow on X:
who doesn't follow you back, who followed you and later unfollowed (detected by
comparing two scans), and who isn't blue-verified. It then jumps to that profile
and highlights the "Following" button so **you** click unfollow yourself. It
never follows or unfollows automatically.

**Install:** download `dist/x-follow-check-v1.2.0.zip`, open `chrome://extensions`, enable
Developer mode, and drag the zip in (or unzip it and use "Load unpacked").

**Privacy:** results stay in `chrome.storage.local`, and nothing is uploaded. The
extension only talks to `x.com`, `twitter.com` and `abs.twimg.com`, using your
existing logged-in session. The bearer token in the code is X's public web-client
constant, not a personal credential.

**Caveats:** it relies on X's undocumented web endpoints and DOM, so it may break
when X changes. Use it in accordance with X's Terms.

**Tests:** `python test/e2e.py` (Playwright and Chromium, using a synthetic X page and
API, with no real X traffic).
