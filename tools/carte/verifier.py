#!/usr/bin/env python3
"""Auto-contrôle de arken-v9-carte.json. Usage : python3 verifier.py  → code retour 0 si tout est bon."""
import json, os, sys, itertools
import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(HERE, 'arken-v9-carte.json'), encoding='utf-8'))
img = cv2.imread(os.path.join(HERE, '..', '..', 'assets', 'carte-leonardo.jpg'))
W, H = data['imageSize']
errors, notes = [], []
ok = lambda cond, msg: None if cond else errors.append(msg)

V6 = {'p01': ('Valmorne', 'valmorne'), 'p02': ('Sylvaren', 'valmorne'), 'p03': ('Branvale', 'valmorne'),
      'p04': ('Haut-Bois', 'valmorne'), 'p05': ('Roc-Épine', 'roc-epine'), 'p06': ('Faucongris', 'roc-epine'),
      'p07': ('Belrivage', 'roc-epine'), 'p08': ('Terrefort', 'roc-epine'), 'p09': ('Noireflamme', 'noireflamme'),
      'p10': ('Cendrelac', 'noireflamme'), 'p11': ('Grèsrouge', 'noireflamme'), 'p12': ('Cornérive', 'noireflamme'),
      'p13': ('Glacenoire', 'oroel'), 'p14': ('Nordhème', 'oroel'), 'p15': ('Îlebrume', 'oroel'),
      'p16': ('Tréfond', 'oroel'), 'p17': ('Aurorelle', 'aurel'), 'p18': ('Valdoré', 'aurel'),
      'p19': ('Lunémont', 'aurel'), 'p20': ('Clairazur', 'aurel')}

P = data['provinces']
byid = {p['id']: p for p in P}
# 1. effectifs, ids, noms
ok(len(P) == 20, f'{len(P)} provinces au lieu de 20')
ok(set(byid) == set(V6), 'ids différents de p01..p20')
for pid, (name, nat) in V6.items():
    if pid in byid:
        ok(byid[pid]['name'] == name and byid[pid]['nation'] == nat, f'{pid} : nom/nation différents de la V6')
nations = [n['id'] for n in data['nations']]
ok(len(nations) == 5, '5 nations attendues')
for n in nations:
    c = sum(p['nation'] == n for p in P)
    ok(c == 4, f'{n} : {c} provinces au lieu de 4')
# une île par nation
isl_nat = {}
for p in P:
    isl_nat.setdefault(p['island'], set()).add(p['nation'])
ok(len(isl_nat) == 5 and all(len(v) == 1 for v in isl_nat.values()), 'une île = une nation : non respecté')

# 2. voisinages
for p in P:
    for q in p['landNeighbors']:
        ok(q in byid, f'{p["id"]} : voisin inconnu {q}')
        ok(q != p['id'], f'{p["id"]} voisin de lui-même')
        if q in byid:
            ok(p['id'] in byid[q]['landNeighbors'], f'voisinage asymétrique {p["id"]}→{q}')
            ok(byid[q]['island'] == p['island'], f'voisinage terrestre entre îles {p["id"]}-{q}')
# connexité terrestre de chaque île
for isl in isl_nat:
    mine = [p['id'] for p in P if p['island'] == isl]
    seen, st = {mine[0]}, [mine[0]]
    while st:
        u = st.pop()
        for v in byid[u]['landNeighbors']:
            if v not in seen:
                seen.add(v)
                st.append(v)
    ok(seen == set(mine), f'{isl} : provinces non connexes par terre ({sorted(set(mine) - seen)})')

# 3. mer : ports, routes, connexité
hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
for p in P:
    if p['port']:
        ok(p['coastal'], f'{p["id"]} : port sur province non côtière')
        x, y = p['port']['anchor']
        h, s, _ = hsv[y, x]
        ok(80 <= h <= 125 and s > 60, f'{p["id"]} : ancre du port ({x},{y}) pas en mer')
for isl in isl_nat:
    n = sum(1 for p in P if p['island'] == isl and p['port'])
    ok(n >= 1, f'{isl} : aucun port')
    if n < 2:
        notes.append(f'{isl} : 1 seul port')
hsv_sea = (hsv[:, :, 0] >= 80) & (hsv[:, :, 0] <= 125) & (hsv[:, :, 1] > 70)
land_img = ~hsv_sea
nlab, comp, st, _ = cv2.connectedComponentsWithStats(land_img.astype(np.uint8))
big = set((np.argsort(-st[1:, 4])[:5] + 1).tolist())
big_land = np.isin(comp, list(big))


