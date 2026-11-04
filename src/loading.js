// The loading screen every track load shares: a full-screen overlay with the track's name,
// a progress bar and the current step. Track.create (track.js) builds a circuit in steps
// and hands back to the browser between them (nextFrame), so the bar can repaint instead
// of the page freezing.

/** Resolve after the browser has painted a frame. */
export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

export class LoadingBar {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'loading';
    this.el.innerHTML = `
      <div class="loading-panel">
        <div class="loading-kicker">Loading</div>
        <div class="loading-title"></div>
        <div class="loading-track"><div class="loading-fill"></div></div>
        <div class="loading-step"></div>
      </div>`;
    this.title = this.el.querySelector('.loading-title');
    this.fill = this.el.querySelector('.loading-fill');
    this.step = this.el.querySelector('.loading-step');
    document.body.appendChild(this.el);
    this.value = 0;
  }

  /** Show the overlay for a new load. */
  show(title) {
    this.title.textContent = title;
    this.value = 0;
    this.fill.style.transform = 'scaleX(0)';
    this.step.textContent = '';
    this.el.classList.add('visible');
  }

  /** Progress 0..1 (never moves backwards) and what is being done now. */
  progress(f, label) {
    this.value = Math.max(this.value, Math.min(1, f));
    this.fill.style.transform = `scaleX(${this.value})`;
    if (label) this.step.textContent = label;
  }

  hide() {
    this.el.classList.remove('visible');
  }
}
