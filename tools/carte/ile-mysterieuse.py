#!/usr/bin/env python3
"""V16.2 — ajoute l'île mystérieuse (p21) à arken-v9-carte.json. Usage : python3 tools/carte/ile-mysterieuse.py
Idempotent : remplace p21 et ses routes s'ils existent déjà. À relancer après decouper.py (qui ne connaît que p01…p20).

- Contour : la petite île rocheuse au centre de la carte Leonardo (composante de terre autour de (685, 726),
  masque terre/mer HSV de decouper.py, contour simplifié à 2,5 px). Pas de nouveau dessin.
- Une seule province, neutre (nation: null), un seul point de port à l'est de l'île (745, 760).
- 5 routes : depuis le point de port de chaque nation le plus proche de l'île (p03, p07, p11, p13, p17) ; un
  point de passage contourne les îlots entre Oroël et l'île. Durée en jeu : RULES.mysteryIsland.routeTurns.
"""
import json, os
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
PATH = os.path.join(HERE, 'arken-v9-carte.json')
data = json.load(open(PATH, encoding='utf-8'))
img = cv2.imread(os.path.join(HERE, '..', '..', 'assets', 'carte-leonardo.jpg'))
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
sea = (hsv[:, :, 0] >= 80) & (hsv[:, :, 0] <= 125) & (hsv[:, :, 1] > 70)
land = cv2.morphologyEx((~sea).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
_, comp, _, _ = cv2.connectedComponentsWithStats(land)
mask = cv2.morphologyEx((comp == comp[726, 685]).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
poly = [[int(p[0][0]), int(p[0][1])] for p in cv2.approxPolyDP(max(contours, key=cv2.contourArea), 2.5, True)]
a = np.array(poly, float)
area = int(round(0.5 * abs(np.dot(a[:, 0], np.roll(a[:, 1], -1)) - np.dot(a[:, 1], np.roll(a[:, 0], -1)))))
ANCHOR = [745, 760]
p21 = {'id': 'p21', 'name': 'Île mystérieuse', 'nation': None, 'biome': 'mountain', 'paintedBiome': 'mountain', 'paintedShare': {},
       'island': 'ile-mysterieuse', 'polygon': poly, 'center': [688, 726], 'area': area, 'landNeighbors': [], 'coastal': True,
       'port': {'anchor': ANCHOR}, 'paintedCells': [], 'neutral': True}
WAYPOINTS = {'p13': [[908, 556]]}
ports = {p['id']: p['port']['anchor'] for p in data['provinces'] if p.get('port')}
by = {p['id']: p for p in data['provinces']}
routes = []
for pid in ('p03', 'p07', 'p11', 'p13', 'p17'):
    pts = [ports[pid]] + WAYPOINTS.get(pid, []) + [ANCHOR]
    length = round(sum(float(np.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1])) for k in range(len(pts) - 1)))
    routes.append({'from': pid, 'to': 'p21', 'islands': [by[pid]['island'], 'ile-mysterieuse'], 'waypoints': WAYPOINTS.get(pid, []), 'length': length})
data['provinces'] = [p for p in data['provinces'] if p['id'] != 'p21'] + [p21]
data['islands'] = [i for i in data['islands'] if i['id'] != 'ile-mysterieuse'] + [{'id': 'ile-mysterieuse', 'nation': None, 'area': area, 'paintedCells': 0, 'colorShare': {}, 'provinces': ['p21']}]
data['seaRoutes'] = [r for r in data['seaRoutes'] if r['to'] != 'p21' and r['from'] != 'p21'] + routes
json.dump(data, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'p21 : {len(poly)} points, aire {area}, 5 routes ({", ".join(str(r["length"]) for r in routes)} px)')
