#!/usr/bin/env python3
"""Baut aus index.html und js/ eine einzelne HTML-Datei.

Das Spiel selbst braucht das nicht: auf GitHub Pages lädt der Browser die Module
direkt. Gebraucht wird es dort, wo nur eine Datei ankommt - etwa als Artefakt
zum Anschauen oder als Anhang.

Das Zusammenfügen ist hier bewusst stumpf und darf es sein:

* Die Module sind streng geschichtet (siehe ARCHITEKTUR.md), es gibt keine
  Kreise. Die Reihenfolge der Einfuhren in start.js ist also eine gültige
  Reihenfolge zum Aneinanderhängen.
* Alle Namen stammen aus einem einzigen Skript und sind deshalb eindeutig.
  import/export können einfach wegfallen.

Aufruf:  python3 tools/einzeldatei.py [Ziel.html]
"""
import re, sys, os

WURZEL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(WURZEL, 'js')

def module_reihenfolge():
    """Die Module in der Reihenfolge, in der start.js sie einführt."""
    t = open(os.path.join(JS, 'start.js'), encoding='utf-8').read()
    paare = re.findall(r"^import \* as (\w+) from '\./(.+)\.js';$", t, re.M)
    return [(ns, pfad) for ns, pfad in paare], t

def ausfuhren(t):
    """Alle Namen, die ein Modul ausführt."""
    n = set(re.findall(r'^export\s+function\s+([A-Za-z_$][\w$]*)', t, re.M))
    for m in re.finditer(r'^export\s+(?:const|let|var)\s+(.*)$', t, re.M):
        tiefe, akt, teile = 0, '', []
        for c in m.group(1):
            if c in '([{': tiefe += 1
            elif c in ')]}': tiefe -= 1
            if c == ',' and tiefe == 0: teile.append(akt); akt = ''
            else: akt += c
        teile.append(akt)
        for teil in teile:
            g = re.match(r'\s*([A-Za-z_$][\w$]*)', teil)
            if g: n.add(g.group(1))
    return n

def entkleiden(t):
    """import-Zeilen weg, export-Schlüsselwort weg."""
    t = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'[^']+';\s*\n", '', t, flags=re.M)
    t = re.sub(r"^import\s*\*\s*as\s+\w+\s+from\s*'[^']+';\s*\n", '', t, flags=re.M)
    return re.sub(r'^export\s+', '', t, flags=re.M)

def bauen():
    paare, start = module_reihenfolge()
    teile, namen = [], []
    for ns, pfad in paare:
        quelle = open(os.path.join(JS, pfad + '.js'), encoding='utf-8').read()
        namen += sorted(ausfuhren(quelle))
        teile.append(f'// ==================== {pfad}.js ====================\n' + entkleiden(quelle))

    # start.js: Einfuhren weg, Namensräume auflösen, die TO-Schnittstelle neu bauen
    rumpf = entkleiden(start)
    rumpf = rumpf[:rumpf.index('const MODULE = {')]   # die TO-Schnittstelle wird unten neu gebaut
    for ns, _ in paare:
        rumpf = re.sub(r'\b' + ns + r'\.', '', rumpf)
    zugriffe = ',\n'.join(f"  {n}: {{ get:()=>{n}, enumerable:true }}" for n in sorted(set(namen)))
    rumpf += ('// Dieselbe Aussenkante wie im Modulbau: TO.<Name> zeigt immer den aktuellen Wert.\n'
              'window.TO = Object.defineProperties({}, {\n' + zugriffe + '\n});\n')
    teile.append('// ==================== start.js ====================\n' + rumpf)

    html = open(os.path.join(WURZEL, 'index.html'), encoding='utf-8').read()
    skript = '<script>\n' + '\n\n'.join(teile) + '</script>'
    html = re.sub(r'<!-- Das Spiel liegt in ES-Modulen.*?</script>', skript, html, flags=re.S)
    return html

if __name__ == '__main__':
    ziel = sys.argv[1] if len(sys.argv) > 1 else os.path.join(WURZEL, 'transferorbit-einzeldatei.html')
    open(ziel, 'w', encoding='utf-8').write(bauen())
    print(ziel, os.path.getsize(ziel) // 1024, 'KB')
