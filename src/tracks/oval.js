// The original 200 m-radius test circle, driven clockwise on the map.
const points = [];
for (let k = 0; k < 24; k++) {
  const a = (-k / 24) * Math.PI * 2;
  points.push([200 * Math.cos(a), 200 * Math.sin(a)]);
}

// Made-up pit lane on the infield: it leaves the circle 55° before the line, runs at
// 184 m radius past the start/finish line and rejoins 55° after it.
const pitPoints = [];
for (let deg = 55; deg >= -55; deg -= 2.5) {
  const t = Math.min(Math.max((55 - Math.abs(deg)) / 20, 0), 1);
  const r = 200 - 16 * t * t * (3 - 2 * t);
  const a = (deg * Math.PI) / 180;
  pitPoints.push([+(r * Math.cos(a)).toFixed(1), +(r * Math.sin(a)).toFixed(1)]);
}

export default {
  id: 'oval',
  name: 'Test Oval',
  country: 'Testing ground',
  width: 16,
  points,
  pitlane: { points: pitPoints },
};
