import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAmount, parseAmount, renderBooking, renderLeaderboard } from '../src/balance.js';

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

// ---------------------------------------------------------------------
//  Anzeige
// ---------------------------------------------------------------------

const rangliste = {
  rows: [
    { discord_id: '1', display_name: 'paulo064411', amount: '12042491' },
    { discord_id: '2', display_name: 'oettpower94', amount: '6801029' },
  ],
  seite: 0,
  seiten: 4,
  gesamt: 37,
};

test('Rangliste: nummerierte Zeilen statt Codeblock', () => {
  const daten = renderLeaderboard(rangliste, 'Gilde', 5).toJSON();
  assert.doesNotMatch(daten.description, /```/);
  assert.match(daten.description, /\*\*1\.\*\* paulo064411/);
  assert.match(daten.description, /12\.042\.491/);
});

test('Rangliste: Seite und eigener Platz in der Fusszeile', () => {
  const daten = renderLeaderboard(rangliste, 'Gilde', 5).toJSON();
  assert.match(daten.footer.text, /Seite 1\/4/);
  assert.match(daten.footer.text, /Dein Platz: 5\./);
});

test('Rangliste: ohne eigenen Platz keine leere Angabe', () => {
  // Wer nichts hat, steht nirgends - dann darf da auch nichts stehen.
  const daten = renderLeaderboard(rangliste, 'Gilde', null).toJSON();
  assert.doesNotMatch(daten.footer.text, /Dein Platz/);
});

test('Rangliste: die Platznummer laeuft ueber die Seiten weiter', () => {
  const zweite = renderLeaderboard({ ...rangliste, seite: 1 }, 'Gilde', null).toJSON();
  assert.match(zweite.description, /\*\*11\.\*\* paulo064411/);
});

test('Buchung: eine Zeile mit Erwaehnung, Stand als Kleingedrucktes', () => {
  const daten = renderBooking({
    menge: 2430000n,
    abziehen: false,
    zielId: '999',
    saldo: 3993666n,
  }).toJSON();

  assert.match(daten.description, /^✅ \*\*2\.430\.000\*\* 🪙 zu <@999> hinzugefügt\./);
  assert.match(daten.description, /-# Neuer Stand: 3\.993\.666/);
});

test('Buchung: Abziehen sieht anders aus als Hinzufuegen', () => {
  const rein = renderBooking({ menge: 100n, abziehen: false, zielId: '1', saldo: 100n }).toJSON();
  const raus = renderBooking({ menge: 100n, abziehen: true, zielId: '1', saldo: 0n }).toJSON();

  assert.match(raus.description, /abgezogen/);
  assert.doesNotMatch(raus.description, /hinzugefügt/);
  assert.notEqual(rein.color, raus.color);
});
