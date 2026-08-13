import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseStartTime } from '../src/time.js';

const ZONE = 'Europe/Berlin';

/** Liest Stunde und Minute eines Zeitpunkts in der Gildenzone zurueck. */
function wanduhr(datum, timeZone = ZONE) {
  const teile = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).format(datum);
  const [h, m] = teile.split(':').map(Number);
  return { stunde: h % 24, minute: m };
}

/** Minuten von jetzt bis zum Zeitpunkt, gerundet. */
function inMinuten(datum) {
  return Math.round((datum.getTime() - Date.now()) / 60_000);
}

describe('parseStartTime - relative Angaben', () => {
  it('versteht +45 als 45 Minuten', () => {
    assert.equal(inMinuten(parseStartTime('+45', ZONE)), 45);
  });

  it('versteht 45m und 45min genauso', () => {
    assert.equal(inMinuten(parseStartTime('45m', ZONE)), 45);
    assert.equal(inMinuten(parseStartTime('45min', ZONE)), 45);
  });

  it('versteht 2h als zwei Stunden', () => {
    assert.equal(inMinuten(parseStartTime('2h', ZONE)), 120);
  });

  it('rechnet 1h30 und 1.5h auf dieselbe Dauer', () => {
    assert.equal(inMinuten(parseStartTime('1h30', ZONE)), 90);
    assert.equal(inMinuten(parseStartTime('1.5h', ZONE)), 90);
  });

  it('erlaubt das Plus vor jeder Dauer, nicht nur vor der blossen Zahl', () => {
    // Wer "+45" und "2h" als Beispiele nebeneinander sieht, tippt "+2h".
    assert.equal(inMinuten(parseStartTime('+2h', ZONE)), 120);
    assert.equal(inMinuten(parseStartTime('+90m', ZONE)), 90);
    assert.equal(inMinuten(parseStartTime('+1h30', ZONE)), 90);
  });

  it('haelt "+20" und "20" auseinander', () => {
    // Mit Plus sind es zwanzig Minuten, ohne Plus ist es 20 Uhr.
    assert.equal(inMinuten(parseStartTime('+20', ZONE)), 20);
    assert.ok(inMinuten(parseStartTime('20', ZONE)) !== 20);
  });
});

describe('parseStartTime - Uhrzeiten', () => {
  it('nimmt 20:30 als Wanduhrzeit der Gildenzone', () => {
    const { stunde, minute } = wanduhr(parseStartTime('20:30', ZONE));
    assert.equal(stunde, 20);
    assert.equal(minute, 30);
  });

  it('versteht 2030 ohne Doppelpunkt gleich', () => {
    assert.deepEqual(wanduhr(parseStartTime('2030', ZONE)), wanduhr(parseStartTime('20:30', ZONE)));
  });

  it('versteht 20.30 mit Punkt gleich', () => {
    assert.deepEqual(wanduhr(parseStartTime('20.30', ZONE)), wanduhr(parseStartTime('20:30', ZONE)));
  });

  it('nimmt eine blosse Zahl als volle Stunde', () => {
    const { stunde, minute } = wanduhr(parseStartTime('20', ZONE));
    assert.equal(stunde, 20);
    assert.equal(minute, 0);
  });

  it('liegt immer in der Zukunft, egal welche Uhrzeit', () => {
    // Ueber alle 24 Stunden: eine davon ist heute garantiert schon vorbei.
    for (let h = 0; h < 24; h += 1) {
      const datum = parseStartTime(`${h}:15`, ZONE);
      assert.ok(datum.getTime() > Date.now(), `${h}:15 liegt in der Vergangenheit`);
      assert.equal(wanduhr(datum).stunde, h);
    }
  });

  it('haelt 2030 von 20 auseinander - Ziffernzahl entscheidet', () => {
    assert.equal(wanduhr(parseStartTime('2030', ZONE)).minute, 30);
    assert.equal(wanduhr(parseStartTime('20', ZONE)).minute, 0);
  });
});

describe('parseStartTime - mit Datum', () => {
  it('trifft ein volles Datum genau', () => {
    const datum = parseStartTime('14.08.2099 20:30', ZONE);
    const teile = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(datum);
    assert.equal(teile, '2099-08-14');
    assert.deepEqual(wanduhr(datum), { stunde: 20, minute: 30 });
  });

  it('erlaubt auch beim Datum die kompakte Uhrzeit', () => {
    assert.equal(
      parseStartTime('14.08.2099 2030', ZONE).getTime(),
      parseStartTime('14.08.2099 20:30', ZONE).getTime(),
    );
  });

  it('nimmt ohne Uhrzeitminuten die volle Stunde', () => {
    assert.deepEqual(wanduhr(parseStartTime('14.08.2099 20', ZONE)), { stunde: 20, minute: 0 });
  });
});

describe('parseStartTime - Unfug', () => {
  it('weist Buchstabensalat ab', () => {
    assert.throws(() => parseStartTime('naechsten Dienstag', ZONE), /kann ich nichts anfangen/);
  });

  it('weist unmoegliche Uhrzeiten ab', () => {
    assert.throws(() => parseStartTime('25:00', ZONE), /keine gueltige Uhrzeit/);
    assert.throws(() => parseStartTime('20:99', ZONE), /keine gueltige Uhrzeit/);
  });

  it('schlaegt bei einer zu grossen blossen Zahl die Minutenform vor', () => {
    // "90" ist keine Stunde - gemeint waren fast sicher 90 Minuten.
    assert.throws(() => parseStartTime('90', ZONE), /90m/);
  });
});
