#!/usr/bin/env python3
"""Image de contrôle de la carte (V13 : anneau maritime). Usage : python3 tools/carte/controle.py
Produit tools/carte/controle-carte.png : provinces aux couleurs des nations, 10 sites de port, 5 routes."""
import json, os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, 'arken-v9-carte.json'), encoding='utf-8'))
base = Image.open(os.path.join(HERE, '..', '..', 'assets', 'carte-leonardo.jpg')).convert('RGBA')
color = {n['id']: n['color'] for n in data['nations']}
rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
by = {p['id']: p for p in data['provinces']}


def font(size):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


ov = Image.new('RGBA', base.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
for p in data['provinces']:
    d.polygon([tuple(q) for q in p['polygon']], fill=rgb(color[p['nation']]) + (90,), outline=(255, 255, 255, 220))
img = Image.alpha_composite(base, ov)
d = ImageDraw.Draw(img)
F, FS = font(26), font(18)
for r in data['seaRoutes']:
    pts = [tuple(by[r['from']]['port']['anchor'])] + [tuple(w) for w in r['waypoints']] + [tuple(by[r['to']]['port']['anchor'])]
    d.line(pts, fill=(4, 19, 29, 255), width=14)
    d.line(pts, fill=(242, 251, 255, 255), width=6)
for p in data['provinces']:
    x, y = p['center']
    d.text((x, y), f"{p['name']}\n{p['id']}", font=F, fill='white', anchor='mm', align='center', stroke_width=3, stroke_fill='black')
    if p['port']:
        ax, ay = p['port']['anchor']
        d.ellipse([ax - 16, ay - 16, ax + 16, ay + 16], fill=rgb(color[p['nation']]) + (255,), outline=(7, 23, 34, 255), width=4)
        d.text((ax, ay - 26), p['id'], font=FS, fill='white', anchor='mm', stroke_width=3, stroke_fill='black')
W = base.size[0]
band = Image.new('RGBA', (W, 90), (13, 27, 42, 255))
bd = ImageDraw.Draw(band)
bd.text((W // 2, 30), 'FRONTIÈRES : ARKEN — anneau maritime V13 (5 routes, 10 points de port)', font=F, fill='white', anchor='mm')
bd.text((W // 2, 66), 'Routes : ' + ', '.join(f"{r['from']}↔{r['to']} ({r['length']} px)" for r in data['seaRoutes']), font=FS, fill=(200, 210, 220), anchor='mm')
out = Image.new('RGBA', (W, base.size[1] + 90))
out.paste(band, (0, 0))
out.paste(img, (0, 90))
out.convert('RGB').resize((W * 2 // 3, (base.size[1] + 90) * 2 // 3)).save(os.path.join(HERE, 'controle-carte.png'), optimize=True)
print('tools/carte/controle-carte.png')
