# 维护与回归指南

## 常见更新定位

| 要修改的内容                         | 文件与入口                                                                          | 需要一起检查                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 标题、暂停、死亡、结算文案           | `src/ui/MenuScreens.tsx`                                                            | 窄屏排版、焦点恢复、`data-act` 按钮行为                         |
| 操作说明                             | `src/ui/Controls.tsx`                                                               | 与 `game/input/input.js` 的实际映射一致                         |
| 增加或修改设置                       | `src/ui/SettingsPanel.tsx`、`src/ui/settings.ts`                                    | 默认值、读盘校验、即时应用、重载持久化；保持旧 key 兼容         |
| 界面颜色、尺寸、响应式布局           | `src/styles/game.css`                                                               | 安全区域、触摸角落、字体加载、reduced-motion 分支               |
| 生命、移动、冲刺、重力、跳跃、后坐力 | `game/player/tuning.ts` 的 `PLAYER_TUNING`；行为见 `game/player/player.js`          | 碰撞、楼梯/边缘、蹲伏空间、瞄准移动、回血延迟                   |
| 默认视野和玩家体型                   | `game/config.ts` 的 `PLAYER_CONFIG`                                                 | HUD 投影、碰撞胶囊、武器相机；已有存储的 FOV 会覆盖默认设置     |
| 弹匣、备弹、射速、伤害、换弹         | `game/weapon/tuning.ts`；行为见 `weapon.js`，命中计算见 `game/combat/combat.js`     | HUD、空仓换弹、瞄准、命中统计及音效事件                         |
| 枪械造型与材质                       | `game/weapon/rifleGeometry.js`、`hands.js`、`materials.js`、`decals.js`、`optic.js` | 原始握持点、准星位置、枪口位置、动画与室内外湿润度              |
| 敌人生命、速度和行为                 | `game/enemies/enemies.js` 的 `ENEMY_TUNING`，以及 `gull.js`、`hound.js`             | 寻路、视线、巡逻/警戒、攻击、击杀、残骸与对象复用               |
| 中继交互、增援波次与任务节奏         | `game/gameplay/missionConfig.ts` 的 `GAME_CONFIG`；流程见 `gameFlow.js`             | 三个中继、交互朝向/距离、进度回退、增援上限、死亡重试、撤离评分 |
| 无线电台词                           | `game/gameplay/radioLines.ts` 的 `RADIO_LINES`                                      | 台词触发阶段、字幕显示时长与 HUD 排版                           |
| 中继位置、出生点、撤离点或港口布局   | `game/level/level.js`                                                               | 碰撞/导航、玩家可达性、镜头路径、标记与敌人出生点               |
| 音效或音乐                           | `game/audio/soundBank.js` → 对应 `sounds.js`/`music.js` 生成器                      | 音量峰值、并发数、空间化、暂停、重启与声音生成耗时              |
| 渲染、阴影、反射、后处理             | `game/render/renderer.js`、`game/config.ts`                                         | 所有画质档位、Shader 编译、室内外、移动端、显存释放             |
| 材质、水面、雨雾或爆炸               | `game/materials/`、`ground/`、`effects/`                                            | GLSL 注入点、透明排序、深度、随机性、原版截图对照               |
| 启动、重启与卸载                     | `game/runtime/startGame.ts`、`resources.ts`                                         | 启动中销毁、运行后销毁、监听/音频/GPU 释放和 React 卸载         |
| 新增系统或改变每帧行为               | `game/runtime/bootGame.ts`、`frameLoop.ts`                                          | 创建依赖、更新顺序、暂停规则、`input.endFrame()` 时机           |
| 加载/失败提示与调试入口              | `game/runtime/bootScreen.ts`、`diagnostics.ts`、`debug/`                            | 原 URL 参数、展示模式、固定相机和性能巡游                       |

表中 `game/` 路径均位于 `src/` 下。优先搜索具名入口或配置对象，再阅读局部实现；不要从打包后的 `dist/assets/` 修改功能。

例如调整步行速度时先改 `player/tuning.ts` 的 `walk`；调整步行如何响应输入则读 `player/player.js`。调整步枪基础伤害时改 `weapon/tuning.ts` 的 `BULLET_DAMAGE`，不要误改 `combat.playerShot()` 给未传入伤害的调用者提供的默认值。后者负责射线、弱点倍率和命中处理，武器控制器会显式传入自己的伤害。

设置默认值还受持久化影响：已经保存的 `saltline.settings.v1` 会覆盖默认项。验证新默认值时使用没有旧设置的浏览器上下文，同时保留带旧设置的兼容性检查。

## 一次修改的建议步骤

