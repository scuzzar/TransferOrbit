# -*- coding: utf-8 -*-
"""Generates docs/components.svg - the component diagram from ARCHITECTURE.md.

Line count, module count and version number are read from js/ so they cannot
go stale. Kept by hand are only the bands, the layer numbers and the
descriptions: after a change to the split, adjust them here and run the
script again.

Usage:  python3 tools/diagram.py
"""
import html, os, re

BG='#10162b'; BAND='#171f3b'; LINE='#2b3662'; CHIP='#1d2748'
TEXT='#e7e9f2'; MUTED='#9aa2c2'; ACCENT='#f2b33d'
SANS='ui-sans-serif,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif'
MONO='ui-monospace,SFMono-Regular,Menlo,Consolas,monospace'

W=1020
LX=64; RX=752; BW=RX-LX          # band box
CW=210; CG=14; CH=34             # chip
COL=[74, 298, 522]               # three columns
KX0=768; KX1=1004                # channel on the right
TRUNK_UP=800

def lines(name):
    with open(os.path.join('js', name + '.js'), encoding='utf-8') as f:
        return sum(1 for _ in f)

VERSION=re.search(r"VERSION = '([^']+)'", open('js/basics.js', encoding='utf-8').read()).group(1)
# How often the commands report upwards - counted, so the label cannot go stale.
REPORTS=len(re.findall(r'\bchanged\(\)', open('js/game/commands.js', encoding='utf-8').read()))
COUNT=sum(1 for root,_,fs in os.walk('js') for f in fs if f.endswith('.js'))

# (title, subtitle, [(row, column, layer, name)], wide?, group)
BANDS=[
 ('Wiring','connects both sides, loads the save',
   [(0,None,22,'start')], True, None),
 ('Panels (DOM)','on top the two that are the only ones to know both halves; below, the plain HTML',
   [(0,0,20,'ui/display'),(0,1,21,'ui/menu'),
    (1,0,17,'ui/widgets'),(1,1,18,'ui/pickcard'),(1,2,19,'ui/panels')], False, 'Presentation'),
 ('Canvas','three layers, one picture - knows nothing of the panels',
   [(0,0,11,'map/canvas'),(0,1,12,'map/rocketdata'),(0,2,13,'map/gl'),
    (1,0,14,'map/rocket'),(1,1,15,'map/view'),(1,2,16,'map/draw')], False, 'Presentation'),
 ('Commands','the only thing that changes the game state',
   [(0,None,10,'game/commands')], True, None),
 ('Precomputation','where things are, which way costs what - changes nothing',
   [(0,0,8,'map/geometry'),(0,1,9,'game/planner')], False, None),
 ('Game model','reference data and pure queries on it',
   [(0,0,2,'game/world'),(0,1,3,'game/physics'),(0,2,4,'game/state'),
    (1,0,5,'game/graph'),(1,1,6,'game/economy'),(1,2,7,'game/actions')], False, None),
 ('Basics','knows neither the game nor the map nor the interface',
   [(0,None,1,'basics')], True, None),
]

# ---- work out heights and y values so the grid is exact
BGAP=14; GPAD_TOP=30; GPAD_BOTTOM=12; GGAP=10
def band_height(chips):
    return 26 + (max(r for r,*_ in chips)+1)*(CH+10)
lay=[]; y=118; frames=[]; open_group=None
for title,sub,chips,wide,group in BANDS:
    if group and open_group!=group:
        if open_group: frames[-1]['y1']=y-BGAP+GPAD_BOTTOM; y+=GGAP
        frames.append({'name':group,'y0':y}); y+=GPAD_TOP; open_group=group
    elif open_group and group!=open_group:
        frames[-1]['y1']=y-BGAP+GPAD_BOTTOM; y+=GGAP; open_group=None
    h=band_height(chips)
    lay.append((y,h,title,sub,chips,wide)); y+=h+BGAP
if open_group: frames[-1]['y1']=y-BGAP+GPAD_BOTTOM
END=y-BGAP
EY=END-70                        # the events box at the foot of the channel
H=END+82

o=[]
def t(x,y,s,*,size=11,fill=TEXT,anchor='start',font=SANS,weight=None,extra=''):
    w=f' font-weight="{weight}"' if weight else ''
    o.append(f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" fill="{fill}" '
             f'text-anchor="{anchor}"{w}{extra}>{html.escape(s)}</text>')

o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'role="img" aria-label="Component diagram of TransferOrbit: {COUNT} ES modules. Imports only '
         f'ever point downwards; the single way back up are the two signals changed and tick, carried by '
         f'the events module. The presentation consists of two halves, canvas and panels, which do not '
         f'import each other.">')
