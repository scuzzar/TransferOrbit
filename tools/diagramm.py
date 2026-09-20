# -*- coding: utf-8 -*-
"""Erzeugt docs/komponenten.svg - das Komponentendiagramm aus ARCHITEKTUR.md.

Die Schichtzahlen und Zeilenzahlen stehen unten in BAENDER und muessen zu den
Dateien unter js/ passen. Nach einer groesseren Aenderung an der Aufteilung:
Zahlen hier nachziehen und das Skript neu laufen lassen.

Aufruf:  python3 tools/diagramm.py
"""
import html

BG='#10162b'; BAND='#171f3b'; LINE='#2b3662'; CHIP='#1d2748'
TEXT='#e7e9f2'; MUTED='#9aa2c2'; AKZENT='#f2b33d'
SANS='ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif'
MONO='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

W=1020
LX=56; RX=752; BW=RX-LX          # Bandkasten
CW=216; CG=14; CH=34             # Chip
SP=[66, 296, 526]                # drei Spalten
KX0=768; KX1=1004                # Kanal rechts
TRUNK_AB=800; TRUNK_AUF=972

BAENDER=[
 # (y, hoehe, Titel, Unterzeile, [(Reihe, Spalte, Rang, Name, Zeilen)], breit?)
 (118, 70,'Aufbau','verbindet beide Seiten, lädt den Spielstand',
   [(0,None,21,'start.js',56)], True),
 (202,114,'Oberfläche','baut HTML, hängt Klicks an die Kommandos',
   [(0,0,17,'ui/bausteine',39),(0,1,18,'ui/panels',314),(0,2,19,'ui/anzeige',145),
    (1,1,20,'ui/menue',70)], False),
 (330,114,'Karte','drei Ebenen, ein Bild',
   [(0,0,11,'karte/leinwand',55),(0,1,12,'karte/raketendaten',18),(0,2,13,'karte/gl',287),
    (1,0,14,'karte/rakete',75),(1,1,15,'karte/ansicht',86),(1,2,16,'karte/zeichnen',300)], False),
 (458, 70,'Kommandos','das Einzige, was den Spielstand ändert',
   [(0,None,10,'spiel/steuerung',332)], True),
 (542, 70,'Vorausberechnung','wo etwas liegt, welcher Weg wie teuer ist — ändert nichts',
   [(0,0,8,'karte/geometrie',181),(0,1,9,'spiel/planer',87)], False),
 (626,114,'Spielmodell','Stammdaten und reine Abfragen darauf',
   [(0,0,2,'spiel/welt',196),(0,1,3,'spiel/physik',89),(0,2,4,'spiel/zustand',54),
    (1,0,5,'spiel/graph',77),(1,1,6,'spiel/wirtschaft',107),(1,2,7,'spiel/aktionen',61)], False),
 (754, 70,'Basis','kennt weder Spiel noch Karte noch Oberfläche',
   [(0,None,1,'basis',32)], True),
]
H=896
o=[]
def t(x,y,s,*,size=11,fill=TEXT,anchor='start',font=SANS,weight=None,extra=''):
    w=f' font-weight="{weight}"' if weight else ''
    o.append(f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}" '
             f'text-anchor="{anchor}"{w}{extra}>{html.escape(s)}</text>')

o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'role="img" aria-label="Komponentendiagramm von TransferOrbit: 22 ES-Module in sieben '
         f'Schichtbändern. Einfuhren gehen nur nach unten; der einzige Weg zurück nach oben sind '
         f'die zwei Signale geaendert und zeitLief über das Modul ereignisse.">')
o.append('<title>TransferOrbit — Komponenten und ihre Abhängigkeiten</title>')
o.append('<defs>'
 f'<marker id="pf" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
 f'<path d="M0,0 L10,5 L0,10 z" fill="{MUTED}"/></marker>'
 f'<marker id="pfa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
 f'<path d="M0,0 L10,5 L0,10 z" fill="{AKZENT}"/></marker>'
 '</defs>')
