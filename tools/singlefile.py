#!/usr/bin/env python3
"""Builds a single HTML file out of index.html and js/.

The game itself does not need this: on GitHub Pages the browser loads the
modules directly. It is needed wherever only one file arrives - as an
artifact to look at, or as an attachment.

Joining the files is deliberately blunt, and it is allowed to be:

* The modules are strictly layered (see ARCHITECTURE.md), there are no
  cycles. So the order of the imports in start.js is a valid order for
  concatenating them.
* Every name comes from a single script and is therefore unique.
  import/export can simply be dropped.

Usage:  python3 tools/singlefile.py [target.html]
"""
import re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, 'js')

def module_order():
    """The modules in the order start.js imports them."""
    t = open(os.path.join(JS, 'start.js'), encoding='utf-8').read()
    pairs = re.findall(r"^import \* as (\w+) from '\./(.+)\.js';$", t, re.M)
    return [(ns, path) for ns, path in pairs], t

def exports(t):
    """Every name a module exports."""
    n = set(re.findall(r'^export\s+function\s+([A-Za-z_$][\w$]*)', t, re.M))
    for m in re.finditer(r'^export\s+(?:const|let|var)\s+(.*)$', t, re.M):
        depth, cur, parts = 0, '', []
        for c in m.group(1):
            if c in '([{': depth += 1
            elif c in ')]}': depth -= 1
            if c == ',' and depth == 0: parts.append(cur); cur = ''
            else: cur += c
        parts.append(cur)
        for part in parts:
            g = re.match(r'\s*([A-Za-z_$][\w$]*)', part)
            if g: n.add(g.group(1))
    return n

def strip(t):
    """Drop the import lines and the export keyword."""
    t = re.sub(r"^import\s*\{[^}]*\}\s*from\s*'[^']+';\s*\n", '', t, flags=re.M)
    t = re.sub(r"^import\s*\*\s*as\s+\w+\s+from\s*'[^']+';\s*\n", '', t, flags=re.M)
    return re.sub(r'^export\s+', '', t, flags=re.M)

def build():
    pairs, start = module_order()
    parts, names = [], []
    for ns, path in pairs:
        source = open(os.path.join(JS, path + '.js'), encoding='utf-8').read()
        names += sorted(exports(source))
        parts.append(f'// ==================== {path}.js ====================\n' + strip(source))

    # start.js: imports out, namespaces resolved, the TO interface rebuilt
    body = strip(start)
    body = body[:body.index('const MODULES = {')]   # the TO interface is rebuilt below
    for ns, _ in pairs:
        body = re.sub(r'\b' + ns + r'\.', '', body)
    accessors = ',\n'.join(f"  {n}: {{ get:()=>{n}, enumerable:true }}" for n in sorted(set(names)))
    body += ('// The same outside edge as in the module build: TO.<name> always shows the current value.\n'
             'window.TO = Object.defineProperties({}, {\n' + accessors + '\n});\n')
    parts.append('// ==================== start.js ====================\n' + body)

    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    script = '<script>\n' + '\n\n'.join(parts) + '</script>'
    html = re.sub(r'<!-- The game lives in ES modules.*?</script>', script, html, flags=re.S)

    # The single file travels on its own, so the short notice in index.html, which points at
    # LICENSE, is replaced by the licence itself - that is what MIT asks for.
    licence = open(os.path.join(ROOT, 'LICENSE'), encoding='utf-8').read().strip()
    html = re.sub(r'<!-- TransferOrbit -.*?-->',
                  '<!--\n' + licence.replace('--', '- -') + '\n-->', html, count=1, flags=re.S)
    return html

if __name__ == '__main__':
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'transferorbit-singlefile.html')
    open(target, 'w', encoding='utf-8').write(build())
    print(target, os.path.getsize(target) // 1024, 'KB')
