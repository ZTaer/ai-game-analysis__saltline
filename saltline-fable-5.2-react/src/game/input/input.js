import { listen } from '../runtime/resources.js';
/**
 * Saltline / input/input
 * 从原版游戏按职责提取；保留原始算法、参数、着色器与执行顺序。
 */
var KEY_BINDINGS = {
    KeyW: 'forward',
    KeyS: 'back',
    KeyA: 'left',
    KeyD: 'right',
    Space: 'jump',
    ShiftLeft: 'sprint',
    ShiftRight: 'sprint',
    KeyC: 'crouch',
    ControlLeft: 'crouch',
    ControlRight: 'crouch',
    KeyR: 'reload',
    KeyE: 'interact',
    KeyF: 'melee',
    KeyV: 'melee',
    Escape: 'pause',
    KeyP: 'pause',
    KeyQ: 'alt',
    Enter: 'fire',
    NumpadEnter: 'fire',
    ArrowLeft: 'turnL',
    ArrowRight: 'turnR',
    ArrowUp: 'turnU',
    ArrowDown: 'turnD',
    KeyJ: 'turnL',
    KeyL: 'turnR',
    KeyI: 'turnU',
    KeyK: 'turnD',
  },
  MOUSE_LOOK_SCALE = 0.0021,
  TOUCH_LOOK_SCALE = 0.0052,
  KEYBOARD_LOOK_SPEED = 2.1,
  GAMEPAD_LOOK_SPEED = 3,
  TOUCH_STICK_RADIUS = 58,
  MENU_ACTIONS = {
    pause: 1,
  };
/**
 * 将键鼠、触屏与标准手柄转换为统一动作，不直接移动玩家或发射子弹。
 * 帧循环先调用 update(dt)，玩法读取结果，帧末再调用 endFrame() 清除边沿。
 * @param {object} context 提供 renderer 画布与 events；DOM 监听由运行时 listen 收集清理。
 * @returns {object} 输入快照及指针锁定/模式控制接口；look 增量为弧度，move 为归一化方向。
 */
