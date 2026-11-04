// Собирает dashboard.html: прогоняет страницу в браузере и вшивает готовую
// разметку внутрь файла, чтобы на iPhone без JavaScript всё было видно.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = path.join(__dirname, 'dashboard.src.html');
  const out = path.join(__dirname, 'dashboard.html');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + src);
  await page.waitForSelector('.kpis');
  const html = await page.$eval('#app', (el) => el.innerHTML);
  await browser.close();
  if (errors.length) { process.stderr.write(errors.join('\n') + '\n'); process.exit(1); }
  const note = '<div class="nojs">Открыто в режиме просмотра: фильтры и выгрузка не работают. Откройте файл в Safari или Chrome.</div>';
  fs.writeFileSync(out, fs.readFileSync(src, 'utf8').replace('<!--STATIC-->', note + html));
  process.stdout.write('ok ' + out + ' ' + Math.round(fs.statSync(out).size / 1024) + ' KB\n');
})();