o.append(f'<rect width="{W}" height="{H}" fill="{BG}"/>')

# ---- Kopf
t(30,28,'TransferOrbit · Komponenten und ihre Abhängigkeiten',size=15,weight='600')
t(30,48,'22 ES-Module unter js/ (Version 40). Die Zahl im Kreis ist die Schicht, die Zahl rechts die Zeilen.',
  size=11,fill=MUTED)

# ---- index.html als Einstieg
o.append(f'<rect x="296" y="68" width="216" height="28" rx="6" fill="none" stroke="{MUTED}" '
         f'stroke-width="1" stroke-dasharray="3 3"/>')
t(404,86,'index.html  ·  Markup und CSS',size=10.5,fill=MUTED,anchor='middle')
o.append(f'<line x1="404" y1="96" x2="404" y2="114" stroke="{MUTED}" stroke-width="1.2" marker-end="url(#pf)"/>')
t(412,110,'lädt <script type="module">',size=9.5,fill=MUTED)

# ---- Einfuhr-Achse links
o.append(f'<line x1="34" y1="126" x2="34" y2="816" stroke="{MUTED}" stroke-width="1.6" marker-end="url(#pf)"/>')
t(0,0,'führt ein — jedes Modul darf aus jeder Schicht darunter einführen, nie umgekehrt',
  size=10.5,fill=MUTED,anchor='middle',extra=' transform="translate(22,471) rotate(-90)"')

# ---- Bänder
for by,bh,titel,unter,chips,breit in BAENDER:
    o.append(f'<rect x="{LX}" y="{by}" width="{BW}" height="{bh}" rx="9" fill="{BAND}" stroke="{LINE}"/>')
    t(LX+10,by+17,titel,size=11,weight='600')
    t(LX+10+len(titel)*6.9+10,by+17,unter,size=10,fill=MUTED)
    for reihe,spalte,rang,name,zeilen in chips:
        cx = 66 if breit else SP[spalte]
        cw = BW-20 if breit else CW
        cy = by+26+reihe*(CH+10)
        stark = name=='spiel/steuerung'
        o.append(f'<rect x="{cx}" y="{cy}" width="{cw}" height="{CH}" rx="6" fill="{CHIP}" '
                 f'stroke="{TEXT if stark else LINE}" stroke-width="{1.4 if stark else 1}"/>')
        o.append(f'<circle cx="{cx+18}" cy="{cy+17}" r="10" fill="none" stroke="{MUTED}" stroke-width="1"/>')
        t(cx+18,cy+20.5,str(rang),size=10,fill=MUTED,anchor='middle')
        t(cx+36,cy+21.5,name,size=11,font=MONO,weight='600' if stark else None)
        t(cx+cw-9,cy+21.5,str(zeilen),size=9.5,fill=MUTED,anchor='end')

# ---- ereignisse als Nabe im Kanal
EY=754
o.append(f'<rect x="{KX0}" y="{EY}" width="{KX1-KX0}" height="70" rx="9" fill="{BAND}" '
         f'stroke="{AKZENT}" stroke-width="1.4"/>')
o.append(f'<circle cx="{KX0+20}" cy="{EY+19}" r="10" fill="none" stroke="{AKZENT}" stroke-width="1"/>')
t(KX0+20,EY+22.5,'0',size=10,fill=AKZENT,anchor='middle')
t(KX0+38,EY+23,'js/ereignisse.js',size=11,font=MONO,fill=AKZENT,weight='600')
t(KX0+12,EY+42,'beiAenderung(fn) · beiZeit(fn)',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,EY+57,'geaendert() · zeitLief()',size=9.5,font=MONO,fill=MUTED)

