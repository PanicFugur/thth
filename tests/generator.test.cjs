const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const data = html.match(/<script id="word-pools" type="application\/json">([\s\S]*?)<\/script>/)[1];
const script = html.match(/<script id="generator">([\s\S]*?)<\/script>/)[1];
const pools = JSON.parse(data);
const words = [...new Set(Object.values(pools).flat())];

function loadGenerator(navigator = {}) {
  const timers = new Map();
  let timerId = 0;
  const elements = {
    'word-pools': { textContent: data },
    'name-output': { textContent: 'Your name will appear here.' },
    generate: {
      disabled: true,
      addEventListener(event, listener) { assert.equal(event, 'click'); this.click = listener; },
    },
    copy: {
      disabled: true,
      addEventListener(event, listener) { assert.equal(event, 'click'); this.click = listener; },
    },
    feedback: { textContent: '' },
  };
  const context = vm.createContext({
    navigator,
    setTimeout(callback, duration) { timers.set(++timerId, { callback, duration }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    document: { getElementById(id) { assert.ok(elements[id], id); return elements[id]; } },
  });
  vm.runInContext(script, context);
  return { context, elements, timers, generateName: vm.runInContext('generateName', context) };
}

function sequence(values) {
  let index = 0;
  return () => {
    assert.ok(index < values.length, 'Unexpected random draw');
    return values[index++];
  };
}

test('Generate is enabled, output starts unchanged, Copy remains disabled', () => {
  const { elements } = loadGenerator();
  assert.equal(elements.generate.disabled, false);
  assert.equal(elements.copy.disabled, true);
  assert.equal(elements['name-output'].textContent, 'Your name will appear here.');
});

test('button clicks write generated names as text', () => {
  const { elements } = loadGenerator();
  for (let i = 0; i < 10; i++) {
    elements.generate.click();
    assert.match(elements['name-output'].textContent, /^[a-z]+-[a-z]+(?:-[a-z]+)?(?:-\d{2,5})?$/);
  }
});

test('two and three words without suffix, including word-count boundary', () => {
  const { generateName } = loadGenerator();
  assert.equal(generateName(sequence([0, 0, 0, 0.5])), words.slice(0, 2).join('-'));
  assert.equal(generateName(sequence([0.5, 0, 0, 0, 0.5])), words.slice(0, 3).join('-'));
});

test('all suffix lengths reach minimum and maximum without leading zeros', () => {
  const { generateName } = loadGenerator();
  for (const wordChoice of [0, 0.5]) {
    const count = wordChoice === 0 ? 2 : 3;
    for (let digits = 2; digits <= 5; digits++) {
      for (const edge of [0, 0.999999999]) {
        const draws = [wordChoice, ...Array(count).fill(0), 0, (digits - 2) / 4, edge];
        const parts = generateName(sequence(draws)).split('-');
        assert.equal(parts.length, count + 1);
        const suffix = parts.at(-1);
        assert.equal(suffix.length, digits);
        assert.equal(suffix, edge === 0 ? `1${'0'.repeat(digits - 1)}` : '9'.repeat(digits));
      }
    }
  }
});

test('last pool entry is reachable and repeated draws do not repeat words', () => {
  const { generateName } = loadGenerator();
  assert.equal(generateName(() => 0.999999999), words.slice(-3).reverse().join('-'));
  const result = generateName(sequence([0.5, 0, 0, 0, 0.5])).split('-');
  assert.equal(new Set(result).size, 3);
});

test('every distinct word across all six pools is reachable', () => {
  const { generateName } = loadGenerator();
  for (let index = 0; index < words.length; index++) {
    const result = generateName(sequence([0, (index + 0.5) / words.length, 0, 0.5]));
    assert.equal(result.split('-')[0], words[index]);
  }
});

test('10,000 seeded names have valid format, membership, and distinct words', () => {
  const { generateName } = loadGenerator();
  const allowed = new Set(words);
  const seenCounts = new Set();
  const seenSuffixLengths = new Set();
  let seed = 42;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < 10000; i++) {
    const name = generateName(random);
    assert.match(name, /^[a-z]+-[a-z]+(?:-[a-z]+)?(?:-[1-9]\d{1,4})?$/);
    const parts = name.split('-');
    if (/^\d+$/.test(parts.at(-1))) seenSuffixLengths.add(parts.pop().length);
    else seenSuffixLengths.add(0);
    seenCounts.add(parts.length);
    assert.equal(new Set(parts).size, parts.length);
    for (const word of parts) assert.ok(allowed.has(word), word);
  }
  assert.deepEqual([...seenCounts].sort(), [2, 3]);
  assert.deepEqual([...seenSuffixLengths].sort(), [0, 2, 3, 4, 5]);
});

test('Copy ignores placeholder, then copies exact name and clears success after 2 seconds', async () => {
  const copied = [];
  const { elements, timers } = loadGenerator({ clipboard: { writeText: async text => { copied.push(text); } } });
  await elements.copy.click();
  assert.deepEqual(copied, []);
  elements.generate.click();
  assert.equal(elements.copy.disabled, false);
  await elements.copy.click();
  assert.deepEqual(copied, [elements['name-output'].textContent]);
  assert.equal(elements.copy.disabled, false);
  assert.equal(elements.feedback.textContent, 'Copied!');
  const timer = [...timers.values()][0];
  assert.equal(timer.duration, 2000);
  timer.callback();
  assert.equal(elements.feedback.textContent, '');
});

test('unavailable clipboard shows manual-copy guidance', async () => {
  for (const navigator of [{}, { clipboard: {} }]) {
    const { elements } = loadGenerator(navigator);
    elements.generate.click();
    await elements.copy.click();
    assert.match(elements.feedback.textContent, /^Clipboard unavailable\./);
    assert.equal(elements.copy.disabled, false);
  }
});

test('clipboard rejection or synchronous failure shows error, never success', async () => {
  for (const writeText of [
    async () => { throw new Error('Permission denied'); },
    () => { throw new Error('Clipboard failed'); },
  ]) {
    const { elements, timers } = loadGenerator({ clipboard: { writeText } });
    elements.generate.click();
    await elements.copy.click();
    assert.match(elements.feedback.textContent, /^Could not copy\./);
    assert.equal(elements.copy.disabled, false);
    const timer = [...timers.values()][0];
    assert.equal(timer.duration, 6000);
    timer.callback();
    assert.equal(elements.feedback.textContent, '');
  }
});

test('generating clears feedback and cancels its timer; repeated copy replaces timer', async () => {
  const { elements, timers } = loadGenerator({ clipboard: { writeText: async () => {} } });
  elements.generate.click();
  await elements.copy.click();
  const firstTimer = [...timers.keys()][0];
  await elements.copy.click();
  assert.equal(timers.size, 1);
  assert.equal(timers.has(firstTimer), false);
  elements.generate.click();
  assert.equal(elements.feedback.textContent, '');
  assert.equal(timers.size, 0);
});

for (const rejected of [false, true]) {
  test(`pending copy blocks duplicates and ignores stale ${rejected ? 'failure' : 'success'}`, async () => {
    let finish;
    const copied = [];
    const { elements } = loadGenerator({ clipboard: { writeText(text) {
      copied.push(text);
      return new Promise((resolve, reject) => { finish = rejected ? reject : resolve; });
    } } });
    elements.generate.click();
    const original = elements['name-output'].textContent;
    const pending = elements.copy.click();
    assert.equal(elements.copy.disabled, true);
    await elements.copy.click();
    assert.deepEqual(copied, [original]);
    elements.generate.click();
    assert.equal(elements.copy.disabled, true);
    finish(rejected ? new Error('Denied') : undefined);
    await pending;
    assert.equal(elements.copy.disabled, false);
    assert.equal(elements.feedback.textContent, '');
  });
}
