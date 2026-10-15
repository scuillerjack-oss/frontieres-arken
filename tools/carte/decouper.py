#!/usr/bin/env python3
"""FRONTIÈRES: ARKEN — V9 — découpage de la carte Leonardo en 20 provinces.

Usage : python3 decouper.py        (depuis n'importe quel dossier)
Entrée : ../assets/carte-leonardo.jpg (1536 x 1536)
Sorties (dans ce dossier) :
  arken-v9-carte.json     données de carte (repère image 1536 x 1536)
  controle-carte.png      image de contrôle pour Jack (1080 px de large)
  controle-cellules.png   cellules peintes détectées (contrôle technique)

Méthode
 1. Masque terre/mer en HSV (mer = teinte bleue saturée ; les hauts-fonds turquoise
    restent « mer »). Les 5 plus grandes composantes = îles jouables ; le reste = îlots décoratifs.
 2. Carte des traits de frontière : filtre de crêtes (Sato) sur une image de « blancheur »
    (luminance - saturation, top-hat), lissée par un filtre orienté (traits fins et longs).
    Sur la neige, les frontières sont des traits doubles sombres/clairs : on ajoute le filtre
    de crêtes sombres. Là où le trait est trop peu contrasté (neige), quelques polylignes
    GUIDES, relevées à l'œil sur l'image, renforcent le trait.
 3. Cellules peintes : segmentation géodésique depuis un germe par zone peinte (SEEDS,
    relevés visuellement, 1 à 2 points par zone). Le coût de passage est fort sur les traits :
    chaque pixel rejoint la zone qu'il atteint sans franchir de trait, donc les limites
    de cellules se calent sur les frontières dessinées. Nettoyage : fragments et micro-cellules
    (< 3000 px) fusionnés dans leur voisine de plus longue frontière commune.
 4. Regroupement : par île, recherche locale multi-départs (graine fixe, reproductible) de
    4 groupes de cellules adjacentes, connexes, minimisant écart d'aire + non-compacité
    (moment d'inertie normalisé) + hétérogénéité de couleur.
 5. Polygones : contours « en fissures » (bords de pixels) découpés en arcs partagés entre
    provinces voisines ; chaque arc est simplifié UNE fois (Douglas-Peucker) et réutilisé
    par les deux provinces → frontières identiques, polygones disjoints.
 6. Ports et routes : graphe complet des 5 îles (10 routes, une par paire). Distances par la mer
    (plus court chemin sur une grille où toute terre, îlots compris, est interdite et les côtes
    coûteuses). On choisit 2 ports par île (3 seulement si cela raccourcit beaucoup) pour minimiser
    la somme des trajets ; chaque route part du port de l'île le plus proche de l'île cible.
    Ancre = point de mer à 9-24 px de la côte de la province, au plus près des ports desservis.
    Le tracé est simplifié en points de passage (waypoints) qui restent en mer libre ;
    length = longueur en pixels le long du tracé.
"""
import itertools, json, math, os, sys
import numpy as np
import cv2
from scipy import ndimage as ndi
from scipy.spatial import cKDTree
from skimage.filters import sato
from skimage.graph import MCP_Geometric
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'assets', 'carte-leonardo.jpg')
OUT_JSON = os.path.join(HERE, 'arken-v9-carte.json')
OUT_PNG = os.path.join(HERE, 'controle-carte.png')
OUT_CELLS = os.path.join(HERE, 'controle-cellules.png')
FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT_REG = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'

# --------------------------------------------------------------------------- données
NATIONS = [  # reprises de src/map/arken-v1-map.js (V6)
    {'id': 'valmorne', 'name': 'Royaume de Valmorne', 'short': 'Valmorne', 'color': '#65a85a', 'crest': 'stag'},
    {'id': 'roc-epine', 'name': 'Confédération de Roc-Épine', 'short': 'Roc-Épine', 'color': '#d99a2b', 'crest': 'lion'},
    {'id': 'noireflamme', 'name': 'Empire de Noireflamme', 'short': 'Noireflamme', 'color': '#c74737', 'crest': 'serpent'},
    {'id': 'oroel', 'name': "Ligue d'Oroël", 'short': 'Oroël', 'color': '#5595d9', 'crest': 'wolf'},
    {'id': 'aurel', 'name': "Alliance d'Aurel", 'short': 'Aurel', 'color': '#2aa99b', 'crest': 'sun'},
]
# ids, noms, nation et biome V6 ; ancre V6 (repère 400x260 de l'ancienne carte) pour départager
V6 = [
    ('p01', 'Valmorne', 'valmorne', 'forest', (48, 42)), ('p02', 'Sylvaren', 'valmorne', 'forest', (104, 39)),
    ('p03', 'Branvale', 'valmorne', 'plains', (151, 68)), ('p04', 'Haut-Bois', 'valmorne', 'forest', (89, 78)),
    ('p05', 'Roc-Épine', 'roc-epine', 'dry', (49, 116)), ('p06', 'Faucongris', 'roc-epine', 'dry', (102, 112)),
    ('p07', 'Belrivage', 'roc-epine', 'dry', (152, 116)), ('p08', 'Terrefort', 'roc-epine', 'dry', (91, 145)),
    ('p09', 'Noireflamme', 'noireflamme', 'volcanic', (48, 173)), ('p10', 'Cendrelac', 'noireflamme', 'volcanic', (107, 176)),
    ('p11', 'Grèsrouge', 'noireflamme', 'volcanic', (75, 211)), ('p12', 'Cornérive', 'noireflamme', 'volcanic', (146, 211)),
    ('p13', 'Glacenoire', 'oroel', 'snow', (280, 47)), ('p14', 'Nordhème', 'oroel', 'snow', (266, 87)),
    ('p15', 'Îlebrume', 'oroel', 'snow', (326, 94)), ('p16', 'Tréfond', 'oroel', 'snow', (291, 135)),
    ('p17', 'Aurorelle', 'aurel', 'plains', (264, 178)), ('p18', 'Valdoré', 'aurel', 'forest', (330, 178)),
    ('p19', 'Lunémont', 'aurel', 'mountain', (278, 218)), ('p20', 'Clairazur', 'aurel', 'plains', (337, 218)),
]
# Île → nation (justification couleur vérifiée dans le rapport : voir island_color_stats)
ISLANDS = {  # id : (nation, point quelconque de l'île)
    'ile-nord-ouest': ('valmorne', (300, 300)),
    'ile-sud-ouest': ('roc-epine', (240, 920)),
    'ile-est': ('noireflamme', (1140, 630)),
    'ile-nord-est': ('oroel', (1060, 280)),
    'ile-sud': ('aurel', (1080, 1120)),
}
# Routes maritimes : graphe complet (chaque île reliée aux 4 autres, 10 routes) — décision de Jack.