# ---- Hinweg: meldet (durchgezogen, Akzent). Der Stummel haengt am Band, nicht am Chip:
# in jedem dieser Baender melden mehrere Module.
for y,wer in ((300,'Tafeln · Menü · Anzeige'),(430,'Ansicht · GL'),(493,'Steuerung, 29×')):
    o.append(f'<path d="M{RX},{y} H{TRUNK_AB}" stroke="{AKZENT}" stroke-width="1.4" fill="none"/>')
    o.append(f'<circle cx="{RX}" cy="{y}" r="2.6" fill="{AKZENT}"/>')
    t(TRUNK_AB+9,y+3.5,wer,size=9,fill=MUTED)
o.append(f'<line x1="{TRUNK_AB}" y1="300" x2="{TRUNK_AB}" y2="{EY}" stroke="{AKZENT}" '
         f'stroke-width="1.4" marker-end="url(#pfa)"/>')
t(TRUNK_AB+9,570,'meldet',size=10.5,fill=AKZENT,weight='600')
t(TRUNK_AB+9,585,'geaendert()',size=9.5,font=MONO,fill=MUTED)
t(TRUNK_AB+9,598,'zeitLief()',size=9.5,font=MONO,fill=MUTED)

# ---- Rückweg: ruft die eingetragenen Funktionen (gestrichelt, Akzent)
o.append(f'<path d="M{KX1-32},{EY} V252" stroke="{AKZENT}" stroke-width="1.4" fill="none" stroke-dasharray="6 4"/>')
o.append(f'<path d="M{KX1-32},417 H746" stroke="{AKZENT}" stroke-width="1.4" fill="none" '
         f'stroke-dasharray="6 4" marker-end="url(#pfa)"/>')
o.append(f'<path d="M{KX1-32},252 H746" stroke="{AKZENT}" stroke-width="1.4" fill="none" '
         f'stroke-dasharray="6 4" marker-end="url(#pfa)"/>')
t(KX1-44,690,'ruft',size=10.5,fill=AKZENT,weight='600',anchor='end')
t(KX1-44,705,'render() · header()',size=9.5,font=MONO,fill=MUTED,anchor='end')
t(KX1-44,718,'speedHint() · draw()',size=9.5,font=MONO,fill=MUTED,anchor='end')

# ---- Notiz oben im Kanal: wer eintraegt
o.append(f'<rect x="{KX0}" y="118" width="{KX1-KX0}" height="70" rx="9" fill="none" '
         f'stroke="{LINE}" stroke-dasharray="3 3"/>')
t(KX0+12,136,'Nur start.js trägt ein:',size=10,fill=TEXT,weight='600')
t(KX0+12,151,'beiAenderung → render + save',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,165,'beiZeit → header + speedHint',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,178,'            + draw',size=9.5,font=MONO,fill=MUTED)
o.append(f'<path d="M742,153 H{KX0}" stroke="{MUTED}" stroke-width="1.2" fill="none" '
         f'stroke-dasharray="2 3" marker-end="url(#pf)"/>')

# ---- Legende
LY=858
o.append(f'<line x1="30" y1="{LY}" x2="70" y2="{LY}" stroke="{MUTED}" stroke-width="1.6" marker-end="url(#pf)"/>')
t(78,LY+4,'führt ein (nur nach unten)',size=10,fill=MUTED)
o.append(f'<line x1="290" y1="{LY}" x2="330" y2="{LY}" stroke="{AKZENT}" stroke-width="1.6" marker-end="url(#pfa)"/>')
t(338,LY+4,'meldet ein Signal',size=10,fill=MUTED)
o.append(f'<line x1="500" y1="{LY}" x2="540" y2="{LY}" stroke="{AKZENT}" stroke-width="1.6" '
         f'stroke-dasharray="6 4" marker-end="url(#pfa)"/>')
t(548,LY+4,'ruft die eingetragene Funktion',size=10,fill=MUTED)
t(1004,LY+4,'keine Einfuhr zeigt nach oben',size=10,fill=TEXT,weight='600',anchor='end')

o.append('</svg>')
open('/home/user/TransferOrbit/docs/komponenten.svg','w',encoding='utf-8').write('\n'.join(o)+'\n')
print('geschrieben')
