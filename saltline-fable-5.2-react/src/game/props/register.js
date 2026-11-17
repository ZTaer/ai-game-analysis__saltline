/**
 * 道具注册的唯一汇总入口；导入本文件会登记货物、软质物件与机械生成器。
 * bootGame 在关卡创建前加载本文件。注册属于有意的模块副作用，不能作为“未使用导入”删除。
 */
import { registerProp } from './props.js';
import { J3 } from './cargo.js';
import { eb } from './softCargo.js';
import { sb } from './machinery.js';
J3(registerProp);
eb(registerProp);
sb(registerProp);
