# -*- coding: utf-8 -*-
"""Erzeugt docs/komponenten.svg - das Komponentendiagramm aus ARCHITEKTUR.md.

Zeilenzahl, Modulzahl und Versionsnummer liest das Skript aus js/, damit sie
nicht veralten koennen. Von Hand gepflegt sind nur die Baender, die Schichtzahlen
und die Beschreibungen: nach einer Aenderung an der Aufteilung hier nachziehen
und das Skript neu laufen lassen.

Aufruf:  python3 tools/diagramm.py
"""
import html, os, re

BG='#10162b'; BAND='#171f3b'; LINE='#2b3662'; CHIP='#1d2748'
TEXT='#e7e9f2'; MUTED='#9aa2c2'; AKZENT='#f2b33d'
SANS='ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif'
MONO='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

W=1020
LX=64; RX=752; BW=RX-LX
CW=210; CG=14; CH=34
SP=[74, 298, 522]
KX0=768; KX1=1004
TRUNK_AB=800

def zeilen(name):
    with open(os.path.join('js', name + '.js'), encoding='utf-8') as f:
        return sum(1 for _ in f)

QUELLE=open('js/basis.js', encoding='utf-8').read()
VERSION=re.search(r"VERSION = '([^']+)'", QUELLE).group(1)
ANZAHL=sum(len(fs) for _,_,fs in os.walk('js') for f in [0]) if False else sum(
    1 for wurzel,_,fs in os.walk('js') for f in fs if f.endswith('.js'))

# (Titel, Unterzeile, [(Reihe, Spalte, Rang, Name)], breit?, Gruppe)
BAENDER=[
 ('Aufbau','verbindet beide Seiten, lädt den Spielstand',
   [(0,None,22,'start')], True, None),
 ('Tafeln (DOM)','oben die zwei, die als Einzige beide Hälften kennen; darunter das reine HTML',
   [(0,0,20,'ui/anzeige'),(0,1,21,'ui/menue'),
    (1,0,17,'ui/bausteine'),(1,1,18,'ui/pickkarte'),(1,2,19,'ui/panels')], False, 'Darstellung'),
 ('Leinwand (Canvas)','drei Ebenen, ein Bild — kennt die Tafeln nicht',
   [(0,0,11,'karte/leinwand'),(0,1,12,'karte/raketendaten'),(0,2,13,'karte/gl'),
    (1,0,14,'karte/rakete'),(1,1,15,'karte/ansicht'),(1,2,16,'karte/zeichnen')], False, 'Darstellung'),
 ('Kommandos','das Einzige, was den Spielstand ändert',
   [(0,None,10,'spiel/steuerung')], True, None),
 ('Vorausberechnung','wo etwas liegt, welcher Weg wie teuer ist — ändert nichts',
   [(0,0,8,'karte/geometrie'),(0,1,9,'spiel/planer')], False, None),
 ('Spielmodell','Stammdaten und reine Abfragen darauf',
   [(0,0,2,'spiel/welt'),(0,1,3,'spiel/physik'),(0,2,4,'spiel/zustand'),
    (1,0,5,'spiel/graph'),(1,1,6,'spiel/wirtschaft'),(1,2,7,'spiel/aktionen')], False, None),
 ('Basis','kennt weder Spiel noch Karte noch Oberfläche',
   [(0,None,1,'basis')], True, None),
]

# ---- Hoehen und y-Werte ausrechnen, damit das Raster stimmt
BGAP=14; GPAD_OBEN=30; GPAD_UNTEN=12; GGAP=10
def bandhoehe(chips):
    return 26 + (max(r for r,*_ in chips)+1)*(CH+10)
lay=[]; y=118; rahmen=[]; offen=None
for titel,unter,chips,breit,gruppe in BAENDER:
    if gruppe and offen!=gruppe:
        if offen: rahmen[-1]['y1']=y-BGAP+GPAD_UNTEN; y+=GGAP
        rahmen.append({'name':gruppe,'y0':y}); y+=GPAD_OBEN; offen=gruppe
    elif offen and gruppe!=offen:
        rahmen[-1]['y1']=y-BGAP+GPAD_UNTEN; y+=GGAP; offen=None
    h=bandhoehe(chips)
    lay.append((y,h,titel,unter,chips,breit)); y+=h+BGAP
if offen: rahmen[-1]['y1']=y-BGAP+GPAD_UNTEN
ENDE=y-BGAP
EY=ENDE-70                        # ereignisse-Kasten am Fuss des Kanals
H=ENDE+82

o=[]
def t(x,y,s,*,size=11,fill=TEXT,anchor='start',font=SANS,weight=None,extra=''):
    w=f' font-weight="{weight}"' if weight else ''
    o.append(f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}" '
             f'text-anchor="{anchor}"{w}{extra}>{html.escape(s)}</text>')

