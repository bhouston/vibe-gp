// On-screen controls for touch devices (shown by CSS on a coarse pointer). They press the
// same keys as the keyboard through Input, so the game can't tell them apart.

/** Hold a key for as long as a finger stays on the element. */
function holdKey(el, input, code) {
  const set = (on) => {
    el.classList.toggle('active', on);
    if (on) input.down.add(code);
    else input.down.delete(code);
  };
  el.addEventListener('pointerdown', () => set(true));
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(type, () => set(false));
}

/** One pad for the left thumb: its left and right halves steer, sliding across switches. */
function steerPad(pad, input) {
  const [left, right] = pad.children;
  const set = (x) => {
    const r = pad.getBoundingClientRect();
    const dir = x === null ? 0 : x < r.left + r.width / 2 ? -1 : 1;
    left.classList.toggle('active', dir < 0);
    right.classList.toggle('active', dir > 0);
    input.down.delete('ArrowLeft');
    input.down.delete('ArrowRight');
    if (dir) input.down.add(dir < 0 ? 'ArrowLeft' : 'ArrowRight');
  };
  pad.addEventListener('pointerdown', (e) => {
    pad.setPointerCapture(e.pointerId);
    set(e.clientX);
  });
  pad.addEventListener('pointermove', (e) => pad.hasPointerCapture(e.pointerId) && set(e.clientX));
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, () => set(null));
}

export function bindTouch(input) {
  const root = document.getElementById('touch');
  root.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press isn't a menu
  steerPad(document.getElementById('touch-steer'), input);
  for (const el of root.querySelectorAll('[data-hold]')) holdKey(el, input, el.dataset.hold);
  for (const el of root.querySelectorAll('[data-tap]')) el.addEventListener('click', () => input.pressed.add(el.dataset.tap));
}
