// Mouse and keyboard state. Edge-triggered flags ("pressed", "released") are
// valid for exactly one simulation step and cleared by endFrame().

class InputState {
  constructor() {
    this.mouse = {
      x: 0, y: 0,
      downL: false, downR: false,
      pressedL: false, pressedR: false,
      releasedL: false, releasedR: false,
      wheel: 0,
    };
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.shift = false;
    this.ctrl = false;
    this.alt = false;
    this.typed = [];
    this._bound = false;
  }

  attach(canvas) {
    if (this._bound) return;
    this._bound = true;
    const scaleXY = (e) => {
      const r = canvas.getBoundingClientRect();
      const dpr = canvas.width / r.width;
      this.mouse.x = (e.clientX - r.left) * dpr;
      this.mouse.y = (e.clientY - r.top) * dpr;
    };

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousemove', scaleXY);
    canvas.addEventListener('mousedown', (e) => {
      scaleXY(e);
      e.preventDefault();
      if (e.button === 0) { this.mouse.downL = true; this.mouse.pressedL = true; }
      if (e.button === 2) { this.mouse.downR = true; this.mouse.pressedR = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouse.downL = false; this.mouse.releasedL = true; }
      if (e.button === 2) { this.mouse.downR = false; this.mouse.releasedR = true; }
    });
    window.addEventListener('blur', () => {
      this.mouse.downL = false; this.mouse.downR = false;
      this.keys.clear();
      this.shift = this.ctrl = this.alt = false;
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey; this.alt = e.altKey;
      if (!this.keys.has(e.code)) this.pressedKeys.add(e.code);
      this.keys.add(e.code);
      // Stop the browser stealing keys the game uses.
      if (['Tab', 'Space', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'AltLeft', 'AltRight'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey; this.alt = e.altKey;
      this.keys.delete(e.code);
    });
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.pressedKeys.has(code); }
  // Read a key press and swallow it so nothing else this frame sees it.
  consume(code) {
    if (this.pressedKeys.has(code)) { this.pressedKeys.delete(code); return true; }
    return false;
  }
  consumeL() {
    if (this.mouse.pressedL) { this.mouse.pressedL = false; return true; }
    return false;
  }
  consumeR() {
    if (this.mouse.pressedR) { this.mouse.pressedR = false; return true; }
    return false;
  }

  endFrame() {
    this.pressedKeys.clear();
    this.mouse.pressedL = false;
    this.mouse.pressedR = false;
    this.mouse.releasedL = false;
    this.mouse.releasedR = false;
    this.mouse.wheel = 0;
  }
}

export const Input = new InputState();
