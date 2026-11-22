#!/usr/bin/env python3
"""V17.11 — routes maritimes en anneau + étoile vers l'île mystérieuse (schéma de Jack du 22/11/2026).

Usage : python3 tools/carte/anneau-v17-11.py   (puis : node tools/carte/generer-module.mjs)

Entrées (jamais modifiées) :
  - assets/carte-leonardo.jpg et tools/carte/arken-v9-carte.json : la carte Leonardo de référence (V9 → V16.2) ;
  - tools/carte/anneau-v17-11-disposition.json : la disposition retenue (échelle S, centre de l'île mystérieuse « hub »,
    centre de chaque nation, point de port de chacune des 10 provinces portuaires).
Sorties :
  - assets/carte-arken-v17-11.jpg : même dessin Leonardo, îles ESPACÉES en couronne autour de l'île mystérieuse
    (chaque île découpée avec son liseré d'eau claire, réduite à l'échelle S, déplacée sans rotation ; mer de fond
    reconstituée ; îlots décoratifs retirés) ;
  - tools/carte/arken-v17-11-carte.json : même schéma que arken-v9-carte.json, coordonnées transformées, 15 routes droites
    (5 de l'anneau, port à port entre nations voisines ; 10 du port vers l'île mystérieuse, toutes de longueur Rs).
Identifiants inchangés (p01…p21, nations), voisinages inchangés. Le moteur ne lit que les identifiants et les routes.
"""
import json, os, math
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
SRC = json.load(open(os.path.join(HERE, 'arken-v9-carte.json'), encoding='utf-8'))
LAY = json.load(open(os.path.join(HERE, 'anneau-v17-11-disposition.json'), encoding='utf-8'))
img = cv2.imread(os.path.join(ROOT, 'assets', 'carte-leonardo.jpg'))
W, H = SRC['imageSize']
S = float(LAY['S'])
HUB = np.array(LAY['hub'], float)
by = {p['id']: p for p in SRC['provinces']}
RING = ['valmorne', 'oroel', 'noireflamme', 'aurel', 'roc-epine']
RING_ROUTES = [('p03', 'p14'), ('p13', 'p09'), ('p11', 'p19'), ('p17', 'p07'), ('p05', 'p02')]
PORTS = ['p02', 'p03', 'p05', 'p07', 'p09', 'p11', 'p13', 'p14', 'p17', 'p19']

# --- transformation de chaque île : nouveau = (ancien − centre d'origine) × S + nouveau centre --------------------------
islands = {i['id']: i for i in SRC['islands']}
tfm = {}
for i in SRC['islands']:
    if i['nation']:
        c0 = np.array([q for pid in i['provinces'] for q in by[pid]['polygon']], float).mean(0)
        tfm[i['id']] = (c0, np.array(LAY['centres'][i['nation']], float))
    else:  # île mystérieuse : son centre (repère des troupes) tombe sur le hub
        tfm[i['id']] = (np.array(by['p21']['center'], float), HUB)
T = lambda isl, pts: (np.asarray(pts, float) - tfm[isl][0]) * S + tfm[isl][1]

