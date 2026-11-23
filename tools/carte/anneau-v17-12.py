#!/usr/bin/env python3
"""V17.12 — îles espacées (retour de bêta de Jack du 23/11/2026 : « une espèce de grosse tache » au zoom minimal).

Usage : python3 tools/carte/anneau-v17-12.py   (puis : node tools/carte/generer-module.mjs)

UNIQUEMENT VISUEL : chaque île de la V17.11 est DÉPLACÉE (translation entière, sans rotation, sans changement de taille :
même échelle 0,75 du dessin Leonardo) pour écarter les îles ; les ancres de port glissent le long de la côte de LEUR
province (mêmes provinces portuaires). Aucune durée ne dépend de la géométrie (routes à durée égale par type,
`map.equalSeaRoutes`) ; les marches à terre ne lisent que des distances À L'INTÉRIEUR d'une île, inchangées au pixel près
puisque les coordonnées entières de la V17.11 sont décalées d'un vecteur entier.

Entrées (jamais modifiées) :
  - assets/carte-leonardo.jpg et tools/carte/arken-v9-carte.json : la carte Leonardo de référence ;
  - tools/carte/arken-v17-11-carte.json et tools/carte/anneau-v17-11-disposition.json : la carte V17.11 (coordonnées
    entières, centres des nations) ;
  - tools/carte/anneau-v17-12-disposition.json : cadre (largeur × hauteur), décalage entier de chaque île par rapport à
    la V17.11 (cadrage compris), centre de l'île mystérieuse (hub), ancre de chacun des 10 ports (à Rs du hub).
Sorties :
  - assets/carte-arken-v17-12.jpg : même dessin, îles écartées, mer de fond reconstituée et étirée au nouveau cadre ;
  - tools/carte/arken-v17-12-carte.json : même schéma que arken-v17-11-carte.json, coordonnées décalées, 15 routes droites.
"""
import json, os, math
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
SRC = json.load(open(os.path.join(HERE, 'arken-v9-carte.json'), encoding='utf-8'))
V11 = json.load(open(os.path.join(HERE, 'arken-v17-11-carte.json'), encoding='utf-8'))
LAY11 = json.load(open(os.path.join(HERE, 'anneau-v17-11-disposition.json'), encoding='utf-8'))
LAY = json.load(open(os.path.join(HERE, 'anneau-v17-12-disposition.json'), encoding='utf-8'))
img = cv2.imread(os.path.join(ROOT, 'assets', 'carte-leonardo.jpg'))
W0, H0 = SRC['imageSize']
W, H = LAY['frame']
S = float(LAY11['S'])
assert S == float(LAY['S']), 'V17.12 : même échelle que la V17.11 (taille des îles inchangée)'
HUB11 = np.array(LAY11['hub'], float)
by = {p['id']: p for p in SRC['provinces']}
islands = {i['id']: i for i in SRC['islands']}
RING_ROUTES = [('p03', 'p14'), ('p13', 'p09'), ('p11', 'p19'), ('p17', 'p07'), ('p05', 'p02')]
PORTS = ['p02', 'p03', 'p05', 'p07', 'p09', 'p11', 'p13', 'p14', 'p17', 'p19']
key = lambda i: i['nation'] or i['id']                       # décalages : par nation, ou 'ile-mysterieuse'
OFF = {i['id']: np.array(LAY['offsets'][key(i)], int) for i in SRC['islands']}

# --- transformation de chaque île (image) : celle de la V17.11, puis le décalage entier ---------------------------------
tfm = {}
for i in SRC['islands']:
    if i['nation']:
        c0 = np.array([q for pid in i['provinces'] for q in by[pid]['polygon']], float).mean(0)
        c1 = np.array(LAY11['centres'][i['nation']], float)
    else:
        c0, c1 = np.array(by['p21']['center'], float), HUB11
    tfm[i['id']] = (c0, c1 + OFF[i['id']])
assert list(np.array(LAY['hub'])) == list((HUB11 + OFF['ile-mysterieuse']).astype(int)), 'hub = île mystérieuse décalée'

