// All selectable tracks, in menu order: the test oval, then the 2026 Formula 1 calendar in
// round order (Bahrain and Jeddah were cancelled in March 2026 but keep their slots), then Imola.
import oval from './oval.js';
import suzuka from './suzuka.js';
import jeddah from './jeddah.js';
import montreal from './montreal.js';
import monaco from './monaco.js';
import barcelona from './barcelona.js';
import spa from './spa.js';
import hungaroring from './hungaroring.js';
import zandvoort from './zandvoort.js';
import interlagos from './interlagos.js';
import lasvegas from './lasvegas.js';
import yasmarina from './yasmarina.js';
import imola from './imola.js';

import suzukaLand from './land/suzuka.js';
import jeddahLand from './land/jeddah.js';
import montrealLand from './land/montreal.js';
import monacoLand from './land/monaco.js';
import barcelonaLand from './land/barcelona.js';
import spaLand from './land/spa.js';
import hungaroringLand from './land/hungaroring.js';
import zandvoortLand from './land/zandvoort.js';
import interlagosLand from './land/interlagos.js';
import lasvegasLand from './land/lasvegas.js';
import yasmarinaLand from './land/yasmarina.js';
import imolaLand from './land/imola.js';

// land.ground -> the scenery flags that pick the ground material (track.js)
function groundFlags(ground) {
  if (!ground) return {};
  return { paved: ground === 'paved', desert: ground === 'desert', dunes: ground === 'dunes', cityGround: ground === 'city' };
}

/**
 * Merge a circuit's hand-matched run-off and surroundings (src/tracks/land/<id>.js) into its
 * generated definition: `surfaces` replaces its src/tracks/runoff.js entry, `scenery` and
 * `kerb` override the generated ones, and the whole file is kept as def.land. The
 * OpenStreetMap land around it (src/tracks/land/osm/<id>.js, megabytes on a big city
 * circuit) is only loaded when the circuit is: def.loadLandOsm(), see Track.create.
 */
function withLand(def, land, loadLandOsm) {
  def = { ...def, loadLandOsm };
  if (!land || !Object.keys(land).length) return def;
  return {
    ...def,
    ...(land.surfaces && { surfaces: land.surfaces }),
    ...(land.kerb && { kerb: land.kerb }),
    scenery: { ...def.scenery, ...groundFlags(land.ground), ...land.scenery },
    land,
  };
}

export const TRACKS = [
  oval, ...[
    [suzuka, suzukaLand, () => import('./land/osm/suzuka.js')], [jeddah, jeddahLand, () => import('./land/osm/jeddah.js')], [montreal, montrealLand, () => import('./land/osm/montreal.js')], [monaco, monacoLand, () => import('./land/osm/monaco.js')],
    [barcelona, barcelonaLand, () => import('./land/osm/barcelona.js')], [spa, spaLand, () => import('./land/osm/spa.js')], [hungaroring, hungaroringLand, () => import('./land/osm/hungaroring.js')], [zandvoort, zandvoortLand, () => import('./land/osm/zandvoort.js')],
    [interlagos, interlagosLand, () => import('./land/osm/interlagos.js')], [lasvegas, lasvegasLand, () => import('./land/osm/lasvegas.js')], [yasmarina, yasmarinaLand, () => import('./land/osm/yasmarina.js')], [imola, imolaLand, () => import('./land/osm/imola.js')],
  ].map(([def, land, loadOsm]) => withLand(def, land, loadOsm)),
];
