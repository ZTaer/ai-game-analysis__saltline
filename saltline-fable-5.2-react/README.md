# Saltline · React 可维护版

这是原 `saltline-fable-5.2` 浏览器 FPS 的独立重构目录。原目录保留，运行本项目不需要读取原来的 `index.html`；原版仅在对照测试中作为基准。

项目使用 React 19、Vite 和 Three.js r180：React 管理应用挂载、菜单、设置及结算界面，独立游戏模块管理三维画面、输入、物理、武器、敌人、音频和高频 HUD 更新。游戏没有通过 iframe、整页 HTML 注入或执行原压缩脚本来运行。

重构以保留原版算法、参数、着色器、程序化资源及交互为目标。启动生命周期、系统装配、帧循环和调试入口各自分开，玩家、武器及任务配置与对应功能放在同一目录，关键接口和行为约定附有中文注释。原文件是已经压缩的发布产物，无法完整恢复原作者的源码命名；底层程序化几何、音频合成等实现内部仍保留部分短变量。先从下方的阅读顺序进入，再按职责定位具体实现。

## 在线试玩

[开始试玩](https://ztaer.github.io/ai-game-analysis__saltline/saltline/) · [返回三个 Demo 的试玩首页](https://ztaer.github.io/ai-game-analysis__saltline/)

## 研发声明

**万我工作室 · React 工程化重构与维护**

本项目用于技术研究与学习实践。

万我工作室负责本版本的 React 工程化重构、模块整理、维护文档与持续维护。原游戏创作署名和来源说明保留，完整工作范围见 [研发声明](研发声明.md)，原作信息见下方“来源与署名”。

## 本地运行

需要 Node.js 22.12 或更高版本及 Yarn；项目固定使用 Yarn 4.18.1，并保留 `node_modules` 安装方式。在本目录打开 PowerShell：

```powershell
yarn install --immutable
yarn dev
```

打开 [本地开发页面](http://127.0.0.1:5173)。首次启动会在浏览器中生成场景、纹理和声音，等待加载条完成，再点击 **Deploy**。开发服务器默认使用 5173 端口；端口占用时可以运行 `yarn dev --host 127.0.0.1 --port 5175 --strictPort`，并打开终端显示的地址。

```powershell
yarn build
yarn preview
```

生产文件位于 `dist/`，预览地址以终端输出为准。部署时上传 `dist/` 内容到静态网站服务器。构建使用相对资源路径，可放入网站子目录；请通过 HTTP/HTTPS 打开，不要双击构建后的 HTML。`yarn install --immutable` 使用现有锁文件安装，不允许意外改写依赖解析结果。原有 npm 命令和 `package-lock.json` 仍保留。

## 从哪里开始阅读

| 目的                           | 入口                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 理解 React 如何启动游戏        | `src/main.jsx` → `src/App.jsx` → `src/game/runtime/startGame.js`                                           |
| 理解系统装配与每帧更新         | `src/game/runtime/bootGame.js` → `src/game/runtime/frameLoop.js`                                           |
| 修改标题、暂停、死亡、结算界面 | `src/ui/MenuScreens.jsx`                                                                                   |
| 修改设置或按键说明             | `src/ui/SettingsPanel.jsx`、`src/ui/Controls.jsx`、`src/ui/settings.js`                                    |
| 修改配色、排版、移动端布局     | `src/styles/game.css`                                                                                      |
| 理解任务、增援和胜负流程       | `src/game/gameplay/gameFlow.js`；数值和文案见同目录的 `missionConfig.js`、`radioLines.js`                  |
| 修改移动、跳跃、生命恢复、镜头 | `src/game/player/tuning.js`；行为见 `src/game/player/player.js`，基础体型/FOV 见 `src/game/config.js`      |
| 修改武器、伤害与敌人           | `src/game/weapon/tuning.js`、`src/game/weapon/weapon.js`、`src/game/combat/combat.js`、`src/game/enemies/` |
| 修改场景与视觉效果             | `src/game/level/`、`src/game/materials/`、`src/game/render/`                                               |

完整目录导航与更新顺序见 [架构说明](docs/ARCHITECTURE.md) 和 [维护指南](docs/MAINTENANCE.md)。本次检查结果见 [迁移验证记录](docs/VERIFICATION.md)。

## 操作方式

WASD 移动，鼠标观察，左键射击，右键瞄准，R 换弹，按住 E 切断中继，Space 跳跃，Shift 冲刺，C/Ctrl 蹲伏，F 近战，Esc/P 暂停。浏览器拒绝捕获鼠标时保留原版回退模式；方向键或 IJKL 也可转向，Enter 可开火。触摸按钮与标准映射手柄输入均保留。

任务是切断三个中继并抵达船只。设置即时生效，保存键仍为 `saltline.settings.v1`。浏览器按来源隔离存储：原版 8731 端口与开发版 5173 端口不会自动共享设置，部署在相同来源时沿用原键。

模型、纹理、场景和声音仍由代码生成。页面保留原 Google Fonts 字体链接；离线时会使用原 CSS 中的后备字体，字形可能不同。

## 验证与维护命令

```powershell
npm run format:check
npm run check:architecture
npm run test:unit
npm run build
npm test
```

`npm test` 运行 Playwright 原版/React 对照测试，会自动启动并在测试后关闭所需服务器（已运行的服务器会复用）。原版仍由 `../saltline-fable-5.2/index.html` 只读提供。本机需要安装 Google Chrome，测试配置使用 `channel: 'chrome'`。

`npm run check:architecture` 检查源码本地导入目标、导出名称和循环依赖。`npm run test:unit` 执行所有 `tests/*.test.mjs`，覆盖资源清理、帧循环等模块契约；`npm test` 执行浏览器对照与生命周期检查。

可用 `ORIGINAL_URL`、`REACT_URL` 环境变量指定已有服务器。测试覆盖菜单与设置、核心任务流程、移动端触摸入口、展示与性能入口、真实音频生成和固定条件的画面对照，并检查启动中及运行后的卸载清理；实际断言和覆盖范围见 `tests/regression.spec.js`、`tests/lifecycle.spec.js`。报告位于 `playwright-report/`，失败追踪和画面对照文件位于 `test-results/`。

这些检查提供已覆盖路径的保真依据，不代表所有设备、显卡与浏览器组合均已验证。实体手柄、真实鼠标捕获、多点触摸手感及音效听感仍应按维护指南进行人工验收。

## 来源与署名

本项目继承原仓库的署名：游戏由 **Claude Fable 5.2** 创建，原 README 记载该生成过程由 **Felix Rieseberg（Anthropic）** 设置并于 2026-11-09 分享。原仓库将自身定位为方便本地运行的镜像，游戏创作归原作者；此次工作为工程结构和 React 界面的迁移。

- [原镜像演示](https://realcodebear.github.io/saltline-fable-5.2/)
- [原始可玩 Artifact](https://claude.ai/artifact/BGY1SztrAYcJQHSsnHHGmp)
- [原 README 引用的分享](https://x.com/felixrieseberg/status/2119925633564463609)

原目录没有提供独立的项目许可证文件，此重构不新增或推定原游戏的授权许可。React、Three.js 等依赖的许可证仍以各自包内文件为准。