# --- masques terre / mer de la carte d'origine (même règle que anneau-v17-11.py) ----------------------------------------
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
sea = (hsv[:, :, 0] >= 80) & (hsv[:, :, 0] <= 125) & (hsv[:, :, 1] > 70)
land = cv2.morphologyEx((~sea).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
_, comp = cv2.connectedComponents(land)
land_of = {}
for iid, i in islands.items():
    poly = np.zeros((H0, W0), np.uint8)
    for pid in i['provinces']:
        cv2.fillPoly(poly, [np.array(by[pid]['polygon'], np.int32)], 1)
    ids, counts = np.unique(comp[poly > 0], return_counts=True)
    keep = [k for k, n in zip(ids, counts) if k and n > 200]
    land_of[iid] = (np.isin(comp, keep) | (poly > 0)).astype(np.uint8)

# --- mer de fond : celle de la V17.11 (mer d'origine sans terre, reconstituée), étirée au nouveau cadre ------------------
all_land = cv2.dilate(land, np.ones((3, 3), np.uint8))
fill = cv2.dilate(all_land, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (121, 121)))
q = 4
small = cv2.resize(img, (W0 // q, H0 // q), interpolation=cv2.INTER_AREA)
fsmall = cv2.resize(fill, (W0 // q, H0 // q), interpolation=cv2.INTER_NEAREST)
bg = cv2.inpaint(small, fsmall, 12, cv2.INPAINT_TELEA)
bg = cv2.GaussianBlur(bg, (0, 0), 6)
bg = cv2.resize(bg, (W, H), interpolation=cv2.INTER_CUBIC).astype(np.float32)
rng = np.random.default_rng(1712)  # grain de la mer peinte (stable : même image à chaque génération)
grain = cv2.GaussianBlur(rng.normal(0, 1, (H, W)).astype(np.float32), (0, 0), 1.4) * 5.5
bg += grain[:, :, None]
out = bg

# --- collage des îles : île + liseré d'eau claire, fondu vers la mer de fond (comme la V17.11) ---------------------------
HALO_IN, HALO_OUT = 22, 52
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
    alpha[d_oth < d_own] = 0
    alpha[(d_oth < 3) & (own == 0)] = 0
    alpha = cv2.GaussianBlur(alpha.astype(np.float32), (0, 0), 2)
    alpha[own > 0] = 1
    c0, c1 = tfm[iid]
    M = np.float32([[S, 0, c1[0] - S * c0[0]], [0, S, c1[1] - S * c0[1]]])
    patch = cv2.warpAffine(img, M, (W, H), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_CONSTANT).astype(np.float32)
    a = cv2.warpAffine(alpha, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)[:, :, None]
    out = out * (1 - a) + patch * a
out_img = np.clip(out, 0, 255).astype(np.uint8)
cv2.imwrite(os.path.join(ROOT, 'assets', 'carte-arken-v17-12.jpg'), out_img, [cv2.IMWRITE_JPEG_QUALITY, 84])

# --- données : coordonnées ENTIÈRES de la V17.11 + décalage entier de l'île (distances internes identiques) --------------
data = json.loads(json.dumps(V11))
data['source'] = 'assets/carte-arken-v17-12.jpg'
data['imageSize'] = [W, H]
data['derivedFrom'] = 'assets/carte-leonardo.jpg (V17.12 : îles de la V17.11 écartées, échelle %s, sans rotation)' % S
for p in data['provinces']:
    dx, dy = (int(v) for v in OFF[p['island']])
    p['polygon'] = [[x + dx, y + dy] for x, y in p['polygon']]
    p['center'] = [p['center'][0] + dx, p['center'][1] + dy]
    if p['id'] in LAY['ports']:
        p['port'] = {'anchor': [int(v) for v in LAY['ports'][p['id']]]}
    elif p['id'] == 'p21':
        p['port'] = {'anchor': [int(v) for v in LAY['hub']]}
    else:
        p['port'] = None
pb = {p['id']: p for p in data['provinces']}
length = lambda a, b: int(round(math.dist(pb[a]['port']['anchor'], pb[b]['port']['anchor'])))
routes = [{'from': a, 'to': b, 'islands': [pb[a]['island'], pb[b]['island']], 'waypoints': [], 'length': length(a, b), 'kind': 'ring'}
          for a, b in RING_ROUTES]
routes += [{'from': pid, 'to': 'p21', 'islands': [pb[pid]['island'], 'ile-mysterieuse'], 'waypoints': [], 'length': length(pid, 'p21'),
            'kind': 'island'} for pid in PORTS]
data['seaRoutes'] = routes
json.dump(data, open(os.path.join(HERE, 'arken-v17-12-carte.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('cadre  :', W, '×', H)
print('anneau :', ', '.join(f"{r['from']}-{r['to']} {r['length']} px" for r in routes[:5]))
print('île    :', ', '.join(f"{r['from']} {r['length']} px" for r in routes[5:]))
