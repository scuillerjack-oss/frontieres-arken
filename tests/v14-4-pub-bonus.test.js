// V14.4 — Pub bonus facultative et illimitée (validée par Jack le 31/10/2026) : 1 jeton toutes les 3 pubs regardées en entier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createProfile, sanitizeProfile, recordBonusAd, BONUS_ADS_PER_TOKEN, importProfile, exportProfile } from '../src/domain/profile.js';
import { boostScreenHtml } from '../src/presentation/v12-ux.js';

test('pub bonus : 1 jeton toutes les 3 pubs, sans limite', () => {
  const p = createProfile();
  assert.equal(BONUS_ADS_PER_TOKEN, 3);
  let tokens = 0;
  for (let i = 1; i <= 30; i++) { const r = recordBonusAd(p); tokens += r.tokens; assert.equal(r.progress, i % 3); }
  assert.equal(tokens, 10); assert.equal(p.tokens, 10); assert.equal(p.earned.bonus, 10); assert.equal(p.bonusAds, 0);
});

test('pub bonus : progression conservée par la sauvegarde et l’export, ancien profil sans le champ accepté', () => {
  const p = createProfile(); recordBonusAd(p); recordBonusAd(p);
  assert.equal(sanitizeProfile(JSON.parse(JSON.stringify(p))).bonusAds, 2);
  assert.equal(importProfile(exportProfile(p)).profile?.bonusAds ?? importProfile(exportProfile(p)).bonusAds, 2);
  const old = createProfile(); delete old.bonusAds; delete old.earned.bonus; old.tokens = 4;
  const s = sanitizeProfile(old); assert.equal(s.bonusAds, 0); assert.equal(s.tokens, 4); assert.equal(s.earned.bonus, 0);
  assert.equal(sanitizeProfile({ ...createProfile(), bonusAds: 99 }).bonusAds, 2, 'valeur trafiquée bornée');
});

test('pub bonus : visible dans Atouts & missions, même avec le Pack débutant (elle reste facultative)', () => {
  const p = createProfile(); recordBonusAd(p);
  const html = boostScreenHtml(p, '2026-11-01');
  assert.match(html, /data-bonus-ad/); assert.match(html, /1\/3/);
  p.starterPack = true; p.adsRemoved = true;
  assert.match(boostScreenHtml(p, '2026-11-01'), /data-bonus-ad/);
});

test('pub bonus : jamais pendant le tutoriel, rien de gagné si la pub est fermée avant la fin', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const handler = app.slice(app.indexOf("$('[data-bonus-ad]')"), app.indexOf("$('#copyProfile')"));
  assert.match(handler, /tutoStep!==null\)return toast/);
  assert.ok(handler.indexOf('if(!r.rewarded)') < handler.indexOf('recordBonusAd('), 'le jeton n’est compté qu’après une pub regardée en entier');
});