# Germes des zones peintes (x, y) — relevés visuellement, 1 à 2 points par zone dessinée.
SEEDS = {
    'A1': [(210, 110), (100, 170)], 'A1b': [(200, 262)], 'A2': [(330, 160)], 'A3': [(440, 120)],
    'A4': [(560, 165), (640, 290)], 'A5': [(430, 260)], 'A6': [(310, 310)], 'A7': [(140, 390)],
    'A8': [(200, 560)], 'A9': [(300, 460)], 'A10': [(500, 480), (430, 640)], 'A11': [(590, 580)],
    'A12': [(560, 390)], 'A13': [(710, 390)],
    'B1': [(110, 820), (250, 760)], 'B2': [(320, 790)], 'B3': [(240, 920)], 'B4': [(450, 880)],
    'B5': [(565, 890)], 'B6': [(200, 1150)], 'B7': [(420, 1100)],
    'C1': [(1010, 480)], 'C2': [(1140, 480)], 'C3': [(1000, 620)], 'C4': [(1140, 630)],
    'C5': [(1250, 600), (1250, 480)], 'C6': [(1150, 750)], 'C7': [(1360, 700), (1320, 650)],
    'D1': [(880, 180)], 'D2': [(1050, 140)], 'D3': [(1060, 280)], 'D4': [(1300, 200), (1400, 330)],
    'D5': [(1180, 320)], 'D6': [(1280, 350), (1260, 370)],
    'E1': [(800, 950)], 'E2': [(920, 980)], 'E3': [(700, 1050)], 'E4': [(640, 1160)], 'E5': [(600, 1270)],
    'E6': [(770, 1270)], 'E7': [(930, 1100)], 'E7b': [(830, 1080)], 'E8': [(950, 1250)], 'E9': [(1010, 960)],
    'E10': [(1150, 920)], 'E11': [(1190, 1040)], 'E12': [(1080, 1120)], 'E13': [(1050, 1330)],
    'E14': [(1130, 1240)], 'E15': [(1235, 1170)], 'E16': [(1220, 1320)], 'E17': [(1360, 1080)],
}
# Frontières peintes trop peu contrastées (traits sur neige) : tracés relevés à l'œil.
GUIDES = [
    [(929, 79), (919, 107), (932, 143), (950, 169), (976, 200), (994, 218), (1005, 242), (997, 265), (986, 280)],
    [(994, 216), (1025, 211), (1049, 203), (1077, 200), (1111, 196)],
    [(1111, 196), (1115, 170), (1124, 151), (1143, 134)],
    [(1111, 196), (1118, 204), (1138, 221), (1166, 226), (1174, 238)],
    [(1174, 238), (1166, 246), (1146, 257), (1126, 274), (1118, 294), (1112, 313), (1121, 333), (1126, 346)],
    [(1174, 238), (1200, 252), (1215, 248), (1230, 253), (1245, 262), (1262, 268), (1267, 285), (1262, 305)],
    [(1262, 305), (1250, 320), (1240, 335), (1232, 355), (1235, 368)],
    [(1262, 305), (1290, 318), (1305, 335), (1320, 344)],
    [(555, 106), (525, 120), (518, 140), (530, 165), (510, 180), (495, 185), (485, 197), (476, 216), (479, 231),
     (495, 247), (504, 265), (519, 278), (525, 296), (519, 315), (504, 327)],
]
MIN_CELL = 3000      # px : en dessous, cellule parasite fusionnée
EPS_INNER = 3.0      # px : simplification des frontières terrestres
EPS_COAST0 = 3.5     # px : simplification initiale des côtes (augmentée si > MAX_PTS)
MAX_PTS, MIN_PTS = 60, 20


def log(*a):
    print(*a, flush=True)


