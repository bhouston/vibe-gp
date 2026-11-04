// DOM-based heads-up display.
import { formatTime } from './race.js';

export class Hud {
  constructor() {
    this.el = {
      speed: document.getElementById('speed'),
      gear: document.getElementById('gear'),
      rpm: document.getElementById('rpm-fill'),
      lap: document.getElementById('lap'),
      current: document.getElementById('current'),
      last: document.getElementById('last'),
      best: document.getElementById('best'),
      flash: document.getElementById('flash'),
      cam: document.getElementById('cam'),
      surface: document.getElementById('surface'),
    };
  }

  update(car, timer, camMode) {
    const e = this.el;
    e.speed.textContent = Math.round(Math.abs(car.speed) * 3.6);
    e.gear.textContent = car.gear;
    e.rpm.style.width = `${(car.rpm * 100).toFixed(1)}%`;
    e.rpm.classList.toggle('redline', car.rpm > 0.93);
    e.lap.textContent = timer.lap === 0 ? 'OUT' : timer.lap;
    e.current.textContent = formatTime(timer.current);
    e.last.textContent = formatTime(timer.last);
    e.best.textContent = formatTime(timer.best);
    e.cam.textContent = camMode.toUpperCase();
    e.surface.textContent = car.surface === 'grass' ? 'OFF TRACK' : '';
    const f = timer.flash;
    if (f && timer.time < f.until) {
      e.flash.textContent = f.text;
      e.flash.classList.add('show');
      e.flash.classList.toggle('best', !!f.best);
    } else e.flash.classList.remove('show');
  }
}