def seg_land(a, b, mask):
    a, b = np.array(a, float), np.array(b, float)
    n = int(np.linalg.norm(b - a)) * 2 + 2
    return int(sum(mask[int(round(y)), int(round(x))] for x, y in (a + t * (b - a) for t in np.linspace(0, 1, n))))


routes = data['seaRoutes']
# V13 : anneau de 5 routes (chaque île reliée à ses 2 voisines uniquement)
ok(len(routes) == 5, f'{len(routes)} routes au lieu de 5 (anneau V13)')
pairs = set()
islet_hits = 0
for r in routes:
    a, b = byid.get(r['from']), byid.get(r['to'])
    if not (a and b):
        errors.append(f'route {r["from"]}-{r["to"]} : province inconnue')
        continue
    ok(a['port'] and b['port'], f'route {r["from"]}-{r["to"]} : extrémité sans port')
    ok(a['island'] != b['island'], f'route {r["from"]}-{r["to"]} : même île')
    key = frozenset((a['island'], b['island']))
    ok(key not in pairs, f'route en double entre {sorted(key)}')
    pairs.add(key)
    if not (a['port'] and b['port']):
        continue
    pts = [a['port']['anchor']] + r.get('waypoints', []) + [b['port']['anchor']]
    for q in pts:
        ok(0 <= q[0] < W and 0 <= q[1] < H and isinstance(q[0], int), f'route {r["from"]}-{r["to"]} : point invalide {q}')
    L = sum(float(np.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1])) for k in range(len(pts) - 1))
    ok(abs(L - r['length']) <= 1, f'route {r["from"]}-{r["to"]} : longueur {r["length"]} ≠ {L:.0f}')
    for k in range(len(pts) - 1):
        n = seg_land(pts[k], pts[k + 1], big_land)
        ok(n == 0, f'route {r["from"]}-{r["to"]} : le segment {pts[k]}→{pts[k + 1]} coupe une grande île')
        islet_hits += seg_land(pts[k], pts[k + 1], land_img & ~big_land)
ok(len(pairs) == 5, f'{len(pairs)} paires d\'îles reliées au lieu de 5 (anneau)')
RING = ['ile-nord-ouest', 'ile-nord-est', 'ile-est', 'ile-sud', 'ile-sud-ouest']
for i, isl in enumerate(RING):
    ok(frozenset((isl, RING[(i + 1) % 5])) in pairs, f'anneau : pas de route {isl} ↔ {RING[(i + 1) % 5]}')
    deg = sum(1 for k in pairs if isl in k)
    ok(deg == 2, f'{isl} : {deg} voisines maritimes au lieu de 2')
if islet_hits:
    notes.append(f'routes : {islet_hits} échantillons sur îlots décoratifs')
else:
    notes.append('routes : aucun îlot traversé')
used = {r['from'] for r in routes} | {r['to'] for r in routes}
for p in P:
    if p['port']:
        ok(p['id'] in used, f'{p["id"]} : port sans route')
        n = sum(1 for r in routes if p['id'] in (r['from'], r['to']))
        ok(n == 1, f'{p["id"]} : site de port utilisé par {n} routes (1 attendue)')
for isl in isl_nat:
    ps = sorted(p['id'] for p in P if p['island'] == isl and p['port'])
    notes.append(f'{isl} : ports {ps}')

