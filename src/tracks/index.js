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
import suzukaOsm from './land/osm/suzuka.js';
import jeddahOsm from './land/osm/jeddah.js';
import montrealOsm from './land/osm/montreal.js';
import monacoOsm from './land/osm/monaco.js';
import barcelonaOsm from './land/osm/barcelona.js';
import spaOsm from './land/osm/spa.js';
import hungaroringOsm from './land/osm/hungaroring.js';
import zandvoortOsm from './land/osm/zandvoort.js';
import interlagosOsm from './land/osm/interlagos.js';
import lasvegasOsm from './land/osm/lasvegas.js';
import yasmarinaOsm from './land/osm/yasmarina.js';
import imolaOsm from './land/osm/imola.js';

// land.ground -> the scenery flags that pick the ground material (track.js)
function groundFlags(ground) {
  if (!ground) return {};
  return { paved: ground === 'paved', desert: ground === 'desert', dunes: ground === 'dunes', cityGround: ground === 'city' };
}

/**
 * Merge a circuit's hand-matched run-off and surroundings (src/tracks/land/<id>.js) into its
 * generated definition: `surfaces` replaces its src/tracks/runoff.js entry, `scenery` and
 * `kerb` override the generated ones, and the whole file is kept as def.land. The
 * OpenStreetMap land around it (src/tracks/land/osm/<id>.js) becomes def.landOsm.
 */
function withLand(def, land, osm) {
  if (osm && Object.keys(osm).length) def = { ...def, landOsm: osm };
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
    [suzuka, suzukaLand, suzukaOsm], [jeddah, jeddahLand, jeddahOsm], [montreal, montrealLand, montrealOsm], [monaco, monacoLand, monacoOsm],
    [barcelona, barcelonaLand, barcelonaOsm], [spa, spaLand, spaOsm], [hungaroring, hungaroringLand, hungaroringOsm], [zandvoort, zandvoortLand, zandvoortOsm],
    [interlagos, interlagosLand, interlagosOsm], [lasvegas, lasvegasLand, lasvegasOsm], [yasmarina, yasmarinaLand, yasmarinaOsm], [imola, imolaLand, imolaOsm],
  ].map(([def, land, osm]) => withLand(def, land, osm)),
];
