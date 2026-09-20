import re, json, sys, numpy as np
from PIL import Image
import os
PAL=Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','art','textures','palet_4x4.png')).convert('RGB')
def pal(u,v):
    x=min(3,max(0,int(u*4))); y=min(3,max(0,int(v*4))); return x+4*y
def arrs(txt):
    # extract Vector3Array/Vector2Array/IntArray/FloatArray/null in order
    out=[]
    for m in re.finditer(r'(Vector3Array|Vector2Array|IntArray|FloatArray|ColorArray)\(([^)]*)\)|null',txt):
        if m.group(0)=='null': out.append(None); continue
        out.append((m.group(1),np.array([float(x) for x in m.group(2).split(',') if x.strip()])))
    return out
def parse(path):
    s=open(path).read()
    meshes={}
    for m in re.finditer(r'\[sub_resource id=(\d+) type="ArrayMesh"\](.*?)(?=\n\[)',s,re.S):
        sid=int(m.group(1)); surfs=[]
        for sm in re.finditer(r'"arrays":\[(.*?)\],\s*"morph_arrays"',m.group(2),re.S):
            a=arrs(sm.group(1))
            V=a[0][1].reshape(-1,3); UV=a[4][1].reshape(-1,2) if a[4] else None
            I=a[8][1].astype(int).reshape(-1,3) if a[8] else np.arange(len(V)).reshape(-1,3)
            surfs.append((V,UV,I))
        meshes[sid]=surfs
    nodes=[]
    for m in re.finditer(r'\[node name="([^"]+)" type="MeshInstance" parent="([^"]*)"\]\s*(.*?)(?=\n\[|\Z)',s,re.S):
        body=m.group(3); ms=re.search(r'mesh = SubResource\((\d+)\)',body); tr=re.search(r'transform = Transform\(([^)]*)\)',body)
        vis=re.search(r'visible = (\w+)',body)
        if not ms: continue
        t=[float(x) for x in tr.group(1).split(',')] if tr else [1,0,0,0,1,0,0,0,1,0,0,0]
        nodes.append((m.group(1),m.group(2),int(ms.group(1)),t, not vis or vis.group(1)=='true'))
    return meshes,nodes
def build(path):
    meshes,nodes=parse(path); P=[];F=[];parts=[]
    for name,parent,sid,t,vis in nodes:
        if parent not in ('.',''): pass  # nested transforms rare; handled approx
        B=np.array(t[:9]).reshape(3,3)  # Godot Basis rows
        o=np.array(t[9:])
        for V,UV,I in meshes[sid]:
            W=V@B.T+o
            base=len(P); P.extend(W.tolist())
            for tri in I:
                c=pal(*UV[tri[0]]) if UV is not None else 6
                F.append([base+tri[0],base+tri[1],base+tri[2],c])
        parts.append(name)
    return np.array(P),F,parts
if __name__=='__main__':
    P,F,parts=build(sys.argv[1]); print(len(P),len(F),parts[:20],P.min(0),P.max(0))
