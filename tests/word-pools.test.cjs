const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const html = readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dataBlocks = [...html.matchAll(/<script\b[^>]*id="word-pools"[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(dataBlocks.length, 1, 'Expected exactly one word-pools data block');
const pools = JSON.parse(dataBlocks[0][1]);

const categories = ['mythology', 'space', 'planets', 'scifiAuthors', 'scientists', 'astronauts'];

test('only approved categories exist', () => {
  assert.deepEqual(Object.keys(pools).sort(), [...categories].sort());
});

for (const category of categories) {
  test(`${category}: sufficient unique, lowercase single-token words`, () => {
    const words = pools[category];
    assert.ok(Array.isArray(words));
    assert.ok(words.length >= (category === 'astronauts' ? 1 : 101), `${category}: ${words.length} entries`);
    assert.equal(new Set(words).size, words.length, `${category}: duplicate entries`);
    for (const word of words) {
      assert.equal(typeof word, 'string');
      assert.match(word, /^[a-z]+$/, `${category}: invalid token ${word}`);
      assert.ok(!word.includes('placeholder'), `${category}: unfinished entry`);
    }
  });
}

test('representative entries belong to their expected pools', () => {
  for (const [category, words] of Object.entries({
    mythology: ['thoth', 'athena', 'odin'],
    space: ['nebula', 'quasar', 'orbit'],
    planets: ['earth', 'europa', 'titan'],
    scifiAuthors: ['asimov', 'leguin', 'leckie'],
    scientists: ['einstein', 'curie', 'semmelweis'],
    astronauts: ['gagarin', 'armstrong', 'tereshkova'],
  })) {
    for (const word of words) assert.ok(pools[category].includes(word), `${category}: missing ${word}`);
  }
});

test('three buttons start disabled and word pools remain non-executable data', () => {
  const buttons = [...html.matchAll(/<button\b([^>]*)>/g)];
  assert.equal(buttons.length, 3);
  for (const button of buttons) assert.match(button[1], /\bdisabled\b/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
  assert.equal(scripts.length, 3);
  const dataScript = scripts.find(script => /id="word-pools"/.test(script[1]));
  assert.match(dataScript[1], /type="application\/json"/);
});
