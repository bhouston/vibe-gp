// The mobile profile: touch devices draw a lighter scene. ?quality=mobile or ?quality=full
// overrides the detection, to compare the two on one device.
const forced = new URLSearchParams(location.search).get('quality');
export const MOBILE = forced ? forced === 'mobile' : matchMedia('(pointer: coarse)').matches;
