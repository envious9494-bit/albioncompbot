import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildEventEmbed, hashComposition } from '../src/render.js';

/** Ein Event, das gleich losgeht und noch offen ist. */
function event(extra = {}) {
  return {
    id: 2,
    title: 'Test comp',
    comp_name: 'Test comp',
    status: 'open',
    starts_at: new Date(Date.now() + 60 * 60_000).toISOString(),
    lock_minutes: 10,
    ...extra,
  };
}

function slot(index, extra = {}) {
  return {
    slotIndex: index,
    weaponId: 1,
    weaponName: 'Broadsword',
    icon: '⚔️',
    label: null,
    priority: 1,
    discordId: null,
    rating: null,
    locked: false,
    ...extra,
  };
}

/** Alles, was im Embed steht, als ein Text - zum Suchen. */
function text(embed) {
  const daten = embed.toJSON();
  return [
    daten.title,
    daten.description,
    ...(daten.fields ?? []).flatMap((f) => [f.name, f.value]),
    daten.footer?.text,
  ]
    .filter(Boolean)
    .join('\n');
}

describe('Bank: die zwei Gruende auseinanderhalten', () => {
  const komposition = {
    slots: [slot(0), slot(1), slot(2)],
    bench: [
      { discordId: '1', displayName: 'Kaltblut', bestRating: 7, bestWeaponId: 1 },
      { discordId: '2', displayName: 'MrEnvi', bestRating: 0, bestWeaponId: null },
    ],
    filled: 0,
    total: 3,
  };

  it('nennt beide Gruppen getrennt', () => {
    const inhalt = text(buildEventEmbed(event(), komposition, []));
    assert.match(inhalt, /Nachrücker · 1/);
    assert.match(inhalt, /Keine passende Waffe · 1/);
  });

  it('steckt jeden in die richtige Gruppe', () => {
    const felder = buildEventEmbed(event(), komposition, []).toJSON().fields;
    const nachruecker = felder.find((f) => f.name.startsWith('Nachrücker'));
    const ohne = felder.find((f) => f.name.startsWith('Keine passende Waffe'));

    assert.match(nachruecker.value, /Kaltblut/);
    assert.doesNotMatch(nachruecker.value, /MrEnvi/);
    assert.match(ohne.value, /MrEnvi/);
    assert.doesNotMatch(ohne.value, /Kaltblut/);
  });

  it('sagt den Betroffenen, was zu tun ist', () => {
    const inhalt = text(buildEventEmbed(event(), komposition, []));
    assert.match(inhalt, /\/waffen/);
  });

  it('erwaehnt /waffen nicht, wenn es niemanden betrifft', () => {
    const ohneProblem = { ...komposition, bench: [komposition.bench[0]] };
    const inhalt = text(buildEventEmbed(event(), ohneProblem, []));
    assert.doesNotMatch(inhalt, /\/waffen/);
  });
});

describe('Kopfzeile', () => {
  const leer = { slots: [slot(0)], bench: [], filled: 0, total: 1 };

  it('kuendigt das Einfrieren an, solange die Frist laeuft', () => {
    assert.match(text(buildEventEmbed(event(), leer, [])), /eingefroren/);
  });

  it('sagt "gleich" statt einer Zeit in der Vergangenheit', () => {
    // Start in 2 Minuten bei 10 Minuten Sperrfrist: der Zeitpunkt zum
    // Einfrieren ist laengst durch, der Poll aber noch nicht gelaufen.
    const knapp = event({ starts_at: new Date(Date.now() + 2 * 60_000).toISOString() });
    const inhalt = text(buildEventEmbed(knapp, leer, []));
    assert.match(inhalt, /gleich\*{0,2} eingefroren/);
    assert.doesNotMatch(inhalt, /vor \d/);
  });

  it('meldet eine stehende Aufstellung', () => {
    const inhalt = text(buildEventEmbed(event({ status: 'locked' }), leer, []));
    assert.match(inhalt, /Aufstellung steht/);
  });
});

describe('Leerer Timer', () => {
  it('sagt, dass sich noch niemand angemeldet hat', () => {
    const leer = { slots: [slot(0)], bench: [], filled: 0, total: 1 };
    assert.match(text(buildEventEmbed(event(), leer, [])), /niemand angemeldet/);
  });

  it('sagt das nicht mehr, sobald jemand da ist', () => {
    const einer = {
      slots: [slot(0, { discordId: '1', displayName: 'Kaltblut', rating: 8 })],
      bench: [],
      filled: 1,
      total: 1,
    };
    assert.doesNotMatch(text(buildEventEmbed(event(), einer, [])), /niemand angemeldet/);
  });
});

describe('hashComposition', () => {
  // Ein einziges Event fuer alle Vergleiche. event() setzt starts_at aus
  // Date.now(), und der Zeitpunkt geht in den Hash ein: zwei Aufrufe waeren
  // schon durch eine verstrichene Millisekunde verschieden. Beim Test auf
  // "ungleich" waere das besonders tueckisch - der wuerde gruen, ohne die
  // Sache zu pruefen, um die es geht.
  const ev = event();
  const basis = {
    slots: [slot(0)],
    bench: [{ discordId: '2', displayName: 'MrEnvi', bestRating: 0 }],
    filled: 0,
    total: 1,
  };

  it('aendert sich, wenn jemand eine passende Waffe nachtraegt', () => {
    // Sonst wechselt die Person die Gruppe, das Embed wird aber nie neu
    // geschrieben - der Hinweis "trag /waffen ein" bliebe stehen.
    const nachher = { ...basis, bench: [{ ...basis.bench[0], bestRating: 6 }] };
    assert.notEqual(hashComposition(ev, basis, []), hashComposition(ev, nachher, []));
  });

  it('bleibt gleich, wenn sich nichts aendert', () => {
    assert.equal(hashComposition(ev, basis, []), hashComposition(ev, basis, []));
  });
});
