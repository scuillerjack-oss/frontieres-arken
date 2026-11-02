// Interface — V15.2 : animation entre deux tours. Elle ne décide de rien : elle joue un plan (turn-animation.js), puis rend la main.
//
// Elle ne peut pas bloquer la partie : une seule minuterie (plan.total, jamais plus de MAX_ANIMATION_MS) la termine, un toucher la
// termine, passer en arrière-plan la termine, et aucune de ces fins n'attend quoi que ce soit. Toucher ne relance rien.

import { arkenV9Map as map } from '../../map/arken-v9-map.js';
import { wholeMapView } from '../launch-view.js';
import { MAX_ANIMATION_MS, planTurnAnimation, soundCues } from '../turn-animation.js';
import { playSfx } from './audio.js';
import { $, E, nation, province } from './base.js';
import { clampTransform, minZoom, scale, setScale, setTx, setTy, tx, ty, updateLabelScale } from './map-view.js';
import { state } from './session.js';

export const reducedMotion = () => { try { return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };
let finishCurrent = null;
export const turnAnimating = () => finishCurrent !== null;
/** Termine l'animation en cours, s'il y en a une. Renvoie true si c'était le cas. */
export function skipTurnAnimation() { if (!finishCurrent) return false; finishCurrent(); return true; }

const color = id => nation(id).color || '#f7f0df';
const points = id => province(id).geometry.points.map(x => x.join(',')).join(' ');
const path = list => list.map(p => `${Math.round(p.x)}px ${Math.round(p.y)}px`);
function animate(node, frames, options) { try { return node.animate?.(frames, { fill: 'both', ...options }) || null; } catch { return null; } }

function drawRoute(layer, route, duration) {
  const token = E('circle', { class: 'anim-token', r: route.mine ? 30 : 24, cx: 0, cy: 0, fill: color(route.nationId) });
  layer.append(token);
  const stops = path(route.points);
  return animate(token, stops.map((p, i) => ({ transform: `translate(${p})`, opacity: i === 0 ? .2 : 1 })), { duration, easing: 'ease-in-out' });
}
function drawEffect(layer, step) {
  if (!step.provinceId) return [];
  const at = province(step.provinceId).markerAnchor, tint = color(step.nationId), done = [], options = { duration: step.duration, delay: step.at, easing: 'ease-out' };
  if (step.kind === 'conquest') {
    const area = E('polygon', { class: 'anim-area', points: points(step.provinceId), fill: tint });
    layer.append(area);
    done.push(animate(area, [{ opacity: 0 }, { opacity: .65, offset: .3 }, { opacity: 0 }], options));
  }
  const ring = E('circle', { class: 'anim-ring', r: 95, cx: at.x, cy: at.y, stroke: step.kind === 'conquest' ? tint : '#ffd27a' });
  ring.style.transformOrigin = `${at.x}px ${at.y}px`; ring.style.transformBox = 'view-box';
  layer.append(ring);
  done.push(animate(ring, [{ transform: 'scale(.2)', opacity: 0 }, { opacity: 1, offset: .25 }, { transform: 'scale(1.4)', opacity: 0 }], options));
  return done;
}

/** Tout le plan se voit-il avec le cadrage actuel ? Sinon la carte entière est montrée le temps de l'animation. */
function planOnScreen(plan) {
  const ctm = $('#map').getScreenCTM?.(), box = $('#viewport').getBoundingClientRect();
  if (!ctm) return true;
  const spots = [...plan.routes.flatMap(r => [r.points[0], r.points.at(-1)]), ...plan.steps.filter(s => s.provinceId).map(s => province(s.provinceId).markerAnchor)];
  return spots.every(p => { const x = ctm.a * p.x + ctm.c * p.y + ctm.e, y = ctm.b * p.x + ctm.d * p.y + ctm.f; return x >= box.left + 12 && x <= box.right - 12 && y >= box.top + 12 && y <= box.bottom - 12; });
}
function setView(v, slack) { setScale(v.scale); setTx(v.x); setTy(v.y); clampTransform(slack); updateLabelScale(); }

/** Joue le plan des événements du tour. La promesse se résout toujours, et n'est jamais rejetée. */
export function playTurnAnimation(events) {
  return new Promise(resolve => {
    let plan;
    try { plan = planTurnAnimation(events, state, map, { nation: id => nation(id).short, province: id => province(id).name }); }
    catch { return resolve(); }
    if (!plan.total || document.visibilityState === 'hidden') return resolve();
    // Mouvement réduit : ni déplacement ni écran à attendre ; le journal dit la même chose et le son le plus important reste.
    if (reducedMotion()) { if (plan.sounds[0]) playSfx(plan.sounds[0]); return resolve(); }

    const timers = [], overlay = document.createElement('div'), label = document.createElement('p'), hint = document.createElement('small'), layer = E('g', { class: 'turn-anim-layer' });
    let pressing = false, restore = null;
    const onHide = () => { if (document.visibilityState === 'hidden') finish(); }, onPageHide = () => finish();
    const finish = () => {
      if (finishCurrent !== finish) return;
      finishCurrent = null;
      timers.forEach(clearTimeout);
      document.removeEventListener('visibilitychange', onHide); removeEventListener('pagehide', onPageHide);
      for (const node of [overlay, layer]) try { node.remove(); } catch {}
      if (restore) try { setView(restore); } catch {} // le joueur retrouve son cadrage
      resolve();
    };
    finishCurrent = finish;
    try {
      overlay.id = 'turnAnim'; overlay.setAttribute('role', 'status'); label.className = 'turn-anim-text'; hint.textContent = 'Touchez pour passer'; overlay.append(label, hint);
      // Le clic, pas l'appui : l'écran reste en place jusqu'à la fin du geste, et ce toucher ne peut pas atteindre la fenêtre suivante.
      overlay.addEventListener('click', event => { event.stopPropagation(); finish(); });
      overlay.addEventListener('pointerdown', () => { pressing = true; });
      for (const type of ['pointerup', 'pointercancel']) overlay.addEventListener(type, () => { pressing = false; });
      document.addEventListener('visibilitychange', onHide); addEventListener('pagehide', onPageHide);
      document.body.append(overlay); $('#map').append(layer);
      if (!planOnScreen(plan)) { restore = { scale, x: tx, y: ty }; setView(wholeMapView(minZoom), 0); }
      for (const route of plan.routes) drawRoute(layer, route, plan.routeMs);
      for (const step of plan.steps) {
        drawEffect(layer, step);
        timers.push(setTimeout(() => { label.textContent = step.text; }, step.at));
      }
      for (const cue of soundCues(plan)) timers.push(setTimeout(() => playSfx(cue.sound), cue.at));
      timers.push(setTimeout(() => {
        // Doigt encore posé à la fin : la fenêtre suivante ne doit pas recevoir ce toucher. Elle s'ouvre quand même tout de suite.
        if (pressing) swallowNextClick();
        finish();
      }, Math.min(plan.total, MAX_ANIMATION_MS)));
    } catch { finish(); }
  });
}
function swallowNextClick() {
  const stop = event => { event.stopPropagation(); event.preventDefault(); };
  document.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 400);
}