# --------------------------------------------------------------------------- 1. terre / mer
def land_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s, _ = cv2.split(hsv)
    sea = ((h >= 80) & (h <= 125) & (s > 70)).astype(np.uint8)
    sea = cv2.morphologyEx(sea, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    land = cv2.morphologyEx(1 - sea, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    return ndi.binary_fill_holes(land)


def oriented(r, L=31):
    r = r.astype(np.float32)
    best = np.zeros_like(r)
    c = L // 2
    for a in np.arange(0, 180, 7.5):
        k = np.zeros((L, L), np.float32)
        t = np.deg2rad(a)
        cv2.line(k, (int(round(c - c * np.cos(t))), int(round(c - c * np.sin(t)))),
                 (int(round(c + c * np.cos(t))), int(round(c + c * np.sin(t)))), 1, 1)
        best = np.maximum(best, cv2.filter2D(r, -1, k / k.sum()))
    return best


# --------------------------------------------------------------------------- 2. traits
def line_map(img, land):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(np.float32)
    L = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)[:, :, 0].astype(np.float32)
    inner = cv2.erode(land.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    w = L - 0.5 * hsv[:, :, 1]
    th = cv2.morphologyEx(w, cv2.MORPH_TOPHAT, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
    rw = sato(th, sigmas=[1.5, 2.5], black_ridges=False)
    rw[~inner] = 0
    ow = oriented(rw / np.percentile(rw[inner], 99))
    snow = cv2.GaussianBlur(((hsv[:, :, 1] < 45) & (hsv[:, :, 2] > 150)).astype(np.float32), (0, 0), 12) > 0.5
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
    rd = sato(g, sigmas=[1, 1.5], black_ridges=True)
    rd[~inner] = 0
    od = oriented(rd / np.percentile(rd[inner & snow], 99))
    ow /= np.percentile(ow[inner], 99.3)
    od /= np.percentile(od[inner & snow], 99.3)
    line = np.where(snow, np.maximum(ow, od), ow)
    line[~inner] = 0
    gm = np.zeros(line.shape, np.uint8)
    for gde in GUIDES:
        cv2.polylines(gm, [np.array(gde, np.int32)], False, 1, 3)
    line[gm > 0] = np.maximum(line[gm > 0], 1.3)
    return cv2.GaussianBlur(line, (0, 0), 1.0), inner


# --------------------------------------------------------------------------- 3. cellules
def segment_cells(isl_lab, land, line):
    names = list(SEEDS)
    t = np.clip((line - 0.45) / 0.4, 0, 1)
    cost = 1 + 300 * t ** 2
    inner = cv2.erode(land.astype(np.uint8), np.ones((11, 11), np.uint8)).astype(bool)
    cost[land & ~inner] = np.maximum(cost[land & ~inner], 40)  # pas de fuite le long des côtes
    best = np.full(line.shape, np.inf)
    cells = np.zeros(line.shape, np.int32)
    for i, k in enumerate(names, 1):
        pts = SEEDS[k]
        li = isl_lab[pts[0][1], pts[0][0]]
        assert li > 0, f'germe {k} hors île jouable'
        ys, xs = np.nonzero(isl_lab == li)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        c = cost[y0:y1, x0:x1].copy()
        c[isl_lab[y0:y1, x0:x1] != li] = np.inf
        cum, _ = MCP_Geometric(c).find_costs([(py - y0, px - x0) for px, py in pts])
        sub = best[y0:y1, x0:x1]
        upd = cum < sub
        sub[upd] = cum[upd]
        cells[y0:y1, x0:x1][upd] = i
    cells[isl_lab == 0] = 0
    return cells, names


def pair_lengths(lab):
    """{(a,b): nombre d'arêtes de pixels partagées} pour a<b, 0 = mer."""
    out = {}
    for a, b in ((lab[:, :-1], lab[:, 1:]), (lab[:-1, :], lab[1:, :])):
        m = a != b
        lo = np.minimum(a[m], b[m]).astype(np.int64)
        hi = np.maximum(a[m], b[m]).astype(np.int64)
        u, c = np.unique(lo * 1000003 + hi, return_counts=True)
        for q, n in zip(u, c):
            key = (int(q // 1000003), int(q % 1000003))
            out[key] = out.get(key, 0) + int(n)
    return out


def clean_cells(cells):
    # fragments : on ne garde que la plus grande composante de chaque cellule
    for _ in range(3):
        changed = False
        for i in np.unique(cells[cells > 0]):
            comp, n = ndi.label(cells == i)
            if n <= 1:
                continue
            sizes = ndi.sum(np.ones_like(comp), comp, range(1, n + 1))
            keep = int(np.argmax(sizes)) + 1
            for j in range(1, n + 1):
                if j == keep:
                    continue
                frag = comp == j
                ring = cv2.dilate(frag.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool) & ~frag
                nb = cells[ring]
                nb = nb[(nb > 0) & (nb != i)]
                if len(nb):
                    cells[frag] = np.bincount(nb).argmax()
                    changed = True
        if not changed:
            break
    # micro-cellules
    while True:
        ids, areas = np.unique(cells[cells > 0], return_counts=True)
        small = [(a, i) for i, a in zip(ids, areas) if a < MIN_CELL]
        if not small:
            break
        _, i = min(small)
        pl = pair_lengths(cells)
        nbs = [(n, b if a == i else a) for (a, b), n in pl.items() if i in (a, b) and 0 not in (a, b)]
        if not nbs:
            break
        cells[cells == i] = max(nbs)[1]
    return cells


# --------------------------------------------------------------------------- 4. regroupement
def group_island(cell_ids, stats, adj, rng, restarts=600):
    ids = list(cell_ids)
    idx = {c: k for k, c in enumerate(ids)}
    N = len(ids)
    nb = [[idx[o] for o in adj.get(c, ()) if o in idx] for c in ids]
    S = np.array([stats[c] for c in ids])  # n, sx, sy, sxx, syy, sL, sa, sb, sLL, saa, sbb
    T = S[:, 0].sum() / 4

    def gscore(mask):
        s = S[mask].sum(0)
        n = s[0]
        area = ((n - T) / T) ** 2
        inertia = (s[3] - s[1] ** 2 / n + s[4] - s[2] ** 2 / n) / (n * n / (2 * math.pi))
        col = (s[8] - s[5] ** 2 / n + s[9] - s[6] ** 2 / n + s[10] - s[7] ** 2 / n) / n
        return 40 * area + 1.0 * (inertia - 1) + col / 600

    def score(asg):
        return sum(gscore(asg == g) for g in range(4))

    def connected(asg, g):
        members = np.nonzero(asg == g)[0]
        if len(members) == 0:
            return False
        seen = {members[0]}
        st = [members[0]]
        while st:
            u = st.pop()
            for v in nb[u]:
                if asg[v] == g and v not in seen:
                    seen.add(v)
                    st.append(v)
        return len(seen) == len(members)

    best, best_s = None, 1e18
    for _ in range(restarts):
        asg = -np.ones(N, int)
        for g, s0 in enumerate(rng.choice(N, 4, replace=False)):
            asg[s0] = g
        ok = True
        while (asg < 0).any():
            areas = [S[asg == g, 0].sum() for g in range(4)]
            order = np.argsort(areas)
            placed = False
            for g in order:
                cand = sorted({v for u in np.nonzero(asg == g)[0] for v in nb[u] if asg[v] < 0})
                if cand:
                    asg[rng.choice(cand)] = g
                    placed = True
                    break
            if not placed:
                ok = False
                break
        if not ok:
            continue
        cur = score(asg)
        improved = True
        while improved:
            improved = False
            for u in rng.permutation(N):
                g0 = asg[u]
                for g1 in {asg[v] for v in nb[u]} - {g0}:
                    asg[u] = g1
                    if (asg == g0).any() and connected(asg, g0) and connected(asg, g1):
                        s1 = score(asg)
                        if s1 < cur - 1e-9:
                            cur = s1
                            g0 = g1
                            improved = True
                            continue
                    asg[u] = g0
        if cur < best_s:
            best_s, best = cur, asg.copy()
    return {ids[k]: int(best[k]) for k in range(N)}, best_s


# --------------------------------------------------------------------------- 5. polygones
def trace_arcs(P):
    """Contours en fissures de chaque province, découpés en arcs (suite d'arêtes ayant le même voisin)."""
    H, W = P.shape
    Pp = np.zeros((H + 2, W + 2), P.dtype)
    Pp[1:-1, 1:-1] = P
    edges = {}  # start corner -> list of (end corner, province, other)
    # fissures horizontales : entre (r-1,c) et (r,c), coin (r,c)-(r,c+1) — repère image : point (x=c, y=r)
    T, B = Pp[:-1, 1:-1], Pp[1:, 1:-1]
    for r, c in zip(*np.nonzero(T != B)):
        t, b = int(T[r, c]), int(B[r, c])
        if b:
            edges.setdefault((c, r), []).append(((c + 1, r), b, t))
        if t:
            edges.setdefault((c + 1, r), []).append(((c, r), t, b))
    Lf, Rf = Pp[1:-1, :-1], Pp[1:-1, 1:]
    for r, c in zip(*np.nonzero(Lf != Rf)):
        lft, rgt = int(Lf[r, c]), int(Rf[r, c])
        if lft:
            edges.setdefault((c, r), []).append(((c, r + 1), lft, rgt))
        if rgt:
            edges.setdefault((c, r + 1), []).append(((c, r), rgt, lft))
    by_prov = {}
    for s, lst in edges.items():
        for e, p, o in lst:
            by_prov.setdefault(p, {}).setdefault(s, []).append((e, o))
    loops = {}
    for p, emap in by_prov.items():
        used = set()
        plist = []
        for s0 in list(emap):
            for e0, o0 in emap[s0]:
                if (s0, e0) in used:
                    continue
                seq = [(s0, o0)]
                used.add((s0, e0))
                prev, cur = s0, e0
                while cur != s0:
                    outs = [(e, o) for e, o in emap[cur] if (cur, e) not in used]
                    if len(outs) > 1:  # coin en damier : on tourne à droite (garde la province à droite)
                        dx, dy = cur[0] - prev[0], cur[1] - prev[1]
                        right = (-dy, dx)
                        outs.sort(key=lambda eo: 0 if (eo[0][0] - cur[0], eo[0][1] - cur[1]) == right else 1)
                    e, o = outs[0]
                    used.add((cur, e))
                    seq.append((cur, o))
                    prev, cur = cur, e
                plist.append(seq)
        loops[p] = plist
    return loops


def split_runs(seq):
    """seq = [(corner, other)] boucle fermée → liste d'arcs [(other, [corners...])] fermant la boucle."""
    n = len(seq)
    starts = [k for k in range(n) if seq[k][1] != seq[k - 1][1]]
    if not starts:
        pts = [c for c, _ in seq] + [seq[0][0]]
        return [(seq[0][1], pts)]
    runs = []
    for a, k in enumerate(starts):
        k2 = starts[(a + 1) % len(starts)]
        idxs = range(k, k2 if k2 > k else k2 + n)
        pts = [seq[j % n][0] for j in idxs] + [seq[k2 % n][0]]
        runs.append((seq[k][1], pts))
    return runs


def dp(pts, eps):
    if len(pts) <= 2:
        return [tuple(p) for p in pts]
    a = np.array(pts, np.float32).reshape(-1, 1, 2)
    if pts[0] == pts[-1]:  # boucle : on coupe en deux moitiés
        h = len(pts) // 2
        return dp(pts[:h + 1], eps)[:-1] + dp(pts[h:], eps)
    r = cv2.approxPolyDP(a, eps, False).reshape(-1, 2)
    return [tuple(map(int, p)) for p in r]


def build_polygons(P, nprov):
    loops = trace_arcs(P)
    arcs = {}
    for p in range(1, nprov + 1):
        lp = max(loops[p], key=len)  # contour extérieur (les provinces n'ont pas de trous)
        arcs[p] = split_runs(lp)
    shared = {}  # cache des arcs simplifiés partagés

    def inner_arc(p, o, pts):
        key = (min(p, o), max(p, o), frozenset((pts[0], pts[-1])), len(pts))
        if key in shared:
            s = shared[key]
            return s if s[0] == pts[0] else s[::-1]
        s = dp(pts, EPS_INNER)
        shared[key] = s
        return s

    polys, info = {}, {}
    for p in range(1, nprov + 1):
        eps_c = EPS_COAST0
        while True:
            out = []
            for o, pts in arcs[p]:
                s = dp(pts, eps_c) if o == 0 else inner_arc(p, o, pts)
                out.extend(s[:-1])
            if len(out) <= MAX_PTS or eps_c > 40:
                break
            eps_c *= 1.15
        if len(out) < MIN_PTS:  # trop simple : on resimplifie plus finement les côtes
            e2 = eps_c
            while len(out) < MIN_PTS and e2 > 0.6:
                e2 *= 0.8
                out = []
                for o, pts in arcs[p]:
                    s = dp(pts, e2) if o == 0 else inner_arc(p, o, pts)
                    out.extend(s[:-1])
        # dédoublonnage de points consécutifs
        clean = [out[0]]
        for q in out[1:]:
            if q != clean[-1]:
                clean.append(q)
        if clean[-1] == clean[0]:
            clean.pop()
        polys[p] = clean
        lens = {}
        for o, pts in arcs[p]:
            lens[o] = lens.get(o, 0) + len(pts) - 1
        info[p] = lens
    return polys, info


def shoelace(poly):
    a = np.array(poly, float)
    x, y = a[:, 0], a[:, 1]
    return 0.5 * (np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))


def visual_center(poly, shape):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.array(poly, np.int32)], 1)
    m = cv2.erode(m, np.ones((3, 3), np.uint8))
    dt = cv2.distanceTransform(m, cv2.DIST_L2, 5)
    ys, xs = np.nonzero(m)
    cy, cx = ys.mean(), xs.mean()
    yy, xx = np.mgrid[0:shape[0], 0:shape[1]]
    score = dt - 0.12 * np.hypot(yy - cy, xx - cx)
    score[m == 0] = -1e9
    y, x = np.unravel_index(np.argmax(score), score.shape)
    return int(x), int(y), float(dt[y, x])


# --------------------------------------------------------------------------- biomes
def classify_biome(hsv_pixels):
    h, s, v = hsv_pixels[:, 0].astype(int), hsv_pixels[:, 1].astype(int), hsv_pixels[:, 2].astype(int)
    snow = (s < 45) & (v >= 160)
    grey = (s < 45) & (v < 160)
    mountain = ~snow & ~grey & (h <= 22) & (s < 105)
    dry = ~snow & ~grey & (h <= 22) & (s >= 105)
    plains = ~snow & ~grey & (h > 22) & (h <= 30) & (v >= 140)
    forest = ~snow & ~grey & (h > 22) & ~plains
    fr = {'snow': snow.mean(), 'volcanic': grey.mean(), 'mountain': mountain.mean(), 'dry': dry.mean(),
          'plains': plains.mean(), 'forest': forest.mean()}
    return max(fr, key=fr.get), {k: round(float(v), 3) for k, v in fr.items()}


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


# --------------------------------------------------------------------------- main
def main():
    img = cv2.imread(SRC)
    assert img is not None and img.shape[:2] == (1536, 1536), 'carte-leonardo.jpg introuvable ou mauvaise taille'
    H, W = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lab_img = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float64)

    land = land_mask(img)
    n, comp, st, _ = cv2.connectedComponentsWithStats(land.astype(np.uint8))
    order = list(np.argsort(-st[1:, 4]) + 1)
    big = order[:5]
    isl_lab = np.zeros_like(comp)
    island_of_comp = {}
    for iid, (nat, (x, y)) in ISLANDS.items():
        c = comp[y, x]
        assert c in big, f'{iid} : le point de repère ne tombe pas sur une grande île'
        island_of_comp[c] = iid
    iids = list(ISLANDS)
    for c, iid in island_of_comp.items():
        isl_lab[comp == c] = iids.index(iid) + 1
    islets = [c for c in order[5:] if st[c, 4] >= 30]
    log(f'terre : {len(order)} composantes, 5 îles jouables, {len(islets)} îlots décoratifs')

    line, _ = line_map(img, land)
    cells, names = segment_cells(isl_lab, land, line)
    cells = clean_cells(cells)
    cell_ids = [int(i) for i in np.unique(cells[cells > 0])]
    cell_island = {i: iids[int(np.bincount(isl_lab[cells == i]).argmax()) - 1] for i in cell_ids}
    per_island_cells = {iid: [i for i in cell_ids if cell_island[i] == iid] for iid in iids}
    for iid in iids:
        log(f'{iid} : {len(per_island_cells[iid])} cellules peintes')

    # statistiques de cellules
    yy, xx = np.mgrid[0:H, 0:W]
    stats = {}
    for i in cell_ids:
        m = cells == i
        x, y = xx[m].astype(float), yy[m].astype(float)
        Lc = lab_img[m]
        stats[i] = [m.sum(), x.sum(), y.sum(), (x * x).sum(), (y * y).sum(), *Lc.sum(0), *(Lc ** 2).sum(0)]
    pl = pair_lengths(cells)
    adj = {}
    for (a, b), L in pl.items():
        if a and b and L >= 10:
            adj.setdefault(a, set()).add(b)
            adj.setdefault(b, set()).add(a)

    rng = np.random.default_rng(20261015)
    P = np.zeros_like(cells)
    prov_cells, prov_island = {}, {}
    k = 0
    for iid in iids:
        grp, sc = group_island(per_island_cells[iid], stats, adj, rng)
        for g in range(4):
            k += 1
            members = [c for c, gg in grp.items() if gg == g]
            prov_cells[k] = members
            prov_island[k] = iid
            P[np.isin(cells, members)] = k
        log(f'{iid} : regroupement score {sc:.3f}')

    # ---- polygones
    polys, arcinfo = build_polygons(P, 20)

    # ---- attributs provinces
    provs = {}
    for p in range(1, 21):
        poly = polys[p]
        if shoelace(poly) < 0:
            poly = poly[::-1]
            polys[p] = poly
        cx, cy, r = visual_center(poly, (H, W))
        biome, fr = classify_biome(hsv[P == p])
        provs[p] = dict(island=prov_island[p], poly=poly, center=(cx, cy), radius=r,
                        area=int(round(abs(shoelace(poly)))), pixels=int((P == p).sum()), biome=biome, biomeFr=fr,
                        nb=sorted(o for o, L in arcinfo[p].items() if o and L >= 6),
                        coast=arcinfo[p].get(0, 0), cells=[names[c - 1] for c in prov_cells[p]])

    # ---- noms V6 : appariement biome + position relative (permutations, 4! par nation)
    from itertools import permutations
    assign = {}
    for iid, (nat, _) in ISLANDS.items():
        mine = [p for p in provs if provs[p]['island'] == iid]
        v6 = [d for d in V6 if d[2] == nat]
        cm = np.array([provs[p]['center'] for p in mine], float)
        am = np.array([d[4] for d in v6], float)
        nc = (cm - cm.mean(0)) / (cm.std(0) + 1e-6)
        na = (am - am.mean(0)) / (am.std(0) + 1e-6)
        best, bs = None, 1e18
        for perm in permutations(range(4)):
            s = 0
            for a, b in enumerate(perm):
                p, d = mine[a], v6[b]
                mx = max(provs[q]['biomeFr'].get(d[3], 0) for q in mine) + 1e-6
                s += 10 * (1 - provs[p]['biomeFr'].get(d[3], 0) / mx)
                s += 3 * np.linalg.norm(nc[a] - na[b])
            if s < bs:
                bs, best = s, perm
        for a, b in enumerate(best):
            assign[mine[a]] = v6[b]
    pid = {p: assign[p][0] for p in provs}

    # ---- ports et routes
    sea = isl_lab == 0  # mer + îlots (les îlots sont décoratifs)
    true_sea = ~land
    sea_dt = cv2.distanceTransform(true_sea.astype(np.uint8), cv2.DIST_L2, 5)
    coast_px = {}
    ring = cv2.dilate(sea.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
    for p in provs:
        ys, xs = np.nonzero((P == p) & ring)
        coast_px[p] = np.stack([xs, ys], 1)
    big_land = isl_lab > 0

    def crosses_land(a, b, skip=30):
        a, b = np.array(a, float), np.array(b, float)
        L = np.linalg.norm(b - a)
        for t in np.linspace(0, 1, int(L / 2) + 2):
            q = a + t * (b - a)
            if min(t * L, (1 - t) * L) < skip:
                continue
            if big_land[int(q[1]), int(q[0])]:
                return True
        return False

    # ---- routes maritimes : graphe complet des 5 îles (10 routes), tracés par la mer
    isl_dt = {iid: cv2.distanceTransform((isl_lab != iids.index(iid) + 1).astype(np.uint8), cv2.DIST_L2, 5)
              for iid in iids}
    # province de grande île la plus proche de chaque pixel
    _, (iy, ix) = ndi.distance_transform_edt(P == 0, return_indices=True)
    near_prov = P[iy, ix]
    # bande d'ancrage de chaque province : mer libre (îlots compris), à 9-24 px de sa côte
    band = {}
    for p in provs:
        own = provs[p]['island']
        for lo in (9, 7, 5):
            m = true_sea & (sea_dt >= lo) & (near_prov == p) & (isl_dt[own] <= 24)
            if m.sum() >= 20:
                band[p] = m
                break
    # grille de navigation à mi-résolution : terre (îlots compris) interdite, côtes coûteuses
    HS = 2
    sea_h = cv2.resize(true_sea.astype(np.uint8), (W // HS, H // HS), interpolation=cv2.INTER_AREA) > 0
    sea_h &= cv2.resize((sea_dt >= 3).astype(np.uint8), (W // HS, H // HS), interpolation=cv2.INTER_NEAREST) > 0
    dt_h = cv2.distanceTransform(sea_h.astype(np.uint8), cv2.DIST_L2, 5) * HS
    nav = 1 + 6 * np.clip((22 - dt_h) / 22, 0, 1) ** 2
    nav[~sea_h] = np.inf

    def half(mask):
        ys, xs = np.nonzero(mask)
        pts = np.unique(np.stack([ys // HS, xs // HS], 1), axis=0)
        return [tuple(q) for q in pts if sea_h[q[0], q[1]]]

    band_h = {p: half(m) for p, m in band.items()}
    field = {}
    for p, src in band_h.items():
        field[p], _ = MCP_Geometric(nav).find_costs(src)

    def pdist(pa, pb):
        return min(field[pa][q] for q in band_h[pb]) * HS

    pairs = list(itertools.combinations(iids, 2))
    coastal_ports = {iid: [p for p in provs if provs[p]['island'] == iid and p in band] for iid in iids}
    D = {(pa, pb): pdist(pa, pb) for ia, ib in pairs for pa in coastal_ports[ia] for pb in coastal_ports[ib]}
    options = {iid: [set(c) for k in (2, 3) for c in itertools.combinations(coastal_ports[iid], k)] for iid in iids}
    best, bs = None, 1e18
    for choice in itertools.product(*(options[i] for i in iids)):
        S = dict(zip(iids, choice))
        used = {i: set() for i in iids}
        cost, links = 0, []
        for ia, ib in pairs:
            d, pa, pb = min((D[(pa, pb)], pa, pb) for pa in S[ia] for pb in S[ib])
            cost += d
            used[ia].add(pa)
            used[ib].add(pb)
            links.append((pa, pb))
        if any(used[i] != S[i] for i in iids):
            continue  # un port choisi doit servir
        cost += sum(250 for i in iids if len(S[i]) == 3)  # 3e port seulement s'il fait gagner beaucoup
        if cost < bs:
            bs, best = cost, links
    links = best
    port_targets = {}
    for pa, pb in links:
        port_targets.setdefault(pa, []).append(pb)
        port_targets.setdefault(pb, []).append(pa)
    # boîtes des étiquettes (repère image) : ancres et routes doivent les éviter
    k_out = 1080 / W
    fnt = ImageFont.truetype(FONT_BOLD, 21)
    label_box = np.zeros((H, W), bool)
    for p in provs:
        cx, cy = provs[p]['center']
        w = fnt.getlength(assign[p][1]) / k_out / 2 + 10
        label_box[max(0, int(cy - 36)):int(cy + 26), max(0, int(cx - w)):int(cx + w)] = True
    # ancre : point de la bande d'ancrage proche des ports desservis, loin des étiquettes
    # et à au moins 50 px des autres ancres (placement séquentiel, ports les plus chargés d'abord)
    anchors = {}
    for p in sorted(port_targets, key=lambda q: (-len(port_targets[q]), pid[q])):
        ys, xs = np.nonzero(band[p])
        sc = sum(field[t][ys // HS, xs // HS] for t in port_targets[p]) / len(port_targets[p])
        sc = sc - 0.5 * np.minimum(sea_dt[ys, xs], 16)
        sc = sc + 1e4 * label_box[ys, xs]
        for q, (ax, ay) in anchors.items():
            dd = np.hypot(xs - ax, ys - ay)
            sc = sc + 1e3 * np.clip(50 - dd, 0, None)
        k = int(np.argmin(sc))
        anchors[p] = (int(xs[k]), int(ys[k]))
    lb_h = cv2.resize(label_box.astype(np.uint8), (W // HS, H // HS), interpolation=cv2.INTER_NEAREST) > 0
    nav = nav + 25 * lb_h

    def clear(a, b, margin=4):
        a, b = np.array(a, float), np.array(b, float)
        n = int(np.linalg.norm(b - a)) + 2
        for t in np.linspace(0, 1, n):
            x, y = a + t * (b - a)
            if sea_dt[int(round(y)), int(round(x))] < margin:
                return False
        return True

    def hits_label(a, b):
        a, b = np.array(a, float), np.array(b, float)
        for t in np.linspace(0, 1, int(np.linalg.norm(b - a)) + 2):
            x, y = a + t * (b - a)
            if label_box[int(round(y)), int(round(x))]:
                return True
        return False

    routes = []
    nav_r = nav.copy()
    for pa, pb in sorted(links, key=lambda l: D[l]):
        A, B = anchors[pa], anchors[pb]
        cst = nav_r.copy()
        for q, (ax, ay) in anchors.items():  # ne pas frôler les autres ports
            if q not in (pa, pb):
                cv2.circle(cst, (ax // HS, ay // HS), 24 // HS, 60, -1)
                cst[~sea_h] = np.inf
        m = MCP_Geometric(cst)
        m.find_costs([(A[1] // HS, A[0] // HS)], [(B[1] // HS, B[0] // HS)])
        path = [(int(x) * HS + HS // 2, int(y) * HS + HS // 2) for y, x in m.traceback((B[1] // HS, B[0] // HS))]
        path = [A] + path[1:-1] + [B]
        # repousse les routes suivantes pour qu'elles ne se superposent pas exactement
        lay = np.zeros(nav.shape, np.uint8)
        cv2.polylines(lay, [np.array([(x // HS, y // HS) for x, y in path], np.int32)], False, 1, 5)
        # tirage de ficelle : points de passage minimaux en mer libre
        pts, i = [path[0]], 0
        while i < len(path) - 1:
            j = len(path) - 1
            while j > i + 1 and not (clear(path[i], path[j]) and not hits_label(path[i], path[j])):
                j -= 1
            pts.append(path[j])
            i = j
        length = sum(math.dist(pts[k], pts[k + 1]) for k in range(len(pts) - 1))
        f, t = (pa, pb) if pid[pa] < pid[pb] else (pb, pa)
        if f != pa:
            pts = pts[::-1]
        routes.append({'from': pid[f], 'to': pid[t], 'islands': [provs[f]['island'], provs[t]['island']],
                       'waypoints': [[int(x), int(y)] for x, y in pts[1:-1]],
                       'length': int(round(length))})
    routes.sort(key=lambda r: (r['from'], r['to']))

    # ---- JSON
    out_prov = []
    for p in sorted(provs, key=lambda p: pid[p]):
        v = provs[p]
        d6 = assign[p]
        out_prov.append({
            'id': d6[0], 'name': d6[1], 'nation': d6[2], 'biome': d6[3], 'paintedBiome': v['biome'],
            'paintedShare': v['biomeFr'],
            'island': v['island'],
            'polygon': [[int(x), int(y)] for x, y in v['poly']],
            'center': [v['center'][0], v['center'][1]],
            'area': v['area'],
            'landNeighbors': sorted(pid[o] for o in v['nb']),
            'coastal': v['coast'] >= 20,
            'port': {'anchor': [anchors[p][0], anchors[p][1]]} if p in anchors else None,
            'paintedCells': v['cells'],
        })
    islands_out = []
    for iid, (nat, _) in ISLANDS.items():
        mask = isl_lab == iids.index(iid) + 1
        _, fr = classify_biome(hsv[mask])
        islands_out.append({'id': iid, 'nation': nat, 'area': int(mask.sum()),
                            'paintedCells': len(per_island_cells[iid]), 'colorShare': fr,
                            'provinces': sorted(pid[p] for p in provs if provs[p]['island'] == iid)})
    data = {
        'schema': 'arken-v9-carte/1', 'source': 'assets/carte-leonardo.jpg',
        'imageSize': [W, H], 'nations': NATIONS, 'islands': islands_out,
        'provinces': out_prov, 'seaRoutes': routes,
        'decorativeIsletCount': len(islets),
    }
    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log('écrit', OUT_JSON)

    # ---- images
    render_cells(img, cells, names)
    render_control(img, data, land)
    log('écrit', OUT_PNG)


def render_cells(img, cells, names):
    rng = np.random.default_rng(1)
    col = rng.integers(40, 255, (cells.max() + 1, 3))
    col[0] = 0
    m = cells > 0
    vis = img.astype(float)
    vis[m] = vis[m] * 0.55 + col[cells][m] * 0.45
    vis = vis.astype(np.uint8)
    b = cv2.morphologyEx(cells.astype(np.uint16), cv2.MORPH_GRADIENT, np.ones((3, 3))) > 0
    vis[b & m] = (0, 0, 0)
    for i in np.unique(cells[m]):
        ys, xs = np.nonzero(cells == i)
        d = ndi.distance_transform_edt(np.pad(cells == i, 1))[1:-1, 1:-1]
        y, x = np.unravel_index(d.argmax(), d.shape)
        cv2.putText(vis, names[i - 1], (int(x) - 14, int(y) + 5), 0, 0.5, (0, 0, 0), 3)
        cv2.putText(vis, names[i - 1], (int(x) - 14, int(y) + 5), 0, 0.5, (255, 255, 255), 1)
    cv2.imwrite(OUT_CELLS, vis)


def render_control(img, data, land):
    SS = 2                        # sur-échantillonnage pour l'anticrénelage
    OUTW = 1080
    sc = OUTW * SS / 1536
    MAPW = OUTW * SS
    HEAD, FOOT = 120 * SS, 210 * SS
    canvas = Image.new('RGB', (MAPW, HEAD + MAPW + FOOT), (14, 30, 48))
    base = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)).resize((MAPW, MAPW), Image.LANCZOS)
    canvas.paste(base, (0, HEAD))
    nat = {n['id']: n for n in data['nations']}
    T = lambda x, y: (x * sc, HEAD + y * sc)

    # voile de couleur : polygone ∩ terre (le polygone déborde un peu en mer, c'est voulu pour le toucher)
    land_big = Image.fromarray((land * 255).astype(np.uint8)).resize((MAPW, MAPW), Image.BILINEAR)
    land_big = land_big.filter(ImageFilter.MaxFilter(5))
    fill = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    fd = ImageDraw.Draw(fill)
    for p in data['provinces']:
        c = hex2rgb(nat[p['nation']]['color'])
        fd.polygon([T(x, y) for x, y in p['polygon']], fill=c + (92,))
    a = np.array(fill.split()[3])
    a[HEAD:HEAD + MAPW] = (a[HEAD:HEAD + MAPW].astype(np.uint16) * np.array(land_big) // 255).astype(np.uint8)
    fill.putalpha(Image.fromarray(a))
    canvas = Image.alpha_composite(canvas.convert('RGBA'), fill)

    # segments partagés (frontières terrestres) vs côtes
    seg_count = {}
    for p in data['provinces']:
        pts = [tuple(q) for q in p['polygon']]
        for k in range(len(pts)):
            e = frozenset((pts[k], pts[(k + 1) % len(pts)]))
            seg_count[e] = seg_count.get(e, 0) + 1
    lines = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(lines)
    for p in data['provinces']:  # contour complet discret (zone tactile)
        pts = [T(x, y) for x, y in p['polygon']]
        pts.append(pts[0])
        c = hex2rgb(nat[p['nation']]['color'])
        ld.line(pts, fill=c + (150,), width=2 * SS, joint='curve')
    for e, n in seg_count.items():  # frontières entre provinces : nettes
        if n < 2:
            continue
        a_, b_ = [T(*q) for q in e]
        ld.line([a_, b_], fill=(12, 14, 20, 240), width=6 * SS)
    for e, n in seg_count.items():
        if n < 2:
            continue
        a_, b_ = [T(*q) for q in e]
        ld.line([a_, b_], fill=(255, 250, 235, 255), width=2 * SS)
    # jointures arrondies
    for e, n in seg_count.items():
        if n < 2:
            continue
        for q in e:
            x, y = T(*q)
            ld.ellipse([x - 1.2 * SS, y - 1.2 * SS, x + 1.2 * SS, y + 1.2 * SS], fill=(255, 250, 235, 255))
    canvas = Image.alpha_composite(canvas, lines)

    # routes maritimes (pointillés blancs)
    rt = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(rt)
    byid = {p['id']: p for p in data['provinces']}
    for r in data['seaRoutes']:
        pts = [T(*byid[r['from']]['port']['anchor'])] + [T(*w) for w in r['waypoints']] + \
              [T(*byid[r['to']]['port']['anchor'])]
        dash, gap = 14 * SS, 9 * SS
        segs, phase = [], 0.0  # pointillés continus le long de la polyligne
        for a, b in zip(pts, pts[1:]):
            L = math.dist(a, b)
            t = 0.0
            while t < L:
                pos = (phase + t) % (dash + gap)
                if pos < dash:
                    t2 = min(L, t + dash - pos)
                    segs.append(((a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L),
                                 (a[0] + (b[0] - a[0]) * t2 / L, a[1] + (b[1] - a[1]) * t2 / L)))
                    t = t2
                else:
                    t = min(L, t + dash + gap - pos)
            phase = (phase + L) % (dash + gap)
        for pa, pb in segs:
            rd.line([pa, pb], fill=(15, 25, 40, 150), width=7 * SS)
        for pa, pb in segs:
            rd.line([pa, pb], fill=(255, 255, 255, 240), width=3 * SS)
    canvas = Image.alpha_composite(canvas, rt)

    d = ImageDraw.Draw(canvas)
    f_anchor = ImageFont.truetype(FONT_BOLD, 19 * SS)
    for p in data['provinces']:
        if not p['port']:
            continue
        x, y = T(*p['port']['anchor'])
        r = 15 * SS
        d.ellipse([x - r, y - r, x + r, y + r], fill=(20, 32, 52), outline=(255, 255, 255), width=2 * SS)
        d.text((x, y + SS), '⚓', font=f_anchor, fill=(255, 255, 255), anchor='mm')

    f_name = ImageFont.truetype(FONT_BOLD, 21 * SS)
    f_id = ImageFont.truetype(FONT_BOLD, 13 * SS)
    for p in data['provinces']:
        x, y = T(*p['center'])
        d.text((x, y - 3 * SS), p['name'], font=f_name, fill=(255, 255, 255), anchor='ms',
               stroke_width=3 * SS, stroke_fill=(10, 12, 18))
        d.text((x, y + 2 * SS), p['id'], font=f_id, fill=(235, 235, 235), anchor='mt',
               stroke_width=2 * SS, stroke_fill=(10, 12, 18))

    # en-tête
    f_t = ImageFont.truetype(FONT_BOLD, 34 * SS)
    f_s = ImageFont.truetype(FONT_REG, 19 * SS)
    d.text((MAPW // 2, 44 * SS), 'FRONTIÈRES : ARKEN — carte V9', font=f_t, fill=(255, 255, 255), anchor='mm')
    d.text((MAPW // 2, 88 * SS), '20 provinces · 5 nations · 4 provinces par île · proposition à valider',
           font=f_s, fill=(190, 205, 225), anchor='mm')
    # légende
    y0 = HEAD + MAPW + 22 * SS
    f_l = ImageFont.truetype(FONT_BOLD, 22 * SS)
    f_l2 = ImageFont.truetype(FONT_REG, 18 * SS)
    cols = [(40 * SS, y0), (40 * SS + MAPW // 2, y0), (40 * SS, y0 + 46 * SS), (40 * SS + MAPW // 2, y0 + 46 * SS),
            (40 * SS, y0 + 92 * SS)]
    for (x, y), n in zip(cols, data['nations']):
        c = hex2rgb(n['color'])
        d.rounded_rectangle([x, y, x + 30 * SS, y + 30 * SS], radius=6 * SS, fill=c, outline=(255, 255, 255), width=SS)
        d.text((x + 42 * SS, y + 15 * SS), n['short'], font=f_l, fill=(255, 255, 255), anchor='lm')
        isl = next(i for i in data['islands'] if i['nation'] == n['id'])
        tw = d.textlength(n['short'], font=f_l)
        d.text((x + 52 * SS + tw, y + 16 * SS), '· ' + isl['id'].replace('ile-', 'île ').replace('-', ' '),
               font=f_l2, fill=(170, 185, 205), anchor='lm')
    x, y = 40 * SS + MAPW // 2, y0 + 92 * SS
    r = 14 * SS
    d.ellipse([x, y + 1 * SS, x + 2 * r, y + 1 * SS + 2 * r], fill=(20, 32, 52), outline=(255, 255, 255), width=2 * SS)
    d.text((x + r, y + r + 2 * SS), '⚓', font=ImageFont.truetype(FONT_BOLD, 18 * SS), fill=(255, 255, 255), anchor='mm')
    d.text((x + 42 * SS, y + 15 * SS), 'port', font=f_l2, fill=(255, 255, 255), anchor='lm')
    xx = x + 110 * SS
    for k in range(3):
        d.line([(xx + k * 24 * SS, y + 15 * SS), (xx + k * 24 * SS + 14 * SS, y + 15 * SS)], fill=(255, 255, 255), width=3 * SS)
    d.text((xx + 80 * SS, y + 15 * SS), 'route maritime', font=f_l2, fill=(255, 255, 255), anchor='lm')
    d.text((MAPW // 2, y0 + 158 * SS), 'Frontières de provinces calées sur les frontières peintes de la carte Leonardo',
           font=ImageFont.truetype(FONT_REG, 15 * SS), fill=(140, 155, 175), anchor='mm')

    out = canvas.convert('RGB').resize((OUTW, canvas.size[1] // SS), Image.LANCZOS)
    out.save(OUT_PNG, optimize=True)


if __name__ == '__main__':
    main()
