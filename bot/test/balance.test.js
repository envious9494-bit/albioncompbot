import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAmount, parseAmount } from '../src/balance.js';

test('einfache Zahlen', () => {
  assert.equal(parseAmount('500'), 500n);
  assert.equal(parseAmount('1'), 1n);
  assert.equal(parseAmount('  42  '), 42n);
});

test('k und m als Abkuerzung', () => {
  assert.equal(parseAmount('1k'), 1000n);
  assert.equal(parseAmount('1.5k'), 1500n);
  assert.equal(parseAmount('1,5k'), 1500n);
  assert.equal(parseAmount('2m'), 2000000n);
  assert.equal(parseAmount('2.5M'), 2500000n);
  assert.equal(parseAmount('10 k'), 10000n);
});

test('Tausenderpunkte und -kommas', () => {
  assert.equal(parseAmount('1.000'), 1000n);
  assert.equal(parseAmount('1,000'), 1000n);
  assert.equal(parseAmount('1.500.000'), 1500000n);
});

test('Unfug wird abgelehnt', () => {
  // Null und negative Betraege gibt es nicht - abgezogen wird ueber "remove"
  assert.equal(parseAmount('0'), null);
  assert.equal(parseAmount('-100'), null);
  assert.equal(parseAmount('viel'), null);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseAmount('500 Gold'), null);
  assert.equal(parseAmount('1k2'), null);
});

test('absurd grosse Betraege werden abgelehnt', () => {
  // Schutz gegen Vertipper wie "999999m"
  assert.equal(parseAmount('999999m'), null);
  assert.equal(parseAmount('1000000m'), null);
  assert.notEqual(parseAmount('999m'), null);
});

test('Betraege werden lesbar formatiert', () => {
  assert.equal(formatAmount(1500000n), '1.500.000');
  assert.equal(formatAmount(0n), '0');
  assert.equal(formatAmount(-2500n), '-2.500');
});

test('parseAmount liefert BigInt, nicht Number', () => {
  // Wichtig, weil Gold-Summen die sichere Zahlengrenze reissen koennen
  assert.equal(typeof parseAmount('1000'), 'bigint');
});
