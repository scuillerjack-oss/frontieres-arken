// V12 — Modèle économique : profil hors partie, atouts, missions journalières, achats simulés, règle d'or.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveBattle } from '../src/domain/combat.js';
import { incomeFor, queueConstruction, queueMoveOrder, queueRecruitment, queueDiplomaticOrder, resolveInterturn } from '../src/domain/game-engine.js';
import { encodeSave, decodeSave } from '../src/persistence/save-codec.js';
import { BOOST_KEYS, bonusPct, buildTurnsGained, setPlayerBonuses, recruitPreview } from '../src/domain/boosts.js';
import {
  createProfile, encodeProfile, decodeProfile, exportProfile, importProfile, upgradeBoost, canUpgradeBoost, boostCost,
  dailyMissions, isAdDay, missionStatus, addMissionProgress, recordAdWatched, missionDeltas, applyPurchase, canPurchase,
  PRODUCTS, ALLOWED_GRANTS, MISSION_CATALOG
} from '../src/domain/profile.js';
import { loadProfile, saveProfile, todayLocal, PROFILE_KEY } from '../src/presentation/profile-storage.js';
import { storeItems, purchase, BILLING_ENABLED } from '../src/presentation/store.js';
import { ADS_ENABLED, shouldShowGameStartAd, showGameStartAd } from '../src/presentation/ads.js';
import { SAVE_KEY } from '../src/presentation/v4-ux.js';
import { freshState, NATIONS } from './helpers/fixtures.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const memoryStorage = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), map: m }; };
const maxed = () => Object.fromEntries(BOOST_KEYS.map(k => [k, 10]));
const dates = n => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 0, 1 + i)); return d.toISOString().slice(0, 10); });

// --- Profil -----------------------------------------------------------------------------------------------------
test('V12 profil : aller-retour sans perte (jetons, atouts, missions, Pack, achats) et clé dédiée distincte de la partie', () => {
  const p = createProfile();
  p.tokens = 4; p.boosts.recruit = 3; p.boosts.naval = 10;
  applyPurchase(p, { productId: 'pack_debutant', orderId: 'TEST-1', date: '2026-10-16' });
  addMissionProgress(p, '2026-10-16', { infantry: 40, turns: 2 });
  const back = decodeProfile(encodeProfile(p));
  assert.deepEqual(back, p);
  assert.equal(PROFILE_KEY, 'frontieres-arken-profil');
  assert.notEqual(PROFILE_KEY, SAVE_KEY);
  const storage = memoryStorage();
  assert.equal(saveProfile(p, storage), true);
  assert.deepEqual(loadProfile(storage), p);
  assert.deepEqual([...storage.map.keys()], [PROFILE_KEY]);
});

test('V12 profil : corruption tolérée (texte illisible, champs absurdes, stockage qui lève une exception)', () => {
  assert.deepEqual(decodeProfile('{pas du json'), createProfile());
  assert.deepEqual(decodeProfile(''), createProfile());
  assert.deepEqual(decodeProfile('null'), createProfile());
  const weird = decodeProfile(JSON.stringify({ tokens: -5, boosts: { gold: 99, recruit: 'x', inconnu: 4 }, purchases: [{ productId: 'or_infini' }, 3], daily: { date: 'hier', progress: { turns: -2 } } }));
  assert.equal(weird.tokens, 0);
  assert.deepEqual(weird.boosts, { gold: 10, recruit: 0, build: 0, fort: 0, naval: 0 });
  assert.deepEqual(weird.purchases, []);
  assert.equal(weird.daily.date, null);
  const broken = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('plein'); } };
  assert.deepEqual(loadProfile(broken), createProfile());
  assert.equal(saveProfile(createProfile(), broken), false);
});

