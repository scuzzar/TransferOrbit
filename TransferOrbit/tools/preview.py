import sys, numpy as np, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
from escn2json import build, PAL
def render(P,F,out,views=((20,30),(20,120),(80,0))):
    cols=[np.array(PAL.getpixel((c%4,c//4)))/255 for c in range(16)]
    fig=plt.figure(figsize=(12,4),facecolor='#111')
    for k,(el,az) in enumerate(views):
        ax=fig.add_subplot(1,3,k+1,projection='3d'); ax.set_facecolor('#111')
        tris=[[P[f[0]][[0,2,1]],P[f[1]][[0,2,1]],P[f[2]][[0,2,1]]] for f in F]
        L=np.array([.4,.3,.85]); L/=np.linalg.norm(L); fc=[]
        for t,f in zip(tris,F):
            n=np.cross(t[1]-t[0],t[2]-t[0]); nn=np.linalg.norm(n); s=abs(n@L)/nn if nn else .5
            fc.append(np.clip(cols[f[3]]*(.35+.65*s),0,1))
        pc=Poly3DCollection(tris,facecolors=fc,edgecolors='none'); ax.add_collection3d(pc)
        mn,mx=P.min(0)[[0,2,1]],P.max(0)[[0,2,1]]; c=(mn+mx)/2; r=(mx-mn).max()/2
        ax.set_xlim(c[0]-r,c[0]+r); ax.set_ylim(c[1]-r,c[1]+r); ax.set_zlim(c[2]-r,c[2]+r); ax.view_init(el,az); ax.axis('off')
    plt.savefig(out,dpi=70,bbox_inches='tight',facecolor='#111')
if __name__=='__main__':
    P,F,_=build(sys.argv[1]); render(P,F,sys.argv[2])
