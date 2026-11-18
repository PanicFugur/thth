const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script id="theme">([\s\S]*?)<\/script>/)[1];

function loadTheme({ dark = false, saved = null, blockedRead = false, blockedWrite = false } = {}) {
  const root = { dataset: {} };
  const toggle = {
    disabled: true,
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(event, listener) { assert.equal(event, 'click'); this.click = listener; },
  };
  let ready;
  let change;
  let mounted = false;
  const writes = [];
  const media = {
    matches: dark,
    addEventListener(event, listener) { assert.equal(event, 'change'); change = listener; },
  };
  vm.runInNewContext(script, {
    window: { matchMedia(query) { assert.equal(query, '(prefers-color-scheme: dark)'); return media; } },
    localStorage: {
      getItem(key) {
        assert.equal(key, 'thth-theme');
        if (blockedRead) throw new Error('Storage blocked');
        return saved;
      },
      setItem(key, value) {
        if (blockedWrite) throw new Error('Storage blocked');
        writes.push([key, value]);
      },
    },
    document: {
      documentElement: root,
      getElementById(id) { assert.equal(id, 'theme-toggle'); return mounted ? toggle : null; },
      addEventListener(event, listener) { assert.equal(event, 'DOMContentLoaded'); ready = listener; },
    },
  });
  const initial = root.dataset.theme;
  mounted = true;
  ready();
  return {
    root, toggle, initial, writes,
    changeSystem(dark) { media.matches = dark; change(); },
  };
}

test('theme applies before button exists and follows live system preference', () => {
  for (const dark of [false, true]) {
    const state = loadTheme({ dark });
    assert.equal(state.initial, dark ? 'dark' : 'light');
    assert.equal(state.toggle.disabled, false);
    assert.equal(state.toggle.attributes['aria-pressed'], String(dark));
    state.changeSystem(!dark);
    assert.equal(state.root.dataset.theme, dark ? 'light' : 'dark');
    assert.equal(state.toggle.attributes['aria-pressed'], String(!dark));
    assert.deepEqual(state.writes, []);
  }
});

test('saved themes override system preference and survive system changes', () => {
  for (const saved of ['light', 'dark']) {
    const state = loadTheme({ dark: saved !== 'dark', saved });
    assert.equal(state.initial, saved);
    state.changeSystem(true);
    state.changeSystem(false);
    assert.equal(state.root.dataset.theme, saved);
  }
});

test('invalid saved preference falls back to system', () => {
  const state = loadTheme({ saved: 'invalid', dark: true });
  assert.equal(state.initial, 'dark');
  state.changeSystem(false);
  assert.equal(state.root.dataset.theme, 'light');
});

test('toggle switches both ways, updates accessible state, and persists choice', () => {
  const state = loadTheme();
  state.toggle.click();
  assert.equal(state.root.dataset.theme, 'dark');
  assert.equal(state.toggle.attributes['aria-pressed'], 'true');
  state.changeSystem(false);
  assert.equal(state.root.dataset.theme, 'dark');
  state.toggle.click();
  assert.equal(state.root.dataset.theme, 'light');
  assert.equal(state.toggle.attributes['aria-pressed'], 'false');
  assert.deepEqual(state.writes, [['thth-theme', 'dark'], ['thth-theme', 'light']]);
});

test('blocked storage does not break initialization or in-memory choice', () => {
  const state = loadTheme({ dark: true, blockedRead: true, blockedWrite: true });
  assert.equal(state.initial, 'dark');
  state.toggle.click();
  assert.equal(state.root.dataset.theme, 'light');
  state.changeSystem(true);
  assert.equal(state.root.dataset.theme, 'light');
  assert.equal(state.toggle.attributes['aria-pressed'], 'false');
});
