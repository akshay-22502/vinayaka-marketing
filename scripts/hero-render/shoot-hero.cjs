// node shoot-hero.cjs <w> <h> <frames|stills> <outdir>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [w, h, mode, out] = [+process.argv[2], +process.argv[3], process.argv[4], process.argv[5]];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', e => console.log('ERR', e.message));
  p.on('console', m => { if (m.type() === 'error') console.log('console', m.text()); });
  await p.goto(`http://localhost:4321/hero.html?w=${w}&h=${h}`);
  await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const el = await p.$('#stage');
  fs.mkdirSync(out, { recursive: true });
  const n = mode === 'stills' ? null : +mode;
  const ps = n ? Array.from({ length: n }, (_, i) => i / (n - 1)) : [0, 0.1, 0.2, 0.3, 0.38, 0.5, 0.56, 0.62, 0.7, 0.78, 0.88, 1];
  let i = 0;
  for (const t of ps) {
    await p.evaluate(t => window.scene3d.render(t), t);
    await el.screenshot({ path: n ? `${out}/f${String(i++).padStart(4, '0')}.png` : `${out}/s-${t}.png` });
  }
  await b.close();
})();