o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'role="img" aria-label="Komponentendiagramm von TransferOrbit: {ANZAHL} ES-Module. Einfuhren '
         f'gehen nur nach unten; der einzige Weg zurück nach oben sind die zwei Signale geaendert '
         f'und zeitLief über das Modul ereignisse. Die Darstellung besteht aus zwei Hälften, '
         f'Leinwand und Tafeln, die einander nicht einführen.">')
o.append('<title>TransferOrbit — Komponenten und ihre Abhängigkeiten</title>')
o.append('<defs>'
 f'<marker id="pf" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
 f'<path d="M0,0 L10,5 L0,10 z" fill="{MUTED}"/></marker>'
 f'<marker id="pfa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
 f'<path d="M0,0 L10,5 L0,10 z" fill="{AKZENT}"/></marker>'
 '</defs>')
o.append(f'<rect width="{W}" height="{H}" fill="{BG}"/>')

t(30,28,'TransferOrbit · Komponenten und ihre Abhängigkeiten',size=15,weight='600')
t(30,47,f'{ANZAHL} ES-Module unter js/ (Version {VERSION}). Zahl im Kreis: Schicht. Zahl rechts: Zeilen.',size=11,fill=MUTED)
t(30,63,'Die Reihenfolge ist eine gültige Ordnung, keine erzwungene — vieles nebeneinander ist voneinander unabhängig.',
  size=10,fill=MUTED)

# index.html als Einstieg
o.append(f'<rect x="298" y="78" width="210" height="26" rx="6" fill="none" stroke="{MUTED}" '
         f'stroke-width="1" stroke-dasharray="3 3"/>')
t(403,95,'index.html  ·  Markup und CSS',size=10.5,fill=MUTED,anchor='middle')
o.append(f'<line x1="403" y1="104" x2="403" y2="114" stroke="{MUTED}" stroke-width="1.2" marker-end="url(#pf)"/>')
t(516,99,'lädt <script type="module">',size=9.5,fill=MUTED)

# Einfuhr-Achse links
o.append(f'<line x1="34" y1="122" x2="34" y2="{ENDE+6}" stroke="{MUTED}" stroke-width="1.6" marker-end="url(#pf)"/>')
t(0,0,'führt ein — jedes Modul darf aus jeder Schicht darunter einführen, nie umgekehrt',
  size=10.5,fill=MUTED,anchor='middle',extra=f' transform="translate(22,{(122+ENDE)//2}) rotate(-90)"')

# Gruppenrahmen: Karte und Tafeln sind zwei Haelften derselben Sache
for r in rahmen:
    o.append(f'<rect x="{LX-12}" y="{r["y0"]}" width="{BW+24}" height="{r["y1"]-r["y0"]}" rx="12" '
             f'fill="none" stroke="{MUTED}" stroke-width="1" stroke-dasharray="5 4"/>')
    t(LX-2,r['y0']+19,r['name'],size=12,weight='600')
    t(LX+84,r['y0']+19,'zwei Hälften — keine führt die andere ein. Erst ui/anzeige und ui/menue kennen beide.',
      size=10,fill=MUTED)

for by,bh,titel,unter,chips,breit in lay:
    o.append(f'<rect x="{LX}" y="{by}" width="{BW}" height="{bh}" rx="9" fill="{BAND}" stroke="{LINE}"/>')
    t(LX+10,by+17,titel,size=11,weight='600')
    t(LX+10+len(titel)*6.9+10,by+17,unter,size=10,fill=MUTED)
    for reihe,spalte,rang,name in chips:
        cx = LX+10 if breit else SP[spalte]
        cw = BW-20 if breit else CW
        cy = by+26+reihe*(CH+10)
        stark = name=='spiel/steuerung'
        o.append(f'<rect x="{cx}" y="{cy}" width="{cw}" height="{CH}" rx="6" fill="{CHIP}" '
                 f'stroke="{TEXT if stark else LINE}" stroke-width="{1.4 if stark else 1}"/>')
        o.append(f'<circle cx="{cx+18}" cy="{cy+17}" r="10" fill="none" stroke="{MUTED}" stroke-width="1"/>')
        t(cx+18,cy+20.5,str(rang),size=10,fill=MUTED,anchor='middle')
        t(cx+36,cy+21.5,name,size=11,font=MONO,weight='600' if stark else None)
        t(cx+cw-9,cy+21.5,str(zeilen(name)),size=9.5,fill=MUTED,anchor='end')

# ereignisse als Nabe im Kanal
o.append(f'<rect x="{KX0}" y="{EY}" width="{KX1-KX0}" height="70" rx="9" fill="{BAND}" '
         f'stroke="{AKZENT}" stroke-width="1.4"/>')
o.append(f'<circle cx="{KX0+20}" cy="{EY+19}" r="10" fill="none" stroke="{AKZENT}" stroke-width="1"/>')
t(KX0+20,EY+22.5,'0',size=10,fill=AKZENT,anchor='middle')
t(KX0+38,EY+23,'js/ereignisse.js',size=11,font=MONO,fill=AKZENT,weight='600')
t(KX0+12,EY+42,'beiAenderung(fn) · beiZeit(fn)',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,EY+57,'geaendert() · zeitLief()',size=9.5,font=MONO,fill=MUTED)

