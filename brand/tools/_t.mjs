import * as g from './geo.mjs';
const c = g.cradleC({});
console.log(c.d, '\nopening', c.opening.toFixed(1), 'cap r', c.rc.toFixed(2));
console.log('bounds', g.P(c.d).bounds.toString());
