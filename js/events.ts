// The signal path. Anything that changes the game state calls changed(); anything
// that only advances time calls tick(); anything the player should be told goes out
// through report(). The display subscribes with onChange/onTick/onReport, so no
// module below has to know that a display exists at all.

type Handler = () => void;

// What kind of moment a report marks: 'fresh' - a new or loaded game replaced the state;
// 'arrived' - the autopilot stopped somewhere worth looking at; 'info' - anything else.
export type ReportKind = 'info'|'fresh'|'arrived';
type Reporter = (text: string, kind: ReportKind) => void;

const listeners: { change: Handler[], tick: Handler[], report: Reporter[] } = { change:[], tick:[], report:[] };

export function onChange(fn: Handler){ listeners.change.push(fn); }
export function onTick(fn: Handler){ listeners.tick.push(fn); }
export function onReport(fn: Reporter){ listeners.report.push(fn); }

export function changed(){ for(const fn of listeners.change) fn(); }

export function tick(){ for(const fn of listeners.tick) fn(); }

// Only tells; the caller still reports changed() once it is done.
export function report(text: string, kind: ReportKind = 'info'){ for(const fn of listeners.report) fn(text, kind); }
