# MilkFrog 2048 🐸

一个零依赖、纯原生 HTML/CSS/JS 实现的 2048 小游戏，可直接部署到 GitHub Pages。

## 功能

- 4×4 经典玩法：方向键 / WASD / 鼠标拖动 / 触屏滑动，相同数字合并，冲向 2048
- 实时计分 + 历史最高分记录（localStorage）
- 胜利 / 失败判定，合成 2048 后可继续挑战更大数字
- Web Audio 合成音效（无音频文件），可一键静音
- 主题管线：内置「奶蛙」（默认）「经典」「夜色」三套主题，🎨 一键切换并记忆，按下方说明可自行扩展新主题
- 方块滑动 / 合并弹跳 / 新块弹出动画
- 排行榜：默认本机榜单，配置 TinyWebDB 账号后升级为全服在线榜（见下文）

## 本地运行

无需安装任何依赖，直接用浏览器打开 `index.html` 即可；
或者起一个本地服务器：

```bash
python -m http.server 8000
# 然后访问 http://localhost:8000
```

## 部署到 GitHub Pages

1. 在 GitHub 上新建仓库（例如 `milkfrog2048`），然后把代码推上去：

   ```bash
   git init -b main
   git add .
   git commit -m "feat: MilkFrog 2048"
   git remote add origin https://github.com/<你的用户名>/milkfrog2048.git
   git push -u origin main
   ```

2. 打开仓库页面，进入 **Settings → Pages**，把 **Source** 设置为 **GitHub Actions**（一次性操作）。

3. 完成。项目里的 `.github/workflows/deploy.yml` 会在每次 push 到 `main` 时自动把最新版本发布到 Pages，之后访问：

   ```
   https://<你的用户名>.github.io/milkfrog2048/
   ```

## 排行榜

方案思路受 [YHSome/BigNaiWa](https://github.com/YHSome/BigNaiWa) 启发（TinyWebDB 让纯静态页面也能读写云端数据），代码为本项目独立实现，使用自己的账号与前缀，请勿共用他人账号。

**两种模式：**

- **本机模式（默认，开箱即用）**：成绩只存在这台设备的 localStorage 里，点 🏆 查看本机 Top 20。
- **在线模式**：在 [appinventor.space](https://appinventor.space) 注册一个免费的 TinyWebDB 账号，把 `USER` 和 `SECRET` 填进 `js/leaderboard.js` 顶部的 `CONFIG`，推送后即升级为全服「历史最高分 Top 20」。`PREFIX` 换一个值等于另开一张独立的榜。

**规则细节：**

- 榜单内容：历史最高分 Top 20，每行显示 排名 / 昵称 / 本局最大方块 / 得分 / 时间；同分先比最大方块，再比达成先后
- 自动上报：游戏自然结束时提交；中途重开且分数 ≥ 100 也会提交；0 分、异常数值、3 秒内的连续提交会被忽略
- 隐私：每条记录只包含 身份、分数、最大方块、时间戳；只写自己的记录，不删别人的
- 身份规则：昵称不用自己起，自动生成「奶蛙 + 6 位字母数字混排」（如 奶蛙a3f9k2），生成后保存在本机 localStorage，同一浏览器以后始终以同一身份提交，不支持自定义（公开榜不收手填昵称，避免不当内容）
- 健壮性：网络失败不影响游戏，结算界面提供「重试」；昵称渲染全程 `textContent`，无 XSS 风险
- 本地联调：`node test/mock-tinywebdb.js` 起一个模拟 TinyWebDB（账号 `test/test123`，端口 8124），再用 `Leaderboard.configure({ API: 'http://127.0.0.1:8124/api', USER: 'test', SECRET: 'test123' })` 指向它

## 如何新增一个主题

主题系统由「CSS 变量块 + JS 注册表」组成，两步即可接入：

1. **css/style.css**：仿照文件顶部的 `[data-theme="classic"]`，新增一个变量块，例如：

   ```css
   [data-theme="ocean"] {
     --bg: #eaf6fb;
     --text: #46627a;
     /* ……照抄 :root 里的全部变量名并换成你的配色 */
   }
   ```

2. **js/themes.js**：在 `THEMES` 数组里注册：

   ```js
   { id: 'ocean', name: '海洋' },
   ```

刷新页面，🎨 按钮即可循环切换到新主题，选择会自动记忆。

## 奶蛙主题（素材皮肤）

第三套主题「奶蛙」会为每个数字方块叠一张 `assets/cut/` 里的透明 PNG 素材，选取规则：

1. **同局一致性**：同一局里相同数字永远用同一张图；不同数字不共用素材
2. **每局轮换**：每次开新局重新随机分配（这一局 2 用 A 图，下一局 2 可能用 B 图）
3. **文件夹用量**：素材按文件夹（emotes + 各「角色-xxx」）管理，每局每个文件夹最多引用 4 张；emotes 每局必须被用上，所以每个文件夹至少贡献 1 张
4. **不相邻**：同一文件夹的素材不会落在相邻数字上（如同一文件夹不会同时出现在 2 和 4 上）

实现方式：把 12 个数字槽位（2 → 4 → … → 2048 → super）看成一条链，分配时给每格选一个「文件夹颜色」，要求相邻格不同色、各颜色数量在 1~4 之间（`js/skin.js` 的求解器），再在文件夹内部随机抽图对号入座。数字固定在方块左下角，白描边、字色与方块底色一致；方块底色由主题变量的 12 色奶蛙调色板提供。

**专属音效**（仅奶蛙主题，其余主题用合成音）：每次合并从 `assets/raw/audio/` 顶层随机播一个音效，相邻两次合并不会播同一个；连续快速合并时后一个会打断前一个。游戏结束播放 `assets/raw/audio/long/` 里的音频，点「再来一局」立即停止。静音按钮同样生效。

**素材增删后**：运行 `node tools/build-skin-manifest.mjs` 重新生成 `js/skin-manifest.js` 与 `js/audio-manifest.js`（部署时 GitHub Actions 会自动重建）。素材目录需要随仓库提交，线上才能加载图片与音效。

## 项目结构

```
├── index.html                  页面结构
├── css/style.css               样式 + 主题变量
├── js/game.js                  游戏核心逻辑（无 DOM，可独立测试）
├── js/main.js                  渲染、输入、计分、遮罩、上报接线
├── js/sound.js                 Web Audio 合成音效
├── js/themes.js                主题注册与切换
├── js/skin.js                  奶蛙主题素材分配求解器
├── js/skin-manifest.js         素材清单（脚本生成）
├── js/audio-manifest.js        音频清单（脚本生成）
├── js/leaderboard.js           排行榜（TinyWebDB 在线榜 + 本机榜）
├── assets/cut/                 奶蛙素材 PNG（按文件夹分组）
├── assets/raw/audio/           奶蛙主题音效（顶层=合并音效，long/=结束音效）
├── tools/build-skin-manifest.mjs  素材清单生成脚本
├── test/mock-tinywebdb.js      TinyWebDB 模拟服务（本地联调用）
└── .github/workflows/deploy.yml  GitHub Pages 自动部署
```

## 致谢

- 玩法与经典配色来自 [Gabriele Cirulli 的 2048](https://play2048.co/)
- 排行榜方案思路来自 [YHSome/BigNaiWa](https://github.com/YHSome/BigNaiWa)（TinyWebDB 纯静态在线榜），实现代码独立编写