function createInput(context) {
  let canvas = (context.renderer && context.renderer.domElement) || document.getElementById('view'),
    uiRoot = document.getElementById('ui'),
    heldActions = new Set(),
    pressedActions = new Set(),
    sourceActions = {
      key: new Set(),
      mouse: new Set(),
      touch: new Set(),
      pad: new Set(),
    },
    gameplayEnabled = false,
    hasCapturedMouse = false,
    lockRequestedAt = 0,
    lockFailures = 0,
    mouseButtons = 0,
    modeListeners = [],
    input = {
      move: {
        x: 0,
        y: 0,
      },
      look: {
        dx: 0,
        dy: 0,
      },
      fire: false,
      ads: false,
      sprint: false,
      crouch: false,
      locked: false,
      touch: false,
      gamepad: false,
      sensitivity: 1,
      invertY: false,
      mode: 'lock',
      // 按住状态在多帧间持续，例如移动、连续开火和按住 E 切断中继。
      down(action) {
        return heldActions.has(action) && (gameplayEnabled || MENU_ACTIONS[action] === 1);
      },
      // 按下边沿只保留到 endFrame；例如换弹、暂停只响应一次新按下。
      pressed(action) {
        return pressedActions.has(action) && (gameplayEnabled || MENU_ACTIONS[action] === 1);
      },
      update: updateInput,
      endFrame: endFrame,
      requestLock: requestLock,
      exitLock: exitLock,
      // 状态机切到菜单/死亡时禁用玩法动作；菜单暂停键仍有独立白名单。
      setGameplay(enabled) {
        enabled = !!enabled;
        if (enabled !== gameplayEnabled) {
          gameplayEnabled = enabled;
          if (!enabled) {
            clearActions();
          }
          if (touchControls) {
            touchControls.root.classList.toggle('on', enabled && input.touch);
          }
        }
      },
      setPrompt(visible) {
        if (touchControls) {
          touchControls.btn.interact.classList.toggle('on', !!visible);
        }
      },
      onModeChange(listener) {
        modeListeners.push(listener);
      },
      describeMode() {
        return input.mode === 'touch'
          ? 'Touch controls active'
          : input.mode === 'drag'
            ? 'Mouse capture unavailable \u2014 move the mouse to look, rest it at a screen edge to keep turning \xB7 click fires \xB7 arrows or IJKL also turn'
            : input.locked
              ? 'Mouse captured \u2014 Esc releases it'
              : 'Click the view to capture the mouse';
      },
    };
  /* 模式改变时通知菜单与提示文字。 */
  function setMode(mode) {
    if (input.mode !== mode) {
      input.mode = mode;
      for (let V of modeListeners)
        try {
          V(mode);
        } catch (Y) {
          console.error(Y);
        }
    }
  }
  /* 合并各输入源；释放一种输入源不会清除其他来源仍按住的动作。 */
  function setAction(source, action, isDown) {
    if (!action) return;
    let actions = sourceActions[source];
    if (isDown) {
      if (actions.has(action)) return;
      actions.add(action);
      if (!heldActions.has(action)) {
        heldActions.add(action);
        pressedActions.add(action);
      }
    } else {
      if (!actions.delete(action)) return;
      if (
        !sourceActions.key.has(action) &&
        !sourceActions.mouse.has(action) &&
        !sourceActions.touch.has(action) &&
        !sourceActions.pad.has(action)
      ) {
        heldActions.delete(action);
      }
    }
  }
  /* 失焦、暂停时清理按住状态和触屏摇杆。 */
  function clearActions() {
    for (let P in sourceActions) sourceActions[P].clear();
    heldActions.clear();
    mouseButtons = 0;
    touchAim = false;
    if (touchControls) {
      touchControls.btn.ads.classList.remove('active');
      resetTouchStick();
      lookTouchId = -1;
      fireTouchId = -1;
    }
  }
  listen(window, 'keydown', (P) => {
    let V = KEY_BINDINGS[P.code];
    if (!V) return;
    let Y = P.target;
    if (!(
      (Y && (Y.tagName === 'INPUT' || Y.tagName === 'SELECT' || Y.tagName === 'TEXTAREA')) ||
      (Y &&
        Y.tagName === 'BUTTON' &&
        (P.code === 'Space' || P.code === 'Enter' || P.code === 'NumpadEnter'))
    )) {
      if (
        gameplayEnabled &&
        (P.code === 'Space' || P.code.startsWith('Arrow') || P.code === 'ControlLeft')
      ) {
        P.preventDefault();
      }
      if (!P.repeat) {
        setAction('key', V, true);
      }
    }
  });
  listen(window, 'keyup', (P) => {
    setAction('key', KEY_BINDINGS[P.code], false);
  });
  listen(window, 'blur', () => {
    clearActions();
  });
  let mouseAction = (P) => (P === 0 ? 'fire' : P === 2 ? 'ads' : P === 1 ? 'melee' : null);
  listen(canvas, 'mousedown', (P) => {
    if (!(input.touch && performance.now() - lastTouchAt < 800) && gameplayEnabled) {
      if (!input.locked && input.mode === 'lock') {
        requestLock();
        P.preventDefault();
        return;
      }
      mouseButtons |= 1 << P.button;
      setAction('mouse', mouseAction(P.button), true);
      P.preventDefault();
    }
  });
  listen(window, 'mouseup', (P) => {
    mouseButtons &= ~(1 << P.button);
    setAction('mouse', mouseAction(P.button), false);
  });
  listen(window, 'contextmenu', (P) => {
    if (P.target === canvas || gameplayEnabled) {
      P.preventDefault();
    }
  });
  listen(window, 'mousemove', (P) => {
    if (
      gameplayEnabled &&
      (input.mode === 'drag' &&
        ((pointerX = P.clientX / Math.max(1, innerWidth)),
        (pointerY = P.clientY / Math.max(1, innerHeight)),
        (pointerInside = true)),
      input.locked || input.mode === 'drag')
    ) {
      let V = P.movementX || 0,
        Y = P.movementY || 0;
      if (Math.abs(V) > 400 || Math.abs(Y) > 400) return;
      input.look.dx += V * MOUSE_LOOK_SCALE * input.sensitivity;
      input.look.dy += Y * MOUSE_LOOK_SCALE * input.sensitivity * (input.invertY ? -1 : 1);
    }
  });
  listen(document, 'pointerlockchange', () => {
    if (((input.locked = document.pointerLockElement === canvas), input.locked)) {
      hasCapturedMouse = true;
      lockRequestedAt = 0;
      lockFailures = 0;
      if (!input.touch) {
        setMode('lock');
      }
    } else {
      sourceActions.mouse.clear();
      heldActions.delete('fire');
      heldActions.delete('ads');
      for (let P of sourceActions.key) heldActions.add(P);
      mouseButtons = 0;
    }
    context.events.emit('input:lock', {
      locked: input.locked,
    });
  });
  listen(document, 'pointerlockerror', () => handleLockFailure());
  let pointerX = 0.5,
    pointerY = 0.5,
    pointerInside = false;
  listen(document, 'mouseleave', () => {
    pointerInside = false;
  });
  /* 首次无法捕获鼠标时切换至兼容模式。 */
  function handleLockFailure() {
    lockRequestedAt = 0;
    if (!(input.locked || input.touch)) {
      lockFailures++;
      if (!hasCapturedMouse) {
        setMode('drag');
      }
    }
  }
  /* 只在用户操作触发后申请 Pointer Lock。 */
  // 应从用户点击事件调用；浏览器拒绝或超时后由 handleLockFailure 切换回退模式。
  function requestLock() {
    if (!(input.touch || input.locked)) {
      if (!canvas.requestPointerLock) {
        handleLockFailure();
        return;
      }
      try {
        lockRequestedAt = performance.now();
        let P = canvas.requestPointerLock();
        if (P && P.catch) {
          P.catch(() => handleLockFailure());
        }
      } catch {
        handleLockFailure();
      }
      try {
        canvas.focus({
          preventScroll: true,
        });
      } catch {}
    }
  }
  /* 释放浏览器鼠标锁定。 */
  function exitLock() {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } catch {}
  }
  let touchControls = null,
    lastTouchAt = 0,
    moveTouchId = -1,
    stickOriginX = 0,
    stickOriginY = 0,
    touchMoveX = 0,
    touchMoveY = 0,
    lookTouchId = -1,
    lookTouchX = 0,
    lookTouchY = 0,
    fireTouchId = -1,
    fireTouchX = 0,
    fireTouchY = 0,
    touchAim = false;
  /* 按原版 DOM 创建触屏按钮，保留多点触控与开火拖动视角。 */
  // 触屏按钮独立保留触点 id，允许移动、转向与射击由不同手指同时操作。
  function createTouchControls() {
    let root = document.createElement('div');
    root.className = 'touch';
    root.innerHTML =
      '<div class="t-stick"><i class="t-ring"></i><i class="t-nub"></i></div><button class="t-btn t-fire" data-a="fire" aria-label="Fire"><span>FIRE</span></button><button class="t-btn t-ads" data-a="ads" aria-label="Aim"><span>AIM</span></button><button class="t-btn t-reload" data-a="reload" aria-label="Reload"><span>RLD</span></button><button class="t-btn t-jump" data-a="jump" aria-label="Jump"><span>JUMP</span></button><button class="t-btn t-interact" data-a="interact" aria-label="Interact"><span>USE</span></button><button class="t-btn t-pause" data-a="pause" aria-label="Pause"><span>II</span></button>';
    uiRoot.appendChild(root);
    let query = (L) => root.querySelector(L),
      controls = {
        root: root,
        stick: query('.t-stick'),
        nub: query('.t-nub'),
        btn: {
          fire: query('.t-fire'),
          ads: query('.t-ads'),
          reload: query('.t-reload'),
          jump: query('.t-jump'),
          interact: query('.t-interact'),
          pause: query('.t-pause'),
        },
      };
    for (let L in controls.btn) {
      let Z = controls.btn[L];
      listen(
        Z,
        'touchstart',
        (oe) => {
          oe.preventDefault();
          oe.stopPropagation();
          lastTouchAt = performance.now();
          let fe = oe.changedTouches[0];
          if (L === 'ads') {
            touchAim = !touchAim;
            Z.classList.toggle('active', touchAim);
            return;
          }
          if (L === 'fire') {
            fireTouchId = fe.identifier;
            fireTouchX = fe.clientX;
            fireTouchY = fe.clientY;
          }
          Z.classList.add('active');
          setAction('touch', L, true);
        },
        {
          passive: false,
        },
      );
      let J = (oe) => {
        if ((oe.preventDefault(), oe.stopPropagation(), L !== 'ads')) {
          if (L === 'fire') {
            let fe = false;
            for (let le of oe.changedTouches) {
              if (le.identifier === fireTouchId) {
                fe = true;
              }
            }
            if (!fe) return;
            fireTouchId = -1;
          }
          Z.classList.remove('active');
          setAction('touch', L, false);
        }
      };
      listen(Z, 'touchend', J, {
        passive: false,
      });
      listen(Z, 'touchcancel', J, {
        passive: false,
      });
      listen(
        Z,
        'touchmove',
        (oe) => {
          if ((oe.preventDefault(), L === 'fire'))
            for (let fe of oe.changedTouches) {
              if (fe.identifier === fireTouchId) {
                addTouchLook(fe.clientX - fireTouchX, fe.clientY - fireTouchY);
                fireTouchX = fe.clientX;
                fireTouchY = fe.clientY;
              }
            }
        },
        {
          passive: false,
        },
      );
      listen(Z, 'contextmenu', (oe) => oe.preventDefault());
    }
    return controls;
  }
  /* 应用触屏灵敏度与反转 Y 设置。 */
  function addTouchLook(deltaX, deltaY) {
    input.look.dx += deltaX * TOUCH_LOOK_SCALE * input.sensitivity;
    input.look.dy += deltaY * TOUCH_LOOK_SCALE * input.sensitivity * (input.invertY ? -1 : 1);
  }
  /* 第一次触摸时启用触屏布局。 */
  function enableTouch() {
    if (!input.touch) {
      input.touch = true;
      exitLock();
      if (!touchControls) {
        touchControls = createTouchControls();
      }
      touchControls.root.classList.toggle('on', gameplayEnabled);
      document.documentElement.classList.add('is-touch');
      setMode('touch');
    }
  }
  /* 归零移动摇杆及其触点标识。 */
  function resetTouchStick() {
    moveTouchId = -1;
    touchMoveX = touchMoveY = 0;
    if (touchControls) {
      touchControls.stick.classList.remove('on');
    }
  }
  listen(
    window,
    'touchstart',
    () => {
      lastTouchAt = performance.now();
      enableTouch();
    },
    {
      passive: true,
      capture: true,
    },
  );
  listen(
    canvas,
    'touchstart',
    (P) => {
      if ((P.preventDefault(), !!gameplayEnabled))
        for (let V of P.changedTouches)
          V.clientX < innerWidth * 0.45 && moveTouchId < 0
            ? ((moveTouchId = V.identifier),
              (stickOriginX = V.clientX),
              (stickOriginY = V.clientY),
              (touchMoveX = touchMoveY = 0),
              touchControls &&
                ((touchControls.stick.style.transform = `translate3d(${stickOriginX}px,${stickOriginY}px,0)`),
                (touchControls.nub.style.transform = 'translate3d(0,0,0)'),
                touchControls.stick.classList.add('on')))
            : lookTouchId < 0 &&
              ((lookTouchId = V.identifier), (lookTouchX = V.clientX), (lookTouchY = V.clientY));
    },
    {
      passive: false,
    },
  );
  listen(
    canvas,
    'touchmove',
    (P) => {
      if ((P.preventDefault(), !!gameplayEnabled))
        for (let V of P.changedTouches)
          if (V.identifier === moveTouchId) {
            let Y = V.clientX - stickOriginX,
              L = V.clientY - stickOriginY,
              Z = Math.hypot(Y, L);
            if (Z > TOUCH_STICK_RADIUS) {
              Y *= TOUCH_STICK_RADIUS / Z;
              L *= TOUCH_STICK_RADIUS / Z;
            }
            touchMoveX = Y / TOUCH_STICK_RADIUS;
            touchMoveY = -L / TOUCH_STICK_RADIUS;
            if (touchControls) {
              touchControls.nub.style.transform = `translate3d(${Y.toFixed(1)}px,${L.toFixed(1)}px,0)`;
            }
          } else {
            if (V.identifier === lookTouchId) {
              addTouchLook(V.clientX - lookTouchX, V.clientY - lookTouchY);
              lookTouchX = V.clientX;
              lookTouchY = V.clientY;
            }
          }
    },
    {
      passive: false,
    },
  );
  let releaseTouches = (P) => {
    for (let V of P.changedTouches)
      V.identifier === moveTouchId
        ? resetTouchStick()
        : V.identifier === lookTouchId && (lookTouchId = -1);
  };
  listen(canvas, 'touchend', releaseTouches, {
    passive: false,
  });
  listen(canvas, 'touchcancel', releaseTouches, {
    passive: false,
  });
  let gamepadBindings = {
      0: 'jump',
      1: 'crouch',
      2: 'reload',
      3: 'interact',
      5: 'melee',
      6: 'ads',
      7: 'fire',
      9: 'pause',
      10: 'sprint',
      11: 'melee',
    },
    supportsGamepad = typeof navigator < 'u' && !!navigator.getGamepads,
    gamepadMoveX = 0,
    gamepadMoveY = 0,
    applyDeadZone = (P) => {
      let V = Math.abs(P);
      return V < 0.16 ? 0 : (Math.sign(P) * (V - 0.16)) / 0.84;
    };
  /* 读取标准映射手柄，应用死区与非线性视角速度。 */
  function updateGamepad(dt) {
    if (((gamepadMoveX = gamepadMoveY = 0), !supportsGamepad)) return;
    let gamepads;
    try {
      gamepads = navigator.getGamepads();
    } catch {
      supportsGamepad = false;
      return;
    }
    let gamepad = null;
    for (let J = 0; gamepads && J < gamepads.length; J++)
      if (gamepads[J] && gamepads[J].connected && gamepads[J].mapping === 'standard') {
        gamepad = gamepads[J];
        break;
      }
    if (!gamepad) {
      if (input.gamepad) {
        input.gamepad = false;
        sourceActions.pad.clear();
      }
      return;
    }
    input.gamepad = true;
    gamepadMoveX = applyDeadZone(gamepad.axes[0] || 0);
    gamepadMoveY = -applyDeadZone(gamepad.axes[1] || 0);
    let lookX = applyDeadZone(gamepad.axes[2] || 0),
      lookY = applyDeadZone(gamepad.axes[3] || 0);
    if (gameplayEnabled) {
      input.look.dx += lookX * Math.abs(lookX) * GAMEPAD_LOOK_SPEED * dt * input.sensitivity;
      input.look.dy +=
        lookY *
        Math.abs(lookY) *
        GAMEPAD_LOOK_SPEED *
        0.7 *
        dt *
        input.sensitivity *
        (input.invertY ? -1 : 1);
    }
    for (let J in gamepadBindings) {
      let oe = gamepad.buttons[J];
      setAction('pad', gamepadBindings[J], !!oe && (oe.pressed || oe.value > 0.4));
    }
  }
  /* 汇总移动、瞄准、开火和冲刺；键盘与触屏、手柄可同时输入。 */
  /** @param {number} dt 本帧秒数；键盘/手柄转向按时间积分，鼠标位移已在事件中累积。 */
  function updateInput(dt) {
    if (
      (updateGamepad(dt),
      lockRequestedAt &&
        performance.now() - lockRequestedAt > 1200 &&
        !input.locked &&
        handleLockFailure(),
      input.mode === 'drag' && gameplayEnabled && pointerInside && !input.locked)
    ) {
      let Z =
          pointerX < 0.12
            ? -(0.12 - pointerX) / 0.12
            : pointerX > 0.88
              ? (pointerX - 0.88) / 0.12
              : 0,
        J = pointerY < 0.1 ? -(0.1 - pointerY) / 0.1 : pointerY > 0.9 ? (pointerY - 0.9) / 0.1 : 0;
      input.look.dx += Z * 2.4 * dt * input.sensitivity;
      input.look.dy += J * 1.2 * dt * input.sensitivity * (input.invertY ? -1 : 1);
    }
    let moveX = 0,
      moveY = 0,
      sprint = false;
    if (gameplayEnabled) {
      moveX = (heldActions.has('right') ? 1 : 0) - (heldActions.has('left') ? 1 : 0);
      moveY = (heldActions.has('forward') ? 1 : 0) - (heldActions.has('back') ? 1 : 0);
      sprint = heldActions.has('sprint');
      if (moveTouchId >= 0) {
        moveX += touchMoveX;
        moveY += touchMoveY;
        if (Math.hypot(touchMoveX, touchMoveY) > 0.93 && touchMoveY > 0.8) {
          sprint = true;
        }
      }
      moveX += gamepadMoveX;
      moveY += gamepadMoveY;
      let Z = Math.hypot(moveX, moveY);
      if (Z > 1) {
        moveX /= Z;
        moveY /= Z;
      }
      let J = (heldActions.has('turnR') ? 1 : 0) - (heldActions.has('turnL') ? 1 : 0),
        oe = (heldActions.has('turnD') ? 1 : 0) - (heldActions.has('turnU') ? 1 : 0);
      if (J) {
        input.look.dx += J * KEYBOARD_LOOK_SPEED * dt;
      }
      if (oe) {
        input.look.dy += oe * KEYBOARD_LOOK_SPEED * 0.6 * dt;
      }
    }
    input.move.x = moveX;
    input.move.y = moveY;
    input.fire = gameplayEnabled && heldActions.has('fire');
    input.ads = gameplayEnabled && (heldActions.has('ads') || touchAim);
    input.sprint = gameplayEnabled && sprint;
    input.crouch = gameplayEnabled && heldActions.has('crouch');
  }
  /* 帧末仅清空按下边沿及本帧视角增量。 */
  function endFrame() {
    // 保留 heldActions，所以持续按住的动作下一帧仍可读取。
    pressedActions.clear();
    input.look.dx = 0;
    input.look.dy = 0;
  }
  return input;
}
export { createInput };
