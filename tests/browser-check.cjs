// Optional integration check. See README.md for temporary Playwright setup.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const html = readFileSync(htmlPath);
  const server = createServer((request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    } else {
      response.writeHead(404);
      response.end();
    }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    });
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { errors.push(`Unexpected dialog: ${dialog.message()}`); void dialog.dismiss(); });

    for (const url of [
      `http://127.0.0.1:${server.address().port}/`,
      pathToFileURL(htmlPath).href,
    ]) {
      await page.goto(url);
      assert.equal(await page.title(), 'Thth');
      assert.equal(await page.locator('h1').textContent(), 'Thth');
      assert.equal(await page.locator('.intro').textContent(), 'receive thy name');
      assert.equal(await page.locator('button').count(), 3);
      assert.equal(await page.locator('#copy').isDisabled(), true);
      await page.locator('#generate').click();
      const name = await page.locator('#name-output').textContent();
      assert.match(name, /^[a-z]+-[a-z]+(?:-[a-z]+)?(?:-[1-9]\d{1,4})?$/);
      await page.locator('#copy').click();
      await page.waitForFunction(() => document.getElementById('feedback').textContent === 'Copied!');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), name);
      await page.waitForFunction(() => document.getElementById('feedback').textContent === '');
      console.log(`PASS: actual Generate/Copy, clipboard contents, temporary feedback (${new URL(url).protocol})`);
      await page.emulateMedia({ colorScheme: 'light' });
      for (const theme of ['dark', 'light']) {
        const existingName = await page.locator('#name-output').textContent();
        await page.locator('#theme-toggle').click();
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        assert.equal(await page.locator('#theme-toggle').getAttribute('aria-pressed'), String(theme === 'dark'));
        assert.equal(await page.locator('#name-output').textContent(), existingName);
        await page.emulateMedia({ colorScheme: theme === 'dark' ? 'light' : 'dark' });
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
        await page.reload();
        assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      }
      await page.evaluate(() => localStorage.removeItem('thth-theme'));
      await page.reload();
      console.log(`PASS: theme toggle, persistence, system override, name preservation (${new URL(url).protocol})`);
    }

    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      const foreground = theme === 'dark' ? 'rgb(238, 238, 238)' : 'rgb(17, 17, 17)';
      const background = theme === 'dark' ? 'rgb(17, 17, 17)' : 'rgb(255, 255, 255)';
      const disabledText = theme === 'dark' ? 'rgb(170, 170, 170)' : 'rgb(102, 102, 102)';
      await page.reload();
      await page.mouse.move(0, 0);
      const colors = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const generate = getComputedStyle(document.getElementById('generate'));
        const copy = getComputedStyle(document.getElementById('copy'));
        return {
          foreground: root.color,
          background: root.backgroundColor,
          buttonText: generate.color,
          buttonBackground: generate.backgroundColor,
          border: generate.borderTopColor,
          disabledText: copy.color,
        };
      });
      assert.deepEqual(colors, {
        foreground, background, buttonText: foreground,
        buttonBackground: background, border: foreground, disabledText,
      });
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'theme-toggle');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#generate').evaluate(element => getComputedStyle(element).outlineColor), foreground);
      assert.equal(await page.locator('#generate').evaluate(element => getComputedStyle(element).outlineStyle), 'solid');
      await page.locator('#generate').hover();
      assert.equal(await page.locator('#generate').evaluate(element => getComputedStyle(element).backgroundColor), foreground);
      assert.equal(await page.locator('#generate').evaluate(element => getComputedStyle(element).color), background);
      await page.locator('#generate').click();
      assert.equal(await page.locator('#copy').isEnabled(), true);
      console.log(`PASS: ${theme} theme colors, disabled Copy, keyboard focus, hover, generation`);
    }

    const currentName = await page.locator('#name-output').textContent();
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      await page.waitForFunction(expected => document.documentElement.dataset.theme === expected, theme);
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor),
        theme === 'dark' ? 'rgb(17, 17, 17)' : 'rgb(255, 255, 255)');
      assert.equal(await page.locator('#name-output').textContent(), currentName);
    }
    console.log('PASS: live theme changes preserve generated name without reload');

    // Stress wrapping with longest words, not just a lucky short random result.
    await page.evaluate(() => {
      const pools = JSON.parse(document.getElementById('word-pools').textContent);
      const longest = [...new Set(Object.values(pools).flat())].sort((a, b) => b.length - a.length).slice(0, 3);
      document.getElementById('name-output').textContent = `${longest.join('-')}-99999`;
    });
    for (const width of [320, 375, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      const layout = await page.evaluate(() => {
        const name = document.getElementById('name-output').getBoundingClientRect();
        const copy = document.getElementById('copy').getBoundingClientRect();
        return {
          fits: document.documentElement.scrollWidth <= window.innerWidth,
          noOverlap: name.right <= copy.left,
        };
      });
      assert.equal(layout.fits, true, `Horizontal overflow at ${width}px`);
      assert.equal(layout.noOverlap, true, `Copy overlaps name at ${width}px`);
    }
    await page.setViewportSize({ width: 375, height: 800 });
    await page.screenshot({ path: '/tmp/thth-mobile.png', fullPage: true });
    console.log('PASS: 320/375/768/1280px layout, longest-name wrapping, no Copy overlap');

    await page.reload();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'theme-toggle');
    const priorTheme = await page.locator('html').getAttribute('data-theme');
    await page.keyboard.press('Space');
    assert.notEqual(await page.locator('html').getAttribute('data-theme'), priorTheme);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'generate');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#copy').isEnabled(), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'copy');
    console.log('PASS: keyboard theme toggle, generation and Copy focus');

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await page.locator('#copy').click();
    assert.match(await page.locator('#feedback').textContent(), /^Clipboard unavailable\./);
    await page.locator('#generate').click();
    assert.equal(await page.locator('#feedback').textContent(), '');
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => { throw new DOMException('Denied', 'NotAllowedError'); } },
      });
    });
    await page.locator('#copy').click();
    await page.waitForFunction(() => document.getElementById('feedback').textContent.startsWith('Could not copy.'));
    assert.equal(await page.locator('#copy').isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log('PASS: unavailable/denied clipboard UI, no script errors or popups');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