# 4. géométrie
def seg_inter(p1, p2, p3, p4):
    """Intersection propre (croisement strict) de [p1p2] et [p3p4]."""
    d = lambda a, b, c: (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    d1, d2, d3, d4 = d(p3, p4, p1), d(p3, p4, p2), d(p1, p2, p3), d(p1, p2, p4)
    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True
    # recouvrement colinéaire non nul (hors arête partagée identique)
    if d1 == d2 == d3 == d4 == 0:
        ax = 0 if p1[0] != p2[0] else 1
        lo1, hi1 = sorted((p1[ax], p2[ax]))
        lo2, hi2 = sorted((p3[ax], p4[ax]))
        return min(hi1, hi2) - max(lo1, lo2) > 0 and {tuple(p1), tuple(p2)} != {tuple(p3), tuple(p4)}
    return False


def self_intersects(poly):
    n = len(poly)
    E = [(poly[i], poly[(i + 1) % n]) for i in range(n)]
    for i, j in itertools.combinations(range(n), 2):
        if j == i + 1 or (i == 0 and j == n - 1):
            continue
        if seg_inter(*E[i], *E[j]):
            return True
    return False


def area(poly):
    a = np.array(poly, float)
    return 0.5 * abs(np.dot(a[:, 0], np.roll(a[:, 1], -1)) - np.dot(a[:, 1], np.roll(a[:, 0], -1)))


SC = 4  # raster fin pour le test de disjonction
cover = np.zeros((H * SC // 4, W * SC // 4), np.uint8)
masks = {}
for p in P:
    poly = p['polygon']
    ok(all(isinstance(v, int) for q in poly for v in q), f'{p["id"]} : coordonnées non entières')
    ok(all(0 <= x < W and 0 <= y < H for x, y in poly), f'{p["id"]} : point hors image')
    ok(20 <= len(poly) <= 60, f'{p["id"]} : {len(poly)} points (attendu 20 à 60)')
    ok(len(set(map(tuple, poly))) == len(poly), f'{p["id"]} : sommets dupliqués')
    ok(not self_intersects(poly), f'{p["id"]} : polygone auto-intersecté')
    ok(abs(area(poly) - p['area']) <= 1, f'{p["id"]} : aire incohérente')
    x, y = p['center']
    inside = cv2.pointPolygonTest(np.array(poly, np.int32), (float(x), float(y)), True)
    ok(inside >= 8, f'{p["id"]} : centre trop près du bord ou dehors (marge {inside:.1f})')
    m = np.zeros((H, W), np.uint8)
    cv2.fillPoly(m, [np.array(poly, np.int32)], 1)
    masks[p['id']] = m
# disjonction : aucune paire d'arêtes ne se croise, aucun sommet strictement intérieur à un autre polygone
for a, b in itertools.combinations(P, 2):
    pa, pb = a['polygon'], b['polygon']
    xa, ya = np.array(pa).T
    xb, yb = np.array(pb).T
    if xa.max() < xb.min() or xb.max() < xa.min() or ya.max() < yb.min() or yb.max() < ya.min():
        continue
    Ea = [(pa[i], pa[(i + 1) % len(pa)]) for i in range(len(pa))]
    Eb = [(pb[i], pb[(i + 1) % len(pb)]) for i in range(len(pb))]
    cross = any(seg_inter(*e, *f) for e in Ea for f in Eb)
    ok(not cross, f'{a["id"]} et {b["id"]} : frontières qui se croisent')
    for q in pa:
        if cv2.pointPolygonTest(np.array(pb, np.int32), (float(q[0]), float(q[1])), True) > 0.5:
            errors.append(f'sommet de {a["id"]} à l\'intérieur de {b["id"]}')
            break
    inter = int((masks[a['id']] & masks[b['id']]).sum())
    # le remplissage raster inclut les bords : une frontière commune donne un liseré ~ longueur commune
    ok(inter < 0.02 * min(a['area'], b['area']), f'{a["id"]} et {b["id"]} : recouvrement {inter} px')

# 5. cohérence avec l'image : chaque province est surtout de la terre et voisins = contact réel
sea = ((hsv[:, :, 0] >= 80) & (hsv[:, :, 0] <= 125) & (hsv[:, :, 1] > 70))
for p in P:
    m = masks[p['id']].astype(bool)
    land_frac = 1 - sea[m].mean()
    ok(land_frac > 0.85, f'{p["id"]} : seulement {land_frac:.0%} de terre dans le polygone')
    if p['coastal']:
        ring = cv2.dilate(m.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & ~m
        ok(sea[ring].any(), f'{p["id"]} marquée côtière sans mer autour')

areas = {isl: [p['area'] for p in P if p['island'] == isl] for isl in isl_nat}
for isl, a in areas.items():
    notes.append(f'{isl} : aires {sorted(a)} (max/min = {max(a) / min(a):.2f})')

# V13 : aucune route n'en croise une autre
def lane_pts(r):
    return [byid[r['from']]['port']['anchor']] + r.get('waypoints', []) + [byid[r['to']]['port']['anchor']]
for r1, r2 in itertools.combinations(routes, 2):
    A, B = lane_pts(r1), lane_pts(r2)
    hit = any(seg_inter(A[i], A[i + 1], B[j], B[j + 1]) for i in range(len(A) - 1) for j in range(len(B) - 1))
    ok(not hit, f'routes {r1["from"]}-{r1["to"]} et {r2["from"]}-{r2["to"]} : croisement')

print('AUTO-CONTRÔLE carte V9 (anneau maritime V13)')
print(f'  provinces : {len(P)} ; routes maritimes : {len(data["seaRoutes"])} ; ports : {sum(1 for p in P if p["port"])}')
for r in data['seaRoutes']:
    print(f'  route {r["from"]} ↔ {r["to"]} : {r["length"]} px, {len(r.get("waypoints", []))} point(s) de passage')
for n in notes:
    print('  note :', n)
if errors:
    print(f'ÉCHEC : {len(errors)} erreur(s)')
    for e in errors:
        print('  -', e)
    sys.exit(1)
print('OK : toutes les vérifications passent')
