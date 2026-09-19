import numpy as np
def weld(P,F,eps=1e-4):
    q=np.round(np.asarray(P)/eps).astype(np.int64); _,idx,inv=np.unique(q,axis=0,return_index=True,return_inverse=True)
    inv=inv.ravel(); P2=np.asarray(P)[idx]; F2=[[inv[a],inv[b],inv[c],col] for a,b,c,col in F]; return P2,F2
def cluster(P,F,cell):
    P=np.asarray(P); key=np.floor(P/cell).astype(np.int64)
    # per color group so colors stay separate
    out_P=[]; out_F=[]; mp={}
    def vid(i,col):
        k=(tuple(key[i]),col)
        if k not in mp: mp[k]=[len(out_P),[]]; out_P.append(None)
        mp[k][1].append(i); return mp[k][0]
    for a,b,c,col in F:
        A,B,C=vid(a,col),vid(b,col),vid(c,col)
        if A!=B and B!=C and A!=C: out_F.append((A,B,C,col))
    for k,(j,lst) in mp.items(): out_P[j]=P[lst].mean(0)
    # remove duplicate faces
    seen=set(); F2=[]
    for f in out_F:
        s=(tuple(sorted(f[:3])),f[3])
        if s in seen: continue
        seen.add(s); F2.append(f)
    return np.array(out_P),F2
