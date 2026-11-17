/**
 * 操作说明与标题页快捷键图例。实际动作映射在 game/input/input.js；改键位时同步本文案。
 * 这里只展示说明，不注册输入事件，避免说明面板抢占游戏控制。
 */
export function KeyboardControls() {
  return (
    <dl className="keys">
      <div>
        <dt>Move</dt>
        <dd>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd>
        </dd>
      </div>
      <div>
        <dt>Look</dt>
        <dd>Mouse</dd>
      </div>
      <div>
        <dt>Fire</dt>
        <dd>Left button</dd>
      </div>
      <div>
        <dt>Aim</dt>
        <dd>Right button</dd>
      </div>
      <div>
        <dt>Reload</dt>
        <dd>
          <kbd>R</kbd>
        </dd>
      </div>
      <div>
        <dt>Cut relay</dt>
        <dd>
          Hold <kbd>E</kbd>
        </dd>
      </div>
      <div>
        <dt>Jump</dt>
        <dd>
          <kbd>Space</kbd>
        </dd>
      </div>
      <div>
        <dt>Sprint</dt>
        <dd>
          <kbd>Shift</kbd>
        </dd>
      </div>
      <div>
        <dt>Crouch</dt>
        <dd>
          <kbd>C</kbd> or <kbd>Ctrl</kbd>
        </dd>
      </div>
      <div>
        <dt>Melee</dt>
        <dd>
          <kbd>F</kbd>
        </dd>
      </div>
      <div>
        <dt>Pause</dt>
        <dd>
          <kbd>Esc</kbd> or <kbd>P</kbd>
        </dd>
      </div>
    </dl>
  );
}

export function TouchControlsGuide() {
  return (
    <dl className="keys">
      <div>
        <dt>Move</dt>
        <dd>Left thumb, anywhere</dd>
      </div>
      <div>
        <dt>Look</dt>
        <dd>Drag the right side</dd>
      </div>
      <div>
        <dt>Fire</dt>
        <dd>Hold FIRE, drag to track</dd>
      </div>
      <div>
        <dt>Aim</dt>
        <dd>AIM toggles</dd>
      </div>
      <div>
        <dt>Reload</dt>
        <dd>RLD</dd>
      </div>
      <div>
        <dt>Jump</dt>
        <dd>JUMP</dd>
      </div>
      <div>
        <dt>Cut relay</dt>
        <dd>Hold USE at a relay</dd>
      </div>
      <div>
        <dt>Sprint</dt>
        <dd>Push the stick fully forward</dd>
      </div>
    </dl>
  );
}

export function ControlsGuide() {
  return (
    <>
      <h3>Keyboard · Mouse</h3>
      <KeyboardControls />
      <p className="panel-note">
        If the browser will not capture the mouse, hold a mouse button and drag to look (left also
        fires, right also aims). Arrow keys or <kbd>I</kbd>
        <kbd>J</kbd>
        <kbd>K</kbd>
        <kbd>L</kbd> turn, <kbd>Enter</kbd> fires.
      </p>
      <h3>Touch</h3>
      <TouchControlsGuide />
      <h3>Gamepad</h3>
      <p className="panel-note">
        Sticks move and look · RT fire · LT aim · A jump · B crouch · X reload · Y cut relay · L3
        sprint · Start pause.
      </p>
    </>
  );
}

export function ControlsLegend() {
  return (
    <aside className="m-legend" aria-label="Controls at a glance">
      <div>
        <span>
          <kbd>W</kbd>
          <kbd>A</kbd>
          <kbd>S</kbd>
          <kbd>D</kbd> Move
        </span>
        <span>
          <kbd>Mouse</kbd> Look
        </span>
        <span>
          <kbd>LMB</kbd> Fire
        </span>
        <span>
          <kbd>RMB</kbd> Aim
        </span>
        <span>
          <kbd>R</kbd> Reload
        </span>
      </div>
      <div>
        <span>
          <kbd>E</kbd> Cut relay
        </span>
        <span>
          <kbd>Space</kbd> Jump
        </span>
        <span>
          <kbd>Shift</kbd> Sprint
        </span>
        <span>
          <kbd>C</kbd> Crouch
        </span>
        <span>
          <kbd>Esc</kbd> Pause
        </span>
      </div>
      <div className="lg-touch">
        <em>Touch</em>
        <span>Left thumb moves</span>
        <span>Right thumb looks</span>
        <span>Fire · Aim · Reload · Jump on screen</span>
      </div>
    </aside>
  );
}
