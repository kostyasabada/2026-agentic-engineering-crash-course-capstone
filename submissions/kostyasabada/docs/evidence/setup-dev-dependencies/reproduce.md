# Reproduce final tooling checks

From the project directory, select Node 24.21.0 using `.nvmrc` with your existing version manager, or use the isolated official runtime downloaded for this task:

```bash
export PATH=/tmp/node-v24.21.0-linux-x64/bin:$PATH
node --version
npm --version
npm ci
npm ls --depth=0
npm run --silent openspec -- --version
npm run --silent openspec -- list --json
./node_modules/.bin/tsc --version
./node_modules/.bin/eslint --version
./node_modules/.bin/vitest --version
./node_modules/.bin/vite --version
./node_modules/.bin/playwright --version
```

The `/tmp` runtime is machine-local and temporary, not a committed dependency. For a fresh machine use the Node version pinned in `.nvmrc`. The original archive URL and checksum are in `node24-runtime.txt`. `PATH` applies to this shell only; no global runtime default is needed.

Provision Chromium when absent with `npm exec -- playwright install chromium`. Browser launch required approved execution outside the restricted agent sandbox on this machine. This in-memory page check exercises browser tooling only:

```bash
node <<'JS'
const { chromium } = require('@playwright/test');
(async () => {
  console.log('Node runtime:', process.version);
  for (const [name, options] of [
    ['chromium', { headless: true, executablePath: chromium.executablePath() }],
    ['default-headless-shell', { headless: true }],
  ]) {
    const browser = await chromium.launch(options);
    try {
      const page = await browser.newPage();
      await page.setContent('<title>Tooling smoke check</title><h1>Browser ready</h1>');
      const title = await page.title();
      const heading = await page.locator('h1').textContent();
      if (title !== 'Tooling smoke check' || heading !== 'Browser ready') {
        throw new Error('Unexpected page content');
      }
      console.log(JSON.stringify({ name, browser: browser.version(), title, heading, result: 'passed' }, null, 2));
    } finally {
      await browser.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
JS
```