test('V12 profil : export « Copier mon profil » / « Restaurer » fidèle, texte étranger refusé', () => {
  const p = createProfile(); p.tokens = 7; p.boosts.gold = 2;
  const text = exportProfile(p);
  assert.match(text, /^ARKEN-PROFIL-1:/);
  const r = importProfile(`  ${text}\n`);
  assert.equal(r.ok, true); assert.deepEqual(r.profile, p);
  assert.equal(importProfile('bonjour').ok, false);
  assert.equal(importProfile('ARKEN-PROFIL-1:@@@').ok, false);
});

test('V12 : date locale AAAA-MM-JJ fournie par l\'interface', () => {
  assert.equal(todayLocal(new Date(2026, 9, 6, 23, 59)), '2026-10-06');
  assert.equal(todayLocal(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

// --- Atouts -----------------------------------------------------------------------------------------------------
test('V12 atouts : coût FIXE de 1 jeton par niveau, plafond à 10 (+10 %), 50 jetons pour tout maximiser', () => {
  const p = createProfile(); p.tokens = 60;
  for (const k of BOOST_KEYS) for (let lvl = 1; lvl <= 10; lvl++) { assert.equal(boostCost(k, lvl), 1); const r = upgradeBoost(p, k); assert.equal(r.ok, true); assert.equal(r.level, lvl); }
  assert.equal(p.tokens, 10, '50 jetons dépensés');
  for (const k of BOOST_KEYS) assert.deepEqual(upgradeBoost(p, k), { ok: false, error: 'Niveau maximum atteint (+10 %)' });
  assert.equal(p.tokens, 10);
  const poor = createProfile();
  assert.equal(canUpgradeBoost(poor, 'gold').ok, false);
  assert.equal(upgradeBoost(poor, 'inconnu').ok, false);
});

test('V12 atouts : bonus pour le SEUL joueur humain (les IA et les autres nations n\'en ont jamais)', () => {
  const s = freshState();
  setPlayerBonuses(s, maxed());
  for (const k of BOOST_KEYS) assert.equal(bonusPct(s, 'valmorne', k), 10);
  for (const id of NATIONS.filter(id => id !== 'valmorne')) for (const k of BOOST_KEYS) assert.equal(bonusPct(s, id, k), 0);
  s.bonuses.noireflamme = maxed(); // même injecté à la main, une IA n'en profite pas
  assert.equal(bonusPct(s, 'noireflamme', 'gold'), 0);
});

test('V12 atout Recrutement : 100 fantassins commandés → 110 livrés au niveau 10 (joueur seulement)', () => {
  const run = (levels, nationId = 'valmorne', provinceId) => {
    const s = freshState({ allHuman: true });
    setPlayerBonuses(s, levels);
    const pid = provinceId || Object.keys(s.provinces).find(id => s.provinces[id].ownerId === nationId);
    const before = s.provinces[pid].units.infantry;
    assert.equal(queueRecruitment(s, { nationId, provinceId: pid, type: 'infantry', lots: 5 }).amount, 100);
    resolveInterturn(s, { ...map() });
    return { gained: s.provinces[pid].units.infantry - before, s };
  };
  assert.equal(run({}).gained, 100);
  const top = run({ recruit: 10 });
  assert.equal(top.gained, 110);
  assert.ok(top.s.events.some(e => e.type === 'production-complete' && e.bonus === 10));
  assert.equal(run({ recruit: 5 }).gained, 105);
  assert.equal(run({ recruit: 10 }, 'noireflamme').gained, 100, 'une IA ne reçoit rien');
  const s = freshState(); setPlayerBonuses(s, { recruit: 10 });
  assert.equal(recruitPreview(s, 'valmorne', 'infantry', 100), 110);
  assert.equal(recruitPreview(s, 'valmorne', 'cavalry', 10), 10, 'infanterie seulement');
});

test('V12 atout Or : +10 % exact des gains de chaque tour, cumulé sans perte d\'arrondi', () => {
  const play = levels => { const s = freshState({ allHuman: true }); setPlayerBonuses(s, levels); const income = incomeFor(s, 'valmorne'); const t0 = s.nations.valmorne.treasury, o0 = s.nations.noireflamme.treasury;
    for (let i = 0; i < 10; i++) resolveInterturn(s, map()); return { gain: s.nations.valmorne.treasury - t0, other: s.nations.noireflamme.treasury - o0, income }; };
  const base = play({}), boosted = play({ gold: 10 });
  assert.equal(base.gain, base.income * 10);
  assert.equal(boosted.gain, base.gain + Math.floor(base.income * 10 * 10 / 100));
  assert.equal(boosted.other, base.other, 'les autres nations ne gagnent rien de plus');
});

test('V12 atout Construction : +10 % de vitesse = 1 tour de chantier gagné toutes les 10 étapes de chantier', () => {
  const s = freshState(); setPlayerBonuses(s, { build: 10 });
  let gained = 0; for (let i = 0; i < 10; i++) gained += buildTurnsGained(s, 'valmorne', 1);
  assert.equal(gained, 1);
  assert.equal(buildTurnsGained(s, 'noireflamme', 50), 0);
  // Dans le moteur : avec un crédit déjà à 90 %, la banque (3 tours) est livrée un tour plus tôt.
  const finishTurn = (levels, credit) => { const g = freshState({ allHuman: true }); setPlayerBonuses(g, levels); if (credit) g.boostCredit.valmorne = { build: credit };
    const pid = Object.keys(g.provinces).find(id => g.provinces[id].ownerId === 'valmorne');
    assert.equal(queueConstruction(g, { nationId: 'valmorne', provinceId: pid, type: 'bank' }).ok, true);
    for (let t = 1; t <= 5; t++) { resolveInterturn(g, map()); if (g.provinces[pid].buildings.bank) return t; } return null; };
  assert.equal(finishTurn({}, 0), 3);
  assert.equal(finishTurn({ build: 10 }, 90), 2);
});

test('V12 atout Défense : un fort du joueur protège 10 % de plus au niveau 10 (dégâts reçus ÷ 1,1 × 1,1)', () => {
  const garrison = { units: { infantry: 400 } }, attacker = { units: { infantry: 400 } };
  const plain = resolveBattle({ defender: garrison, attackers: [{ id: 'a', force: attacker }], fortLevel: 1, passes: 1 });
  const boosted = resolveBattle({ defender: garrison, attackers: [{ id: 'a', force: attacker }], fortLevel: 1, passes: 1, fortBonus: 1.1 });
  assert.equal(plain.defenderHpLost, Math.round(400 * 5 / 1.1));
  assert.equal(boosted.defenderHpLost, Math.round(400 * 5 / (1.1 * 1.1)));
  const noFort = resolveBattle({ defender: garrison, attackers: [{ id: 'a', force: attacker }], fortLevel: 0, passes: 1, fortBonus: 1.1 });
  assert.equal(noFort.defenderHpLost, 2000, 'sans fort, l\'atout n\'a pas d\'effet');
  // Dans le moteur : une attaque ennemie contre une province fortifiée du joueur.
  const attack = levels => { const s = freshState({ allHuman: true }); setPlayerBonuses(s, levels);
    const def = map().provinces.find(p => s.provinces[p.id].ownerId === 'valmorne' && p.landConnections.some(n => s.provinces[n].ownerId !== 'valmorne'));
    const target = def.id, from = def.landConnections.find(n => s.provinces[n].ownerId !== 'valmorne'), enemy = s.provinces[from].ownerId;
    s.provinces[target].buildings.fort = 2; s.provinces[target].units.infantry = 400; s.provinces[from].units.infantry = 300;
    assert.equal(queueMoveOrder(s, map(), { nationId: enemy, fromId: from, toId: target, units: { infantry: 300 } }).ok, true);
    resolveInterturn(s, map());
    return s.events.find(e => (e.type === 'battle' || e.type === 'conquest') && e.provinceId === target).defenderHpLost; };
  const a = attack({}), b = attack({ fort: 10 });
  assert.ok(b < a, `dégâts reçus ${b} < ${a}`);
});

test('V12 atout Marine : les navires du joueur font +10 % de dégâts au niveau 10, et ceux de l\'IA non', () => {
  const fleet = n => ({ units: { warship: n } });
  const base = resolveBattle({ defender: fleet(3), attackers: [{ id: 'a', force: fleet(1) }], naval: true, passes: 1 });
  const boosted = resolveBattle({ defender: fleet(3), attackers: [{ id: 'a', force: fleet(1), warshipFactor: 1.1 }], naval: true, passes: 1 });
  assert.equal(base.defenderHpLost, 260);
  assert.equal(boosted.defenderHpLost, 286);
  const defended = resolveBattle({ defender: fleet(1), attackers: [{ id: 'a', force: fleet(1) }], naval: true, passes: 1, defenderWarshipFactor: 1.1 });
  assert.equal(defended.attackers[0].hpLost, 286);
  assert.equal(defended.defenderHpLost, 260);
});

test('V12 : sans atouts, le moteur reste identique et déterministe ; les atouts survivent à la sauvegarde', () => {
  const a = freshState({ seed: 'v12' }), b = freshState({ seed: 'v12' });
  setPlayerBonuses(b, {});
  for (let i = 0; i < 6; i++) { resolveInterturn(a, map()); resolveInterturn(b, map()); }
  assert.deepEqual(a.provinces, b.provinces);
  assert.deepEqual(a.nations, b.nations);
  const c = freshState({ seed: 'v12' }); setPlayerBonuses(c, maxed());
  const d = decodeSave(encodeSave(c));
  assert.deepEqual(d.bonuses, c.bonuses);
  for (let i = 0; i < 6; i++) { resolveInterturn(c, map()); resolveInterturn(d, map()); }
  assert.deepEqual(c.provinces, d.provinces, 'même suite après rechargement');
});

// --- Missions ---------------------------------------------------------------------------------------------------
test('V12 missions : 5 par jour, déterministes selon la date, sans doublon de type', () => {
  for (const date of dates(120)) {
    const m = dailyMissions(date);
    assert.equal(m.length, 5, date);
    assert.deepEqual(dailyMissions(date), m);
    assert.equal(new Set(m.map(x => x.group)).size, 5);
    assert.equal(m.filter(x => x.ad).length, isAdDay(date) ? 1 : 0);
    if (isAdDay(date)) assert.equal(m[4].id, 'publicite', 'la 5e est la mission publicité');
  }
  const distinct = new Set(dates(30).map(d => dailyMissions(d).map(x => x.id).join(',')));
  assert.ok(distinct.size > 10, 'les missions changent d\'un jour à l\'autre');
  for (const m of MISSION_CATALOG) assert.ok(m.target > 0 && m.target <= 100, 'missions faciles');
});

test('V12 missions : la mission publicité tombe environ 7 jours sur 10 (sur un an)', () => {
  const all = dates(365), ad = all.filter(isAdDay).length / all.length;
  assert.ok(ad > 0.62 && ad < 0.78, `taux ${ad}`);
});

test('V12 missions : 5/5 = 1 jeton, une seule fois par jour ; progression cumulée sur les parties du jour', () => {
  const date = '2026-10-16', p = createProfile();
  const missions = dailyMissions(date);
  const half = Object.fromEntries(missions.map(m => [m.metric, Math.ceil(m.target / 2)]));
  addMissionProgress(p, date, half); // 1re partie du jour
  assert.equal(p.tokens, 0);
  const second = addMissionProgress(p, date, half); // 2e partie du même jour
  assert.equal(second.tokens, 1);
  assert.equal(p.tokens, 1);
  assert.equal(missionStatus(p, date).done, 5);
  assert.equal(addMissionProgress(p, date, half).tokens, 0, 'pas de 2e jeton le même jour');
  assert.equal(p.tokens, 1);
  // Lendemain : tout recommence.
  const next = '2026-10-17';
  assert.equal(missionStatus(p, next).done, 0);
  const full = Object.fromEntries(dailyMissions(next).map(m => [m.metric, m.target]));
  assert.equal(addMissionProgress(p, next, full).tokens, 1);
  assert.equal(p.tokens, 2);
  // Retour en arrière sur un jour déjà récompensé (horloge changée) : pas de nouveau jeton.
  assert.equal(addMissionProgress(p, date, Object.fromEntries(missions.map(m => [m.metric, m.target]))).tokens, 0);
});

test('V12 missions : la publicité de mission se compte via recordAdWatched', () => {
  const date = dates(60).find(isAdDay), p = createProfile();
  assert.equal(missionStatus(p, date).missions.find(m => m.ad).done, false);
  recordAdWatched(p, date);
  assert.equal(missionStatus(p, date).missions.find(m => m.ad).done, true);
});

test('V12 missions : les compteurs viennent des événements réels du moteur (recrutement, construction, tour, message)', () => {
  const s = freshState({ allHuman: true });
  const pid = Object.keys(s.provinces).find(id => s.provinces[id].ownerId === 'valmorne');
  queueRecruitment(s, { nationId: 'valmorne', provinceId: pid, type: 'infantry', lots: 3 });
  queueConstruction(s, { nationId: 'valmorne', provinceId: pid, type: 'fort' });
  queueDiplomaticOrder(s, { nationId: 'valmorne', target: 'aurel', action: 'alliance' });
  queueRecruitment(s, { nationId: 'noireflamme', provinceId: Object.keys(s.provinces).find(id => s.provinces[id].ownerId === 'noireflamme'), type: 'infantry', lots: 1 });
  const from = s.events.length;
  resolveInterturn(s, map());
  const d = missionDeltas(s.events.slice(from), 'valmorne');
  assert.equal(d.infantry, 60, 'seulement les recrues du joueur');
  assert.equal(d.build, 1);
  assert.equal(d.turns, 1);
  assert.equal(d.message, 1);
  assert.equal(missionDeltas([{ type: 'conquest', newOwnerId: 'valmorne' }, { type: 'conquest', newOwnerId: 'aurel' }, { type: 'battle', defender: 'valmorne' }], 'valmorne').conquer, 1);
  assert.equal(missionDeltas([{ type: 'conquest', newOwnerId: 'valmorne' }, { type: 'battle', defender: 'valmorne' }], 'valmorne').win, 2);
});

// --- Achats et publicités -----------------------------------------------------------------------------------------
test('V12 règle d\'or : aucun produit ni aucune fonction d\'achat ne donne d\'or ou de troupes', () => {
  for (const p of PRODUCTS) for (const k of Object.keys(p.grants)) assert.ok(ALLOWED_GRANTS.includes(k), `${p.id} donne ${k}`);
  const s = freshState(), snapshot = JSON.stringify(s);
  const profile = createProfile();
  for (const p of PRODUCTS) applyPurchase(profile, { productId: p.id, orderId: `o-${p.id}` });
  assert.equal(JSON.stringify(s), snapshot, 'la partie est intacte');
  assert.deepEqual(Object.keys(profile).sort(), Object.keys(createProfile()).sort(), 'aucun champ or/troupes dans le profil');
  // Les modules d'achat et de pub ne touchent jamais au trésor ni aux unités.
  for (const f of ['src/domain/profile.js', 'src/presentation/store.js', 'src/presentation/ads.js', 'src/presentation/profile-storage.js']) {
    const code = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /treasury|\.units\b|warships|productionQueue|nations\[/, f);
  }
  // Les atouts ne sont que des pourcentages bornés (pas de montant fixe d'or ou de troupes).
  assert.doesNotMatch(read('src/domain/boosts.js').replace(/\/\/.*$/gm, ''), /treasury|\.units\[/);
});

test('V12 achats : Pack débutant (sans pub + 3 jetons, une seule fois), jetons à l\'unité et par lots, idempotence', async () => {
  assert.equal(BILLING_ENABLED, false);
  const p = createProfile();
  assert.equal(shouldShowGameStartAd(p), true);
  const r = await purchase(p, 'pack_debutant', { date: '2026-10-16' });
  assert.equal(r.ok, true); assert.equal(p.tokens, 3); assert.equal(p.adsRemoved, true); assert.equal(p.starterPack, true);
  assert.equal(p.purchases[0].test, true);
  assert.equal(shouldShowGameStartAd(p), false);
  assert.equal((await purchase(p, 'pack_debutant')).ok, false, 'achat unique');
  assert.equal(storeItems(p).find(x => x.id === 'pack_debutant').available, false);
  assert.ok(storeItems(p).every(x => x.test && /test/i.test(x.price)));
  await purchase(p, 'jetons_1'); await purchase(p, 'jetons_5'); await purchase(p, 'jetons_12');
  assert.equal(p.tokens, 3 + 1 + 5 + 12);
  assert.equal(applyPurchase(p, { productId: 'jetons_5', orderId: p.purchases[1].orderId }).duplicate, true, 'même commande Google Play = pas de doublon');
  assert.equal(p.tokens, 21);
  assert.equal(canPurchase(p, 'or_1000').ok, false);
});

test('V12 publicités : aucune vraie pub (ADS_ENABLED=false), pas de pub au début de partie avec le Pack', async () => {
  assert.equal(ADS_ENABLED, false);
  const pack = createProfile(); applyPurchase(pack, { productId: 'pack_debutant', orderId: 'x' });
  assert.deepEqual(await showGameStartAd({ profile: pack, doc: null }), { shown: false, skipped: 'pack' });
  const plain = await showGameStartAd({ profile: createProfile(), doc: null, ms: 1 });
  assert.equal(plain.shown, false, 'sans document, rien ne bloque le jeu');
  const ads = read('src/presentation/ads.js');
  assert.match(ads, /emplacement de test/i);
  assert.doesNotMatch(ads.replace(/\/\/.*$/gm, ''), /https?:\/\//, 'aucun appel réseau');
});

function map() { return mapRef; }
import { map as mapRef } from './helpers/fixtures.js';

// --- Interface ------------------------------------------------------------------------------------------------------
import { boostScreenHtml } from '../src/presentation/v12-ux.js';
test('V12 interface : écran Atouts & missions (jetons, 5 atouts, missions du jour, Pack, achat de test clairement marqué)', () => {
  const p = createProfile(); p.tokens = 2; p.boosts.recruit = 10;
  const html = boostScreenHtml(p, '2026-10-16');
  for (const k of BOOST_KEYS) assert.match(html, new RegExp(`data-boost="${k}"`));
  assert.match(html, /data-boost="recruit" disabled/, 'atout au maximum : bouton désactivé');
  assert.equal((html.match(/data-mission=/g) || []).length, 5);
  assert.match(html, /Achat de test \(gratuit\)/);
  assert.match(html, /AUCUN PAIEMENT/);
  assert.match(html, /Copier mon profil/); assert.match(html, /Restaurer/);
  applyPurchase(p, { productId: 'pack_debutant', orderId: 'x' });
  assert.match(boostScreenHtml(p, '2026-10-16'), /Pack débutant actif/);
  const index = read('index.html');
  for (const id of ['welcomeBoosts', 'boostBtn', 'boostDialog', 'settingsBoosts']) assert.match(index, new RegExp(`id="${id}"`));
  for (const f of ['./src/domain/boosts.js', './src/domain/profile.js', './src/presentation/ads.js', './src/presentation/store.js', './src/presentation/profile-storage.js', './src/presentation/v12-ux.js'])
    assert.ok(read('sw.js').includes(`'${f}'`), f);
  assert.match(JSON.parse(read('package.json')).version, /^1[2-9]\./);
});
