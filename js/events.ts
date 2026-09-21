// The signal path. Anything that changes the game state calls changed(); anything
// that only advances time calls tick(). The display subscribes with onChange/onTick,
// so no module below has to know that a display exists at all.

type Handler = () => void;
const listeners: { change: Handler[], tick: Handler[] } = { change:[], tick:[] };

export function onChange(fn: Handler){ listeners.change.push(fn); }
export function onTick(fn: Handler){ listeners.tick.push(fn); }

export function changed(){ for(const fn of listeners.change) fn(); }

export function tick(){ for(const fn of listeners.tick) fn(); }
