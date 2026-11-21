// V17.7 — Fiche de rentabilité du temps réel : la simulation tourne, résultats positifs et ordonnés, 0 € de coût de
// fonctionnement, mêmes règles que le jeu (RULES.realtime.ads / .premium), fiche docs/RENTABILITE-ARKEN.md à jour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  rapport, simuler, SCENARIOS, COUT_FONCTIONNEMENT_MENSUEL, PRIX, MINUTES_ENTRE_PUBS_IMPOSEES, MINUTES_ENTRE_PUBS_RECOMPENSEES, joueursPour
} from '../tools/v17/economie-v17.mjs';
import { RULES } from '../src/domain/constants.js';
import { root } from './helpers/sources.js';

test('V17.7 rentabilité : déterministe, résultats positifs, haut > central > bas, toutes les sources comptées', () => {
  const a = rapport(), b = rapport();
  assert.deepEqual(a, b);
  const { bas, central, haut } = a.scenarios;
  for (const s of [bas, central, haut]) {
    for (const k of ['pubsImposees', 'pubsRecomp', 'achatsPremium', 'achatsJetons', 'net']) assert.ok(s[k] > 0, k);
    assert.ok(Math.abs(s.pubsImposees + s.pubsRecomp + s.achatsPremium + s.achatsJetons - s.net) < 1e-9, 'net = somme des sources (coût 0)');
    assert.ok(s.netApresCotisations < s.net && s.netApresCotisations > 0);
  }
  assert.ok(haut.net > central.net && central.net > bas.net);
  // Chiffres publiés dans le cahier (§10.4) et la fiche : 184 / 856 / 4 074 € nets pour 10 000 joueurs.
  assert.deepEqual([bas, central, haut].map(s => Math.round(s.net)), [184, 856, 4074]);
});

test('V17.7 rentabilité : 0 € de coût, seuil de rentabilité = 1 joueur, objectifs croissants', () => {
  assert.equal(COUT_FONCTIONNEMENT_MENSUEL, 0);
  const r = rapport();
  for (const n of Object.keys(SCENARIOS)) {
    assert.ok(simuler(SCENARIOS[n], 1).net > 0);
    assert.equal(r.seuil[n].joueurs, 1);
    const o = r.objectifs[n]; assert.ok(o[100] < o[500] && o[500] < o[1000]);
    assert.equal(o[1000], joueursPour(SCENARIOS[n], 1000));
  }
});

test('V17.7 rentabilité : mêmes règles que le jeu (cadence des pubs, prix du Premium et du Pack)', () => {
  const ads = RULES.realtime.ads, premium = RULES.realtime.premium;
  assert.equal(MINUTES_ENTRE_PUBS_IMPOSEES, ads.forcedEveryMinutes);
  assert.equal(MINUTES_ENTRE_PUBS_IMPOSEES, 10);
  assert.equal(MINUTES_ENTRE_PUBS_RECOMPENSEES, (ads.rewardedMinMinutes + ads.rewardedMaxMinutes) / 2);
  assert.equal(PRIX.premium, 1.99); assert.equal(PRIX.premium, premium.priceEur);
  assert.equal(PRIX.pack_debutant, 2.99); assert.equal(PRIX.pack_debutant, premium.starterPackEur);
  assert.ok(rapport().netPremium > 1.3 && rapport().netPremium < 1.5, 'Premium ~1,41 € net (TVA 20 %, Google 15 %)');
  // Le Premium coupe les pubs imposées : un acheteur ne compte plus dans les pubs imposées.
  const sans = simuler({ ...SCENARIOS.central, convPremium: 0, convPack: 0 });
  assert.ok(sans.pubsImposeesParJoueurNonPremium > 0 && sans.achatsPremium === 0);
});

test('V17.7 rentabilité : fiche docs/RENTABILITE-ARKEN.md à jour (3 scénarios, seuil, coût 0, monétisation codée)', () => {
  const fiche = readFileSync(join(root, 'docs/RENTABILITE-ARKEN.md'), 'utf8');
  const v177 = fiche.slice(fiche.indexOf('## V17.7'));
  assert.ok(fiche.includes('## V17.7'), 'section V17.7');
  for (const x of ['184 €', '856 €', '4 074 €', 'Seuil de rentabilité', '1 joueur', '0 €', 'node tools/v17/economie-v17.mjs', '1,99 €', '2,99 €']) assert.ok(v177.includes(x), x);
  assert.doesNotMatch(v177, /rien n'est encore codé/);
});
