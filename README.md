# FF14 NGA Hot Page

一个按 WowDayDay 思路做的最终幻想 14 热帖聚合页：

- 前端只读取 `data/ff14-hot.json`
- 采集脚本负责抓取 NGA 板块、生成 JSON
- 线上可以把 JSON 上传到 COS/OSS/CDN，然后把 `app.js` 里的 `DATA_URL` 换成对象存储地址

## 本地预览

```bash
cd ff14-nga-hot
python3 -m http.server 5177
```

然后打开：

```text
http://localhost:5177/
```

## 更新数据

```bash
node scripts/update-ff14-nga-hot.mjs
```

默认使用 `NGA_FID=-362960`，实际板块 ID 可以按需要覆盖：

```bash
NGA_FID=xxx NGA_LIMIT=20 node scripts/update-ff14-nga-hot.mjs
```

## 生产部署思路

1. 用定时任务运行 `scripts/update-ff14-nga-hot.mjs`
2. 上传 `data/ff14-hot.json` 到 COS/OSS
3. 页面部署到任意静态托管
4. `app.js` 的 `DATA_URL` 指向线上 JSON

注意：抓取公开网页时要控制频率，遵守目标站点规则；建议 10-30 分钟更新一次，不要让用户浏览器直接请求 NGA。