1. 启动开发服务器，复现需要修改的行为，记录使用的 URL、画质和窗口尺寸。
2. 在负责该行为的模块中修改。新游戏事件同时更新生产者和订阅者；新设置先补 `src/ui/types.ts` 的 `GameSettings`，再补齐读取、校验、应用与显示。
3. 执行 `yarn typecheck`、`yarn format:check`、`yarn check:architecture`、`yarn test:unit` 和 `yarn build`。构建包含类型检查；架构检查定位缺失的本地导入/导出与运行时循环依赖，忽略纯类型引用；单元检查执行所有 `tests/*.test.mjs`。需要整理格式时使用 `yarn format`。
4. 执行 `yarn test`（自动启动或复用原版及 React 服务器）；查看浏览器生命周期、状态对照和画面差异报告。
5. 对此次修改相关的实际操作进行人工验收，再记录变更。单纯重命名应保持原版结果；有意修改玩法时，明确更新相应断言并说明差异来源。

`vite.config.ts` 对 `src/game/` 的编辑触发整页刷新，重建相互依赖的 GPU/音频资源。React 界面文件使用 React 开发工作流。不要为了保留热更新状态跳过游戏的初始化或销毁步骤。

## 继续迁移或新增 TypeScript 模块

新 React 组件使用 `.tsx`，普通逻辑与配置使用 `.ts`。类型导入用 `import type`；本地导入写明实际扩展名，与当前 Vite 和 Node 单元测试保持一致。类型放在所属功能目录，跨引擎/界面的契约放在 `game/types.ts`，菜单专用类型放在 `ui/types.ts`。

现阶段 `allowJs: true`、`checkJs: false` 是明确的迁移边界，旧引擎 `.js` 继续执行原逻辑。以后转换一个 JS 模块时，逐个补参数、返回值和内部状态类型，更新所有导入路径；如果存在同名 `.d.ts`，将声明合并到实现后移除重复声明。不要使用 `@ts-nocheck` 或大范围 `any` 隐藏错误。保留 `.js` 的模块如果增加公开方法，也要同步相关边界声明。

接口说明用中文注释记录单位、所有权与调用顺序，具体类型由 TS 声明表达。`yarn typecheck` 检查源码和 Vite 配置；现有浏览器用例和 Node 单元测试仍为 JS/MJS，验证执行行为。Node 通过内置类型擦除运行单元测试，因此 TS 源码只使用可擦除语法（`erasableSyntaxOnly`），不引入需要额外运行时转换的 `enum` 等语法。

## 模块与注释的维护规则

- 配置优先与功能放在一起：玩家参数进 `player/tuning.ts`，武器参数进 `weapon/tuning.ts`，任务数值和台词分别进 `gameplay/missionConfig.ts`、`radioLines.ts`。共享世界与画质配置才放进 `game/config.ts`。
- 新工厂或关键方法用 JSDoc 写清参数、返回接口、时间/距离/角度单位，以及是否创建或持有需要释放的资源。中文说明重点解释原因、状态变化和调用约束，避免逐行翻译代码。
- 事件是同步调用，载荷可能包含共享对象或向量。先查生产者再改订阅者；需要异步保存位置等瞬时数据时显式复制。不要随意把回调改成延迟执行。
- 系统创建和每帧更新都有顺序约束。保留 `bootGame.ts` 的装配顺序、`frameLoop.ts` 的输入消费与清理顺序；新的暂停规则应有对应的帧循环检查。
- 相同种子只有在随机调用顺序相同时才保持相同序列。结构整理不应增加、删除或调换随机调用，也不要并行创建共享随机数和场景的系统；几何辅助方法是否原地修改对象应先看注释。

已有代码中的中文注释和接口说明是这些约定的就近入口。功能发生有意变化时同时更新说明、相关断言和验证记录，避免注释继续描述旧行为。

## 依赖版本

Three.js 固定为 `0.180.0`（r180），与原 HTML 内嵌版本一致。项目包含依赖 Three.js shader chunks 和材质编译流程的自定义着色器；不要把升级 Three.js 当作无行为影响的依赖更新。升级应单独进行，并检查材质、阴影、水面、枪械镜片及全部后处理。

其余依赖也使用明确版本和锁文件。修改依赖后一起提交 `package.json`、`yarn.lock` 与 `package-lock.json`，并重新构建和回归；Yarn 使用 `yarn install --immutable` 核对锁文件。`@types/react`、`@types/react-dom` 与 `@types/three` 应匹配运行库的主版本，新增类型依赖不应顺带升级游戏运行库。Google Fonts 保留原外部地址，离线或网络阻断时字体回退不是场景模块的错误。

## 调试入口

开发页面路径后可追加以下参数；这些入口继承自原版：

