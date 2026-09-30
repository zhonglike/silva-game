# SILVA · 森语

类 **LAAS**（[Braffolk/fable5-world-demo](https://github.com/Braffolk/fable5-world-demo)）的全程序化 3D 开放世界探索游戏。
**零外部素材**——每一棵树、每一座山、每一条河、每一片云都由代码在启动时生成，同一个种子会还原出同一个世界。

- 技术栈：HTML5 + Three.js（r160）+ WebGL（手机 / 电脑 / 主流浏览器通用，无需 WebGPU）
- 玩法：探索山谷，收集散落在世界中的 40 颗光之种子
- 特点：程序化地形（湖盆 + 河流刻蚀）、6 种程序化树种 × 逐棵实例、草地 / 岩石 / 灌木 / 野花、远景树冠海、动画水面、昼夜循环 + 云层 + 星空、PC 键盘鼠标 + 手机触屏双操控、9 处观景台、电影镜头

## 本地运行

```bash
npm install        # 安装 serve（或直接用任意静态服务器）
npm start          # http://localhost:5173
```

或用 Python：`python3 -m http.server 5173` 后打开 `http://localhost:5173`。

## 操作

| 键位 | 功能 |
|---|---|
| WASD / 方向键 | 移动 |
| 鼠标 | 视角（点击画面锁定） |
| Shift | 疾跑 |
| 空格 | 跳跃 |
| V | 步行 / 飞行切换 |
| E / Q | 飞行升降 |
| 滚轮 | 飞行速度 |
| F | 电影镜头（95 秒环游） |
| 1–9 | 九处观景台 |
| T | 时间前进 4 小时 |
| +/- | 时间流速 |
| P | 设置 | 
| H | 帮助 |
| M | 静音 |
| R | 回到出生点 |

手机上：左侧虚拟摇杆移动，右侧拖动视角，右下按钮跳 / 飞 / 跑。

## URL 参数

- `?seed=任意字符串` — 世界种子（同种子 = 同一世界）
- `?T=9` — 起始时刻（0–24）
- `?q=high|med|low` — 画质
- `?fly=1` — 出生即飞行
- `?motes=0` — 关闭收集玩法
- `?cam=x,y,z,yaw,pitch` — 精确相机姿态

## 部署到 GitHub Pages

1. 把本目录内容推送到 GitHub 仓库（`docs` 或根目录均可）。
2. 仓库 Settings → Pages → Source 选择分支与目录 → 保存。
3. 访问 `https://<用户名>.github.io/<仓库名>/`。
4. 绑定自己的域名：在 Pages 页填自定义域名，并把 DNS 加一条 `CNAME` 指向 `<用户名>.github.io`，仓库根放一个 `CNAME` 文件（内容为你的域名）。

## 项目结构

```
index.html        入口页面（含 HUD / 设置 / 触屏 UI）
style.css         界面样式
vendor/           three.js（本地化，无 CDN 依赖）
js/
  main.js         启动、主循环、HUD、快捷键
  rng.js / noise.js   确定性随机与噪声
  terrain.js      地形：高度场、湖盆、河流刻蚀、生物群系着色
  water.js        动画水面（深度吸收、岸边泡沫）
  sky.js          昼夜调色板、太阳月亮、星空、云层
  veg.js          树木 / 草地 / 岩石 / 灌木 / 野花 / 远景树冠
  controls.js     第一人称操控（PC + 触屏）、观景台、电影镜头
  motes.js        光之种子收集
  audio.js        程序化风声与收集音效
```
