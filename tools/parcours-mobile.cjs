// Parcours réel dans Chrome mobile simulé (390×844) : nouvelle partie, N tours jusqu'à l'écran de fin.
const { chromium } = require('playwright');
const [,, base, lengthIdx = '0', maxTurns = '45', tag = 'run'] = process.argv;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [], log = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${tag}-0-accueil.png` });
  console.error('offre tuto:', await page.evaluate(() => [...document.querySelectorAll('dialog[open] button')].map(b => b.id + '|' + b.innerText.trim())));
  await page.evaluate(() => { const bs = [...document.querySelectorAll('dialog[open] button')]; (bs.find(b => /non|plus tard|passer|directement/i.test(b.innerText)) || bs[bs.length - 1])?.click(); });
  await page.waitForTimeout(400);
  if (await page.isVisible('#startNewGame')) await page.click('#startNewGame');
  await page.waitForTimeout(500);
  const dump = async () => page.evaluate(() => [...document.querySelectorAll('dialog[open]')].map(d => d.id + ' :: ' + d.innerText.replace(/\s+/g, ' ').slice(0, 300)));
  log.push('après Nouvelle partie: ' + JSON.stringify(await dump()));
  // longueur puis nation
  const lens = await page.$$('#lengthChoices button'); if (lens[+lengthIdx]) await lens[+lengthIdx].click();
  await page.waitForTimeout(200);
  const nats = await page.$$('#nationChoices button'); log.push('nations: ' + nats.length); if (nats[0]) await nats[0].click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${tag}-1-debut.png` });
  let lastTurn = '', stuck = 0, overflowTurns = [];
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(() => {
      const open = [...document.querySelectorAll('dialog[open]')].map(d => d.id);
      const vis = el => el && !el.hidden && el.offsetParent !== null;
      return { open, turn: document.querySelector('#turn')?.innerText || '', end: open.includes('endDialog'),
        tuto: vis(document.querySelector('#miniTuto')), overflow: document.documentElement.scrollWidth > innerWidth + 1,
        btns: open.length ? [...document.querySelector('dialog[open]:last-of-type')?.querySelectorAll('button') || []].filter(vis).map(b => (b.id || '') + '|' + b.innerText.trim().slice(0, 30)) : [] };
    });
    if (st.overflow && !overflowTurns.includes(st.turn)) overflowTurns.push(st.turn);
    if (st.end) { log.push('ÉCRAN DE FIN atteint, compteur: ' + st.turn); break; }
    if (st.turn === lastTurn) stuck++; else { stuck = 0; lastTurn = st.turn; if (i % 1 === 0) log.push('tour ' + st.turn.replace(/\s+/g, ' ')); }
    if (stuck > 25) { log.push('BLOQUÉ: ' + JSON.stringify(st) + ' ' + JSON.stringify(await dump())); await page.screenshot({ path: `${tag}-bloque.png` }); break; }
    const tryClick = async sel => { const el = await page.$(sel); if (el && await el.isVisible()) { await el.click({ timeout: 2000 }).catch(() => {}); return true; } return false; };
    if (await tryClick('#confirmEndTurn')) { await page.waitForTimeout(350); continue; }
    if (await tryClick('#miniTutoSkip')) { await page.waitForTimeout(150); continue; }
    if (st.open.length) {
      // ferme la fenêtre ouverte : bouton Non/Fermer/Continuer/OK, sinon Échap
      const ok = await page.evaluate(() => {
        const d = [...document.querySelectorAll('dialog[open]')].pop(); if (!d) return false;
        const vis = el => !el.hidden && el.offsetParent !== null;
        const bs = [...d.querySelectorAll('button')].filter(vis);
        const pref = bs.find(b => /^(non|refuser|fermer|continuer|ok|compris|plus tard|passer|voir la carte|suivant)/i.test(b.innerText.trim())) || bs.find(b => /close|fermer/i.test(b.id + b.className + (b.getAttribute('aria-label') || ''))) || bs[bs.length - 1];
        if (pref) { pref.click(); return true; } return false;
      });
      if (!ok) await page.keyboard.press('Escape');
      await page.waitForTimeout(200); continue;
    }
    await page.click('#nextTurn', { timeout: 3000 }).catch(e => log.push('clic nextTurn impossible: ' + e.message.split('\n')[0]));
    await page.waitForTimeout(300);
    if ([8, 20, 34].some(t => st.turn.includes(String(t))) && stuck === 0) await page.screenshot({ path: `${tag}-tour-${st.turn.replace(/\D+/g, '-')}.png` });
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${tag}-fin.png` });
  const endText = await page.evaluate(() => document.querySelector('#endDialog[open]')?.innerText.replace(/\s+/g, ' ').slice(0, 400) || '');
  console.log(JSON.stringify({ log: log.slice(0, 4).concat(['…'], log.slice(-6)), toursVus: log.filter(l => l.startsWith('tour ')).length, errors: [...new Set(errors)].slice(0, 10), overflowTurns, endText }, null, 1));
  await browser.close();
})();