| 参数                                            | 用途                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `?q=low` / `medium` / `high` / `ultra` / `test` | 指定画质；`test` 是固定测试档位                                                                  |
| `?autostart=1`                                  | 跳过标题和介绍直接开始                                                                           |
| `?noaudio=1`                                    | 使用无音频接口，适合自动化与视觉检查                                                             |
| `?seed=4207`                                    | 指定游戏随机数种子                                                                               |
| `?dt=0.016666667`                               | 使用指定游戏帧步长                                                                               |
| `?shot=1&cam=-32,1.7,6,0,2,5`                   | 截图模式与固定相机：前三项位置，后三项观察目标                                                   |
| `?fov=74` / `exposure=1` / `noweapon=1`         | 覆盖视野、曝光或隐藏第一人称武器                                                                 |
| `?show=weapon`                                  | 打开子系统展示；还支持 `mats`、`level`、`backdrop`、`ground`、`fx`、`enemies`、`props`、`render` |
| `?bench=1` 或 `#bench`                          | 原版巡游性能统计；该模式自动关闭音频并开始运行                                                   |

可组合参数，例如 [固定测试画质并直接进入游戏](http://127.0.0.1:5173/?q=test&autostart=1&noaudio=1&seed=4207)。`seed` 与 `dt` 并不单独保证完整像素确定性；测试还控制其他随机数、时钟与帧数。

浏览器控制台保留这些只用于开发的入口：

```js
window.__ready; // 帧循环已走到至少第二帧末尾；是否有错误还要检查下方两项
window.__fatal; // 启动失败信息，正常为 null
window.__errors; // 收集到的运行错误
window.__frames; // 已完成渲染帧数
window.__stats(); // 渲染统计、FPS 和任务状态
const context = window.__G; // 各子系统的运行上下文
context.game.start({ skipIntro: true });
context.game.pause();
context.game.resume();
context.game.debugCut(); // 切断下一个未完成中继
context.player.invulnerable = true;
window.__setShot({ cam: '-32,1.7,6,0,2,5', fov: 74 });
window.__setShot({ cam: '' }); // 解除固定相机
```

这些接口会修改当前测试局面。不要用它们替代实际交互验收：例如 `debugCut()` 可验证后续任务流程，但不能证明按住 E 的距离、朝向和进度表现正确。

## 保真检查清单

`tests/regression.spec.js` 包含菜单/设置持久化、部署与核心战斗操作、暂停/死亡/重试/撤离、触摸入口、展示/性能入口及固定场景的原版对照。多数玩法和画面用例关闭音频，并使用浏览器不支持鼠标捕获时的原版回退路径；另有真实音频生成/用户操作后恢复，以及高画质子系统检查。`tests/lifecycle.spec.js` 检查初始化中销毁、运行后停止帧循环和音频、清理监听及菜单。具体覆盖范围以测试代码为准，这些用例不等同于真实设备的完整体验。

查看 `playwright-report/`，固定画面对照的输出包含 `original.png`、`react.png`、`difference.png` 和 `visual-comparison.json`。画面测试同时比对场景数量、任务状态和中继位置，并限制像素差异；阈值与具体测试条件以测试代码为准。不要仅为了让失败消失而放宽阈值，先确认字体、浏览器版本、GPU、随机数和帧数是否一致。

修改后按涉及范围补充以下人工检查：

- 标题动画、加载提示、宽屏与窄屏菜单、设置 Tab 顺序、Esc 关闭与焦点返回。
- 鼠标捕获/释放与失败回退、右键瞄准、近战、跳跃、蹲伏、冲刺、射击和两种换弹状态。
- 中继附近的 E/USE 提示、按住进度、释放后回退、三次增援及撤离前后的提示变化。
- 生命降低、恢复、伤害方向、落水救援、死亡重试、完整结算与重新部署。
- 真实手机上的左右手多点触摸、开火时拖动视角、AIM 切换，以及横竖屏安全区域。
- 实体标准手柄的摇杆死区、按钮映射、连接/断开与暂停；不同浏览器的全屏和鼠标捕获权限行为。
- 实际扬声器/耳机听测：枪声、机械声、脚步、水面、音乐强度、暂停/继续、后台恢复和音量设置。
- 多种画质下的材质、雨、水面、反射、阴影、枪械镜片和特效；重启或卸载后没有持续音频和重复循环。

记录通过的设备与场景，以及尚未验证的项目。自动化、固定截图和人工清单共同限定验证范围，不能推导出所有硬件和浏览器都逐像素一致。

## 新增副作用时的清理

运行资源工具位于 `src/game/runtime/resources.ts`。使用 `listen(target, type, callback, options)` 注册需销毁的 DOM/窗口事件，使用 `defer(callback, delay)` 注册运行期延迟任务，音频上下文交由 `ownAudioContext()` 管理。新的 GPU 资源或第三方实例也要注册对应清理。

React 菜单已有独立的 `dispose()`，释放其全屏事件、焦点计时器和 React 根。不要复用已经销毁的菜单对象，或在异步回调里向旧实例写入状态。若添加异步加载，应在完成后检查实例是否仍有效，避免卸载期间又创建资源。
