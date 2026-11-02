// V15.2 — Sons et mélodie synthétisés par Web Audio : aucun fichier audio, aucune dépendance. Module sans DOM : ce dont il
// a besoin (classe AudioContext, réglages, visibilité) lui est fourni, ce qui permet de le tester sous Node.
//
// Règles : rien n'est créé avant un geste du joueur ; aucune méthode ne lève d'erreur, même si Web Audio est absent, cassé ou
// suspendu ; en arrière-plan tout se coupe (la musique ne s'accumule pas) ; un son demandé sans contexte actif est abandonné.

const n = (f, at, d, type = 'triangle', v = .1, to = null) => ({ f, at, d, type, v, to });
const noise = (at, d, v, freq) => ({ noise: true, at, d, v, freq });
export const SOUNDS = Object.freeze({
  button: [n(660, 0, .05, 'sine', .035)],
  order: [n(392, 0, .08, 'triangle', .07), n(587, .07, .12, 'triangle', .07)],
  turn: [n(196, 0, .28, 'sine', .08, 294), n(392, .1, .22, 'sine', .035)],
  battle: [noise(0, .22, .2, 900), n(92, 0, .28, 'sawtooth', .09, 48), noise(.16, .18, .13, 1600)],
  conquest: [n(294, 0, .14, 'triangle', .11), n(392, .12, .14, 'triangle', .11), n(587, .24, .38, 'triangle', .12), n(294, .24, .38, 'sine', .07)],
  betrayal: [n(466, 0, .3, 'sawtooth', .05, 440), n(311, .02, .55, 'sawtooth', .06, 277), n(78, .1, .6, 'sine', .12)],
  victory: [n(294, 0, .18), n(392, .16, .18), n(494, .32, .18), n(587, .48, .7, 'triangle', .13), n(392, .48, .7, 'sine', .08), n(196, .48, .9, 'sine', .08)],
  defeat: [n(294, 0, .34, 'sine', .1), n(277, .3, .34, 'sine', .1), n(233, .6, .4, 'sine', .1), n(147, .9, 1, 'triangle', .11, 110)]
});
/** Mélodie calme, en boucle : [fréquence ou 0 pour un silence, durée en temps]. La même à chaque fois : pas de hasard. */
export const MELODY = Object.freeze([[220, 2], [262, 1], [330, 3], [0, 2], [294, 2], [262, 1], [220, 3], [0, 2], [196, 2], [220, 1], [262, 3], [0, 2], [330, 2], [294, 1], [247, 3], [0, 4]]);
const BEAT_S = .75, LOOKAHEAD_S = 1.2, TICK_MS = 500, MUSIC_GAIN = .05, MAX_VOICES = 16;

export function createSoundEngine({ getContextClass, settings, isHidden = () => false, setTimer = (f, ms) => setInterval(f, ms), clearTimer = id => clearInterval(id) }) {
  let ctx = null, broken = false, unlocked = false, held = false, voices = 0, musicBus = null, timer = null, nextAt = 0, index = 0, noiseBuffer = null;
  const safe = (f, fallback) => { try { return f(); } catch { return fallback; } };
  const quiet = promise => { try { promise?.catch?.(() => {}); } catch {} };
  const setting = key => safe(() => Boolean(settings()?.[key]), false);
  const running = () => Boolean(ctx && ctx.state === 'running');

  function context() {
    if (ctx || broken || !unlocked) return ctx;
    try {
      const Ctor = getContextClass();
      if (Ctor) ctx = new Ctor(); else broken = true;
    } catch { broken = true; }
    return ctx;
  }

  function tone(c, dest, t0, { f, d, type, v, to, attack = .015 }) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + d);
    g.gain.setValueAtTime(.0001, t0); g.gain.linearRampToValueAtTime(v, t0 + Math.min(attack, d / 3)); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + d + .02);
    return [o, g];
  }
  function burst(c, dest, t0, { d, v, freq }) {
    if (!noiseBuffer) {
      // Bruit figé par une petite suite arithmétique : pas de hasard, et le même souffle à chaque fois.
      noiseBuffer = c.createBuffer(1, Math.floor(c.sampleRate * .5), c.sampleRate);
      const data = noiseBuffer.getChannelData(0); let x = 12345;
      for (let i = 0; i < data.length; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; data[i] = x / 0x3fffffff - 1; }
    }
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuffer; fl.type = 'bandpass'; fl.frequency.value = freq; g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(.0001, t0 + d);
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(t0); s.stop(t0 + d + .02);
    return [s, fl, g];
  }
  const release = (first, nodes) => { first.onended = () => { voices--; safe(() => nodes.forEach(x => x.disconnect())); }; };

  function stopMusic() {
    if (timer !== null) { safe(() => clearTimer(timer)); timer = null; }
    const bus = musicBus; musicBus = null;
    if (bus) safe(() => bus.disconnect());
  }
  function tick() {
    if (!running() || !musicBus) return;
    safe(() => {
      nextAt = Math.max(nextAt, ctx.currentTime + .05);
      while (nextAt < ctx.currentTime + LOOKAHEAD_S) {
        const [f, beats] = MELODY[index]; index = (index + 1) % MELODY.length;
        const d = beats * BEAT_S;
        if (f) { const nodes = tone(ctx, musicBus, nextAt, { f, d: d * 1.15, type: 'sine', v: 1, attack: .3 }); voices++; release(nodes[0], nodes); }
        nextAt += d;
      }
    });
  }
  const wantMusic = () => unlocked && !held && !isHidden() && setting('music');

  const engine = {
    /** À appeler à chaque geste du joueur : seul moment où le contexte peut naître ou reprendre. */
    unlock() { unlocked = true; if (!isHidden() && !held) engine.resume(); engine.syncMusic(); },
    resume() { const c = safe(context, null); if (c && c.state !== 'running' && !isHidden()) safe(() => quiet(c.resume())); },
    /** Met la mélodie en accord avec le réglage, le geste et la visibilité. */
    syncMusic() {
      if (!wantMusic()) return stopMusic();
      const c = safe(context, null); if (!c || musicBus) return;
      safe(() => {
        musicBus = c.createGain(); musicBus.gain.value = MUSIC_GAIN; musicBus.connect(c.destination);
        nextAt = 0; timer = setTimer(tick, TICK_MS); tick();
      });
    },
    play(name = 'turn') {
      const sound = SOUNDS[name];
      if (!sound || !setting('sfx') || !unlocked || held || isHidden()) return false;
      const c = safe(context, null); if (!c) return false;
      if (c.state !== 'running') { safe(() => quiet(c.resume())); return false; } // pas d'empilement à la reprise
      return safe(() => {
        if (voices + sound.length > MAX_VOICES) return false;
        const t0 = c.currentTime + .005;
        for (const part of sound) { const nodes = (part.noise ? burst : tone)(c, c.destination, t0 + part.at, part); voices++; release(nodes[0], nodes); }
        return true;
      }, false);
    },
    /** Arrière-plan, écran coupé : plus rien ne sonne. */
    background() { stopMusic(); if (ctx && ctx.state === 'running') safe(() => quiet(ctx.suspend())); },
    foreground() { if (isHidden() || held || !unlocked) return; engine.resume(); engine.syncMusic(); },
    /** Publicité : silence le temps qu'elle dure. */
    hold(on) { held = Boolean(on); if (held) engine.background(); else engine.foreground(); },
    get status() { return { created: Boolean(ctx), state: ctx?.state ?? null, music: Boolean(musicBus), broken, voices }; }
  };
  return engine;
}
