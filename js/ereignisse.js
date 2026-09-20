// Der Signalweg. Wer den Spielstand ändert, ruft geaendert(); wer nur die Zeit
// weiterdreht, ruft zeitLief(). Die Anzeige hängt sich mit beiAenderung/beiZeit ein.
// Kein Modul kennt dadurch die Anzeige.

const hoerer = { aenderung:[], zeit:[] };

// Die Anzeige hängt sich hier ein. start.js macht das einmal beim Aufbau.
export function beiAenderung(fn){ hoerer.aenderung.push(fn); }
export function beiZeit(fn){ hoerer.zeit.push(fn); }

// Der Spielstand hat sich geändert: alles neu aufbauen und sichern.
export function geaendert(){ for(const fn of hoerer.aenderung) fn(); }

// Nur die Zeit ist weitergelaufen (Animation): Kopfzeile und Karte, sonst nichts.
export function zeitLief(){ for(const fn of hoerer.zeit) fn(); }
