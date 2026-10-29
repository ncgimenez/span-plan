const test = require('node:test');
const assert = require('node:assert');
const SpanSecurity = require('../js/security.js');

test('SpanSecurity Architecture (span-plan)', async (t) => {
  await t.test('sha256 computes consistent and salted hash', async () => {
    const hash1 = await SpanSecurity.sha256('1234');
    const hash2 = await SpanSecurity.sha256('1234');
    const hashDiff = await SpanSecurity.sha256('5678');

    assert.strictEqual(typeof hash1, 'string');
    assert.strictEqual(hash1.length, 64);
    assert.strictEqual(hash1, hash2);
    assert.notStrictEqual(hash1, hashDiff);
  });

  await t.test('generateRecoveryKey produces REC-XXXX-XXXX-XXXX format', () => {
    const key = SpanSecurity.generateRecoveryKey();
    assert.match(key, /^REC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  await t.test('isAppLocked behaves according to storage presence', () => {
    // In Node test environment without browser storage, defaults to false
    assert.strictEqual(SpanSecurity.isAppLocked(), false);
  });
});