o.append('<title>TransferOrbit - components and their dependencies</title>')
o.append('<defs>'
 f'<marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
 f'<path d="M0,0 L10,5 L0,10 z" fill="{MUTED}"/></marker>'
 f'<marker id="ara" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
 f'<path d="M0,0 L10,5 L0,10 z" fill="{ACCENT}"/></marker>'
 '</defs>')
o.append(f'<rect width="{W}" height="{H}" fill="{BG}"/>')

t(30,28,'TransferOrbit · components and their dependencies',size=15,weight='600')
t(30,47,f'{COUNT} ES modules under js/ (version {VERSION}). Number in the circle: layer. Number on the right: lines.',size=11,fill=MUTED)
t(30,63,'The order drawn is one valid order, not a forced one - much of what sits side by side is independent.',
  size=10,fill=MUTED)

# index.html as the entry point
o.append(f'<rect x="298" y="78" width="210" height="26" rx="6" fill="none" stroke="{MUTED}" '
         f'stroke-width="1" stroke-dasharray="3 3"/>')
t(403,95,'index.html  ·  markup and CSS',size=10.5,fill=MUTED,anchor='middle')
o.append(f'<line x1="403" y1="104" x2="403" y2="114" stroke="{MUTED}" stroke-width="1.2" marker-end="url(#ar)"/>')
t(516,99,'loads <script type="module">',size=9.5,fill=MUTED)

# the import axis on the left
o.append(f'<line x1="34" y1="122" x2="34" y2="{END+6}" stroke="{MUTED}" stroke-width="1.6" marker-end="url(#ar)"/>')
t(0,0,'imports - every module may import from any layer below it, never the other way round',
  size=10.5,fill=MUTED,anchor='middle',extra=f' transform="translate(22,{(122+END)//2}) rotate(-90)"')

# group frame: canvas and panels are two halves of the same thing
for fr in frames:
    o.append(f'<rect x="{LX-12}" y="{fr["y0"]}" width="{BW+24}" height="{fr["y1"]-fr["y0"]}" rx="12" '
             f'fill="none" stroke="{MUTED}" stroke-width="1" stroke-dasharray="5 4"/>')
    t(LX-2,fr['y0']+19,fr['name'],size=12,weight='600')
    t(LX+92,fr['y0']+19,'two halves - neither imports the other. Only ui/display and ui/menu know both.',
      size=10,fill=MUTED)

for by,bh,title,sub,chips,wide in lay:
    o.append(f'<rect x="{LX}" y="{by}" width="{BW}" height="{bh}" rx="9" fill="{BAND}" stroke="{LINE}"/>')
    t(LX+10,by+17,title,size=11,weight='600')
    t(LX+10+len(title)*6.9+10,by+17,sub,size=10,fill=MUTED)
    for row,col,layer,name in chips:
        cx = LX+10 if wide else COL[col]
        cw = BW-20 if wide else CW
        cy = by+26+row*(CH+10)
        strong = name=='game/commands'
        o.append(f'<rect x="{cx}" y="{cy}" width="{cw}" height="{CH}" rx="6" fill="{CHIP}" '
                 f'stroke="{TEXT if strong else LINE}" stroke-width="{1.4 if strong else 1}"/>')
        o.append(f'<circle cx="{cx+18}" cy="{cy+17}" r="10" fill="none" stroke="{MUTED}" stroke-width="1"/>')
        t(cx+18,cy+20.5,str(layer),size=10,fill=MUTED,anchor='middle')
        t(cx+36,cy+21.5,name,size=11,font=MONO,weight='600' if strong else None)
        t(cx+cw-9,cy+21.5,str(lines(name)),size=9.5,fill=MUTED,anchor='end')

# the events module as the hub in the channel
o.append(f'<rect x="{KX0}" y="{EY}" width="{KX1-KX0}" height="70" rx="9" fill="{BAND}" '
         f'stroke="{ACCENT}" stroke-width="1.4"/>')
o.append(f'<circle cx="{KX0+20}" cy="{EY+19}" r="10" fill="none" stroke="{ACCENT}" stroke-width="1"/>')
t(KX0+20,EY+22.5,'0',size=10,fill=ACCENT,anchor='middle')
t(KX0+38,EY+23,'js/events.js',size=11,font=MONO,fill=ACCENT,weight='600')
t(KX0+12,EY+42,'onChange(fn) · onTick(fn)',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,EY+57,'changed() · tick()',size=9.5,font=MONO,fill=MUTED)