# --- masques terre / mer de la carte d'origine (même règle HSV que decouper.py / verifier.py) --------------------------
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
sea = (hsv[:, :, 0] >= 80) & (hsv[:, :, 0] <= 125) & (hsv[:, :, 1] > 70)
land = cv2.morphologyEx((~sea).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
_, comp = cv2.connectedComponents(land)
land_of = {}
for iid, i in islands.items():
    poly = np.zeros((H, W), np.uint8)
    for pid in i['provinces']:
        cv2.fillPoly(poly, [np.array(by[pid]['polygon'], np.int32)], 1)
    ids, counts = np.unique(comp[poly > 0], return_counts=True)
    keep = [k for k, n in zip(ids, counts) if k and n > 200]
    land_of[iid] = (np.isin(comp, keep) | (poly > 0)).astype(np.uint8)

# --- mer de fond : la mer d'origine sans aucune terre (ni liseré, ni îlot), reconstituée par diffusion ----------------
all_land = cv2.dilate(land, np.ones((3, 3), np.uint8))
fill = cv2.dilate(all_land, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (121, 121)))
q = 4
small = cv2.resize(img, (W // q, H // q), interpolation=cv2.INTER_AREA)
fsmall = cv2.resize(fill, (W // q, H // q), interpolation=cv2.INTER_NEAREST)
bg = cv2.inpaint(small, fsmall, 12, cv2.INPAINT_TELEA)
bg = cv2.GaussianBlur(bg, (0, 0), 6)
bg = cv2.resize(bg, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
rng = np.random.default_rng(1711)  # grain de la mer peinte (stable : même image à chaque génération)
grain = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 1.4) * 5.5
bg += grain[:, :, None]
out = bg

# --- collage des îles : île + liseré d'eau claire, fondu vers la mer de fond ------------------------------------------
HALO_IN, HALO_OUT = 22, 52  # en pixels de la carte d'origine
order = ['ile-mysterieuse'] + [i['id'] for i in SRC['islands'] if i['nation']]
for iid in order:
    own = land_of[iid]
    others = np.zeros_like(own)
    for jid in islands:
        if jid != iid:
            others |= land_of[jid]
    d_own = cv2.distanceTransform((1 - own).astype(np.uint8), cv2.DIST_L2, 5)
    d_oth = cv2.distanceTransform((1 - others).astype(np.uint8), cv2.DIST_L2, 5)
    alpha = np.clip((HALO_OUT - d_own) / (HALO_OUT - HALO_IN), 0, 1)
    alpha[d_oth < d_own] = 0              # le liseré d'une voisine reste à la voisine
    alpha[(d_oth < 3) & (own == 0)] = 0
    alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 2)
    alpha[own > 0] = 1
    c0, c1 = tfm[iid]
    M = np.float32([[S, 0, c1[0] - S * c0[0]], [0, S, c1[1] - S * c0[1]]])
    patch = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT).astype(np.float32)
    a = cv2.warpAffine(alpha, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)[:, :, None]
    out = out * (1 - a) + patch * a
out_img = np.clip(out, 0, 255).astype(np.uint8)
cv2.imwrite(os.path.join(ROOT, 'assets', 'carte-arken-v17-11.jpg'), out_img, [cv2.IMWRITE_JPEG_QUALITY, 86])

# --- données de carte transformées --------------------------------------------------------------------------------------
def area(poly):
    a = np.array(poly, float)
    return int(round(0.5 * abs(np.dot(a[:, 0], np.roll(a[:, 1], -1)) - np.dot(a[:, 1], np.roll(a[:, 0], -1)))))

def clean(poly):
    outp = []
    for pt in poly:
        if not outp or outp[-1] != pt:
            outp.append(pt)
    if len(outp) > 1 and outp[0] == outp[-1]:
        outp.pop()
    return outp

data = json.loads(json.dumps(SRC))
data['schema'] = 'arken-v9-carte/1'
data['source'] = 'assets/carte-arken-v17-11.jpg'
data['derivedFrom'] = 'assets/carte-leonardo.jpg (V17.11 : îles espacées, échelle %s)' % S
for p in data['provinces']:
    iid = p['island']
    p['polygon'] = clean([[int(round(x)), int(round(y))] for x, y in T(iid, p['polygon'])])
    p['center'] = [int(round(v)) for v in T(iid, [p['center']])[0]]
    p['area'] = area(p['polygon'])
    if p['id'] in LAY['ports']:
        p['port'] = {'anchor': [int(v) for v in LAY['ports'][p['id']]]}
    elif p['id'] == 'p21':
        p['port'] = {'anchor': [int(round(v)) for v in HUB]}  # les 10 routes arrivent au centre de l'île
    else:
        p['port'] = None
    p['paintedCells'] = []
for i in data['islands']:
    i['area'] = sum(by2['area'] for by2 in data['provinces'] if by2['island'] == i['id'])
pb = {p['id']: p for p in data['provinces']}
length = lambda a, b: int(round(math.dist(pb[a]['port']['anchor'], pb[b]['port']['anchor'])))
routes = [{'from': a, 'to': b, 'islands': [pb[a]['island'], pb[b]['island']], 'waypoints': [], 'length': length(a, b), 'kind': 'ring'}
          for a, b in RING_ROUTES]
routes += [{'from': pid, 'to': 'p21', 'islands': [pb[pid]['island'], 'ile-mysterieuse'], 'waypoints': [], 'length': length(pid, 'p21'),
            'kind': 'island'} for pid in PORTS]
data['seaRoutes'] = routes
json.dump(data, open(os.path.join(HERE, 'arken-v17-11-carte.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('anneau :', ', '.join(f"{r['from']}-{r['to']} {r['length']} px" for r in routes[:5]))
print('île    :', ', '.join(f"{r['from']} {r['length']} px" for r in routes[5:]))
