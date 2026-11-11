# Draws the app icon as PNGs with no dependencies. Usage: python3 tools/make-icons.py
import zlib, struct, os
BG=(37,99,235); BOARD=(255,255,255); THIN=(203,213,225); THICK=(30,41,59); ACC=(191,219,254)
def icon(n):
    px=[[BG]*n for _ in range(n)]
    m=int(n*0.2); s=n-2*m; cell=s/9   # board in the maskable safe zone
    marked={(0,0),(1,4),(2,8),(4,2),(4,6),(6,1),(7,5),(8,8),(3,3),(5,5)}
    for y in range(m,m+s):
        for x in range(m,m+s):
            cx=int((x-m)/cell); cy=int((y-m)/cell)
            px[y][x]=ACC if (cy,cx) in marked else BOARD
    def line(pos,w,col,vertical):
        for t in range(-(w//2), w-w//2):
            p=int(pos)+t
            for q in range(m,m+s):
                if vertical: px[q][min(max(p,m),m+s-1)]=col
                else: px[min(max(p,m),m+s-1)][q]=col
    tw=max(1,n//160); bw=max(2,n//60)
    for k in range(10):
        pos=m+k*cell
        if k%3: line(pos,tw,THIN,True); line(pos,tw,THIN,False)
    for k in range(0,10,3):
        pos=m+k*cell
        line(pos,bw,THICK,True); line(pos,bw,THICK,False)
    raw=b''.join(b'\x00'+bytes(c for p in row for c in p) for row in px)
    chunk=lambda t,d: struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',n,n,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw,9))+chunk(b'IEND',b'')
here=os.path.join(os.path.dirname(__file__),'..','icons')
for n,name in [(192,'icon-192.png'),(512,'icon-512.png'),(180,'apple-touch-icon.png'),(32,'favicon-32.png')]:
    open(os.path.join(here,name),'wb').write(icon(n))
print('ok')