# the way down: reporting. The stub hangs off the band, several modules report in each.
PANELS,CANVAS,COMMANDS = lay[1],lay[2],lay[3]
stubs=[(PANELS[0]+PANELS[1]-14,'panels · menu · display'),
       (CANVAS[0]+CANVAS[1]-14,'view · gl'),
       (COMMANDS[0]+COMMANDS[1]//2,f'commands, {REPORTS}×')]
for y,who in stubs:
    o.append(f'<path d="M{RX},{y} H{TRUNK_UP}" stroke="{ACCENT}" stroke-width="1.4" fill="none"/>')
    o.append(f'<circle cx="{RX}" cy="{y}" r="2.6" fill="{ACCENT}"/>')
    t(TRUNK_UP+9,y+3.5,who,size=9,fill=MUTED)
o.append(f'<line x1="{TRUNK_UP}" y1="{stubs[0][0]}" x2="{TRUNK_UP}" y2="{EY}" stroke="{ACCENT}" '
         f'stroke-width="1.4" marker-end="url(#ara)"/>')
ML=(stubs[2][0]+EY)//2
t(TRUNK_UP+9,ML,'reports',size=10.5,fill=ACCENT,weight='600')
t(TRUNK_UP+9,ML+15,'changed()',size=9.5,font=MONO,fill=MUTED)
t(TRUNK_UP+9,ML+28,'tick()',size=9.5,font=MONO,fill=MUTED)

# the way back: calls the subscribed functions
DISP=PANELS[0]+26+17               # ui/display, first row of the panels band
DRAW=CANVAS[0]+26+(CH+10)+17       # map/draw, second row of the canvas band
TA=KX1-32
o.append(f'<path d="M{TA},{EY} V{DISP}" stroke="{ACCENT}" stroke-width="1.4" fill="none" stroke-dasharray="6 4"/>')
for yy in (DISP,DRAW):
    o.append(f'<path d="M{TA},{yy} H{RX-6}" stroke="{ACCENT}" stroke-width="1.4" fill="none" '
             f'stroke-dasharray="6 4" marker-end="url(#ara)"/>')
RL=EY-70
t(TA-12,RL,'calls',size=10.5,fill=ACCENT,weight='600',anchor='end')
t(TA-12,RL+15,'render() · header()',size=9.5,font=MONO,fill=MUTED,anchor='end')
t(TA-12,RL+28,'speedHint() · draw()',size=9.5,font=MONO,fill=MUTED,anchor='end')

# note at the top of the channel: who subscribes
WIRE=lay[0]
o.append(f'<rect x="{KX0}" y="{WIRE[0]}" width="{KX1-KX0}" height="{WIRE[1]}" rx="9" fill="none" '
         f'stroke="{LINE}" stroke-dasharray="3 3"/>')
t(KX0+12,WIRE[0]+18,'Only start.js subscribes:',size=10,weight='600')
t(KX0+12,WIRE[0]+33,'onChange → render + save',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,WIRE[0]+47,'onTick → header + speedHint',size=9.5,font=MONO,fill=MUTED)
t(KX0+12,WIRE[0]+60,'         + draw',size=9.5,font=MONO,fill=MUTED)
o.append(f'<path d="M{RX-6},{WIRE[0]+WIRE[1]//2} H{KX0}" stroke="{MUTED}" stroke-width="1.2" fill="none" '
         f'stroke-dasharray="2 3" marker-end="url(#ar)"/>')

# legend
LY=END+40
o.append(f'<line x1="30" y1="{LY}" x2="70" y2="{LY}" stroke="{MUTED}" stroke-width="1.6" marker-end="url(#ar)"/>')
t(78,LY+4,'imports (downwards only)',size=10,fill=MUTED)
o.append(f'<line x1="290" y1="{LY}" x2="330" y2="{LY}" stroke="{ACCENT}" stroke-width="1.6" marker-end="url(#ara)"/>')
t(338,LY+4,'reports a signal',size=10,fill=MUTED)
o.append(f'<line x1="500" y1="{LY}" x2="540" y2="{LY}" stroke="{ACCENT}" stroke-width="1.6" '
         f'stroke-dasharray="6 4" marker-end="url(#ara)"/>')
t(548,LY+4,'calls the subscribed function',size=10,fill=MUTED)
t(1004,LY+4,'no import points upwards',size=10,weight='600',anchor='end')

o.append('</svg>')
open('docs/components.svg','w',encoding='utf-8').write('\n'.join(o)+'\n')
print('written')
