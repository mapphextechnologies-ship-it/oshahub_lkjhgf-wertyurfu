from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)


def make_icon(size):
    scale = 4
    n = size * scale
    im = Image.new("RGBA", (n, n), (11, 23, 48, 255))
    d = ImageDraw.Draw(im)
    inset = int(n * .07)
    d.rounded_rectangle((inset, inset, n-inset, n-inset), radius=int(n*.22), fill=(11,23,48,255))
    # Water drop mark
    cx, cy = int(n*.74), int(n*.27)
    d.ellipse((cx-int(n*.043),cy-int(n*.055),cx+int(n*.043),cy+int(n*.055)), fill=(75,178,255,255))
    d.polygon([(cx,cy-int(n*.13)),(cx-int(n*.06),cy+int(n*.01)),(cx+int(n*.06),cy+int(n*.01))], fill=(75,178,255,255))
    # Windshield and body, front facing
    x1,x2=int(n*.21),int(n*.79)
    d.rounded_rectangle((int(n*.31),int(n*.38),int(n*.69),int(n*.61)),radius=int(n*.13),fill=(25,65,111,255),outline=(234,245,255,255),width=max(3,int(n*.018)))
    d.rounded_rectangle((x1,int(n*.53),x2,int(n*.70)),radius=int(n*.11),fill=(239,247,255,255),outline=(210,228,247,255),width=max(3,int(n*.013)))
    d.rounded_rectangle((int(n*.17),int(n*.59),int(n*.83),int(n*.70)),radius=int(n*.06),fill=(10,124,255,255))
    # Windscreen highlight and grille
    d.rounded_rectangle((int(n*.36),int(n*.42),int(n*.64),int(n*.54)),radius=int(n*.06),fill=(102,180,255,255))
    d.rounded_rectangle((int(n*.43),int(n*.61),int(n*.57),int(n*.66)),radius=int(n*.018),fill=(44,75,111,255))
    # Wheels
    for x in (.30,.70):
        cx=int(n*x); cy=int(n*.70); r=int(n*.065)
        d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(9,17,29,255),outline=(255,255,255,255),width=max(3,int(n*.014)))
    # Headlights
    for x in (.24,.76):
        cx=int(n*x); cy=int(n*.60); r=int(n*.026)
        d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=(173,221,255,255))
    return im.resize((size,size),Image.Resampling.LANCZOS)


for filename, size in [("favicon-32.png",32),("apple-touch-icon.png",180),("icon-192.png",192),("icon-512.png",512)]:
    make_icon(size).save(OUT / filename, optimize=True)