# Hinweg: meldet. Der Stummel haengt am Band, in jedem melden mehrere Module.
TAFELN,LEINWAND,KOMMANDOS = lay[1],lay[2],lay[3]
stummel=[(TAFELN[0]+TAFELN[1]-14,'Tafeln · Menü · Anzeige'),
         (LEINWAND[0]+LEINWAND[1]-14,'Ansicht · GL'),
         (KOMMANDOS[0]+KOMMANDOS[1]//2,'Steuerung, 29×')]
for y,wer in stummel:
    o.append(f'<path d="M{RX},{y} H{TRUNK_AB}" stroke="{AKZENT}" stroke-width="1.4" fill="none"/>')
    o.append(f'<circle cx="{RX}" cy="{y}" r="2.6" fill="{AKZENT}"/>')
    t(TRUNK_AB+9,y+3.5,wer,size=9,fill=MUTED)
o.append(f'<line x1="{TRUNK_AB}" y1="{stummel[0][0]}" x2="{TRUNK_AB}" y2="{EY}" stroke="{AKZENT}" '
         f'stroke-width="1.4" marker-end="url(#pfa)"/>')
ML=(stummel[2][0]+EY)//2
t(TRUNK_AB+9,ML,'meldet',size=10.5,fill=AKZENT,weight='600')
t(TRUNK_AB+9,ML+15,'geaendert()',size=9.5,font=MONO,fill=MUTED)
t(TRUNK_AB+9,ML+28,'zeitLief()',size=9.5,font=MONO,fill=MUTED)

# Rueckweg: ruft die eingetragenen Funktionen
ANZ=TAFELN[0]+26+17                  # ui/anzeige, erste Reihe der Tafeln
ZEI=LEINWAND[0]+26+(CH+10)+17        # karte/zeichnen, zweite Reihe der Leinwand
TA=KX1-32
o.append(f'<path d="M{TA},{EY} V{ANZ}" stroke="{AKZENT}" stroke-width="1.4" fill="none" stroke-dasharray="6 4"/>')
for yy in (ANZ,ZEI):
    o.append(f'<path d="M{TA},{yy} H{RX-6}" stroke="{AKZENT}" stroke-width="1.4" fill="none" '
             f'stroke-dasharray="6 4" marker-end="url(#pfa)"/>')
RL=EY-70
t(TA-12,RL,'ruft',size=10.5,fill=AKZENT,weight='600',anchor='end')
t(TA-12,RL+15,'render() · header()',size=9.5,font=MONO,fill=MUTED,anchor='end')
t(TA-12,RL+28,'speedHint() · draw()',size=9.5,font=MONO,fill=MUTED,anchor='end')

# Notiz oben im Kanal: wer eintraegt
AUF=lay[0]
o.append(f'<rect x="{KX0}" y="{AUF[0]}" width="{KX1-KX0}" height="{AUF[1]}" rx="9" fill="none" '
         f'stroke="{LINE}" stroke-dasharray="3 3"/>')
t(KX0+12,AUF[0]+18,'Nur start.js trägt ein:',size=10,weight='600')
t(KX0+12,AUF[0]+33,'beiAenderung → render + save',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,AUF[0]+47,'beiZeit → header + speedHint',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,AUF[0]+60,'          + draw',size=9.5,font=MONO,fill=MUTED)
o.append(f'<path d="M{RX-6},{AUF[0]+AUF[1]//2} H{KX0}" stroke="{MUTED}" stroke-width="1.2" fill="none" '
         f'stroke-dasharray="2 3" marker-end="url(#pf)"/>')

# Legende
LY=ENDE+40
o.append(f'<line x1="30" y1="{LY}" x2="70" y2="{LY}" stroke="{MUTED}" stroke-width="1.6" marker-end="url(#pf)"/>')
t(78,LY+4,'führt ein (nur nach unten)',size=10,fill=MUTED)
o.append(f'<line x1="290" y1="{LY}" x2="330" y2="{LY}" stroke="{AKZENT}" stroke-width="1.6" marker-end="url(#pfa)"/>')
t(338,LY+4,'meldet ein Signal',size=10,fill=MUTED)
o.append(f'<line x1="500" y1="{LY}" x2="540" y2="{LY}" stroke="{AKZENT}" stroke-width="1.6" '
         f'stroke-dasharray="6 4" marker-end="url(#pfa)"/>')
t(548,LY+4,'ruft die eingetragene Funktion',size=10,fill=MUTED)
t(1004,LY+4,'keine Einfuhr zeigt nach oben',size=10,weight='600',anchor='end')

o.append('</svg>')
open('docs/komponenten.svg','w',encoding='utf-8').write('\n'.join(o)+'\n')
print('geschrieben')
