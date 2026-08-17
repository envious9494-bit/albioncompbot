import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildEventEmbed,
  buildLockMessage,
  hashComposition,
  pingText,
  renderSignOffs,
} from '../src/render.js';

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

describe('Aufstellung: ein Platz, eine Zeile', () => {
  /** Nur die Felder der Aufstellung (das erste heisst so, die Folgefelder sind leer). */
  function aufstellungsfelder(embed) {
    const felder = embed.toJSON().fields ?? [];
    const start = felder.findIndex((f) => f.name === 'Aufstellung');
    const raus = felder.findIndex((f, i) => i > start && f.name !== '​');
    return felder.slice(start, raus === -1 ? undefined : raus);
  }

  function komposition(anzahl, besetzt = 0) {
    const slots = Array.from({ length: anzahl }, (_, i) =>
      i < besetzt ? slot(i, { discordId: String(i), displayName: `Spieler${i}`, rating: 7 }) : slot(i),
    );
    return { slots, bench: [], filled: besetzt, total: anzahl };
  }

  it('listet drei gleiche Waffen als drei Zeilen, nicht als ×3', () => {
    const felder = aufstellungsfelder(buildEventEmbed(event(), komposition(3, 1), []));
    const zeilen = felder.flatMap((f) => f.value.split('\n'));
    assert.equal(zeilen.length, 3);
    assert.doesNotMatch(felder[0].value, /×3/);
    assert.match(zeilen[0], /<@0>/, 'besetzte Plaetze nennen die Person als Erwaehnung');
    assert.match(zeilen[1], /frei/);
    assert.match(zeilen[2], /frei/);
  });

  it('bleibt bei 20 Plaetzen einspaltig', () => {
    const felder = aufstellungsfelder(buildEventEmbed(event(), komposition(20), []));
    assert.equal(felder.length, 1);
    assert.equal(felder[0].value.split('\n').length, 20);
    assert.notEqual(felder[0].inline, true);
  });

  it('setzt ab 21 Plaetzen nebeneinander statt auf eine zweite Nachricht', () => {
    const felder = aufstellungsfelder(buildEventEmbed(event(), komposition(21), []));
    assert.equal(felder.length, 2);
    assert.ok(felder.every((f) => f.inline === true), 'Spalten muessen inline sein');
    // Alle 21 Plaetze sind da, keiner faellt weg
    assert.equal(felder.flatMap((f) => f.value.split('\n')).length, 21);
  });

  it('schneidet bei 20 - auch mit Item-Bildern, nicht irgendwo', () => {
    // 35 Plaetze mit echten Emojis: das war der Fall, in dem es vorher in
    // drei Spalten und eine einsame Zeile zerfallen ist.
    const mitBild = {
      slots: Array.from({ length: 35 }, (_, i) =>
        slot(i, { icon: '<:T4_MAIN_SWORD:1537414852631470080>' }),
      ),
      bench: [],
      filled: 0,
      total: 35,
    };
    const felder = aufstellungsfelder(buildEventEmbed(event(), mitBild, []));
    assert.equal(felder.length, 2, 'genau zwei Spalten');
    assert.equal(felder[0].value.split('\n').length, 20, 'erste Spalte ist eine volle Gruppe');
    assert.equal(felder[1].value.split('\n').length, 15, 'zweite Spalte der Rest');
  });

  it('teilt gleichmaessig statt eine volle Spalte und einen Rest', () => {
    // Erzwingt die Zeichengrenze eine weitere Spalte, sollen alle aehnlich
    // lang sein - nicht 20, 20 und eine einzelne Zeile daneben.
    const lang = '<:T4_2H_IRONGAUNTLETS_HELL:1537414852631470080>';
    const viele = {
      slots: Array.from({ length: 41 }, (_, i) =>
        slot(i, { icon: lang, weaponName: 'Ravenstrike Cestus' }),
      ),
      bench: [],
      filled: 0,
      total: 41,
    };
    const felder = aufstellungsfelder(buildEventEmbed(event(), viele, []));
    const laengen = felder.map((f) => f.value.split('\n').length);
    assert.ok(Math.max(...laengen) - Math.min(...laengen) <= 1, `ungleich: ${laengen}`);
    assert.equal(laengen.reduce((a, b) => a + b, 0), 41);
  });

  it('kuerzt den Emoji-Namen, behaelt aber die ID', () => {
    const mitBild = {
      slots: [slot(0, { icon: '<:T4_MAIN_SWORD:1537414852631470080>' })],
      bench: [],
      filled: 0,
      total: 1,
    };
    const wert = aufstellungsfelder(buildEventEmbed(event(), mitBild, []))[0].value;
    assert.match(wert, /<:w:1537414852631470080>/);
    assert.doesNotMatch(wert, /T4_MAIN_SWORD/);
  });

  it('haelt jedes Feld unter Discords 1024 Zeichen', () => {
    const felder = aufstellungsfelder(buildEventEmbed(event(), komposition(60), []));
    for (const feld of felder) {
      assert.ok(feld.value.length <= 1024, `Feld ist ${feld.value.length} Zeichen lang`);
    }
    assert.equal(felder.flatMap((f) => f.value.split('\n')).length, 60);
  });

  it('behaelt die Reihenfolge der Comp', () => {
    const felder = aufstellungsfelder(buildEventEmbed(event(), komposition(21, 21), []));
    const zeilen = felder.flatMap((f) => f.value.split('\n'));
    zeilen.forEach((zeile, i) => assert.match(zeile, new RegExp(`<@${i}>`)));
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

describe('Plätze mit mehreren zugelassenen Waffen', () => {
  const optionen = [
    { id: 1, name: 'Axt', icon: '🪓' },
    { id: 2, name: 'Realmbreaker', icon: '⚔️' },
  ];

  function felder(embed) {
    return (embed.toJSON().fields ?? []).find((f) => f.name === 'Aufstellung').value;
  }

  it('nennt solange beide Waffen, wie der Platz frei ist', () => {
    const k = {
      slots: [slot(0, { weaponName: 'Axt', optionen })],
      bench: [],
      filled: 0,
      total: 1,
    };
    assert.match(felder(buildEventEmbed(event(), k, [])), /Axt \/ Realmbreaker/);
  });

  it('zeigt nur noch die gespielte Waffe, sobald jemand drauf steht', () => {
    const k = {
      slots: [
        slot(0, {
          weaponId: 2,
          weaponName: 'Realmbreaker',
          optionen,
          discordId: '1',
          displayName: 'Kaltblut',
          rating: 9,
        }),
      ],
      bench: [],
      filled: 1,
      total: 1,
    };
    const wert = felder(buildEventEmbed(event(), k, []));
    assert.match(wert, /Realmbreaker/);
    assert.doesNotMatch(wert, /Axt \/ /, 'nicht mehr beide, wenn besetzt');
    assert.match(wert, /<@1>/);
  });

  it('laesst einen Platz ohne Alternativen unveraendert', () => {
    const k = { slots: [slot(0)], bench: [], filled: 0, total: 1 };
    assert.match(felder(buildEventEmbed(event(), k, [])), /\*\*Broadsword\*\* — \*frei\*/);
  });
});

describe('Erwähnungen und Bild', () => {
  it('nennt besetzte Plätze als Erwähnung, damit Discord sie hervorhebt', () => {
    const k = {
      slots: [slot(0, { discordId: '675025401549946920', displayName: 'MasterMomon', rating: 8 })],
      bench: [],
      filled: 1,
      total: 1,
    };
    const wert = buildEventEmbed(event(), k, []).toJSON().fields[0].value;
    assert.match(wert, /<@675025401549946920>/);
    assert.doesNotMatch(wert, /MasterMomon/, 'der rohe Name gehoert nicht mehr rein');
  });

  it('hängt das Bild der Comp ans Embed', () => {
    const k = { slots: [slot(0)], bench: [], filled: 0, total: 1 };
    const mitBild = event({ image_url: 'https://example.com/comp.png' });
    assert.equal(buildEventEmbed(mitBild, k, []).toJSON().image?.url, 'https://example.com/comp.png');
  });

  it('kommt ohne Bild genauso zurecht', () => {
    const k = { slots: [slot(0)], bench: [], filled: 0, total: 1 };
    assert.equal(buildEventEmbed(event(), k, []).toJSON().image, undefined);
  });
});

describe('pingText', () => {
  it('gibt @here und @everyone wörtlich zurück', () => {
    assert.equal(pingText({ ping: 'here' }), '@here');
    assert.equal(pingText({ ping: 'everyone' }), '@everyone');
  });

  it('schweigt, wenn nichts eingestellt ist', () => {
    assert.equal(pingText({ ping: 'none' }), '');
    assert.equal(pingText({}), '');
  });
});

describe('Abmeldungen', () => {
  it('sagt es klar, wenn sich niemand abgemeldet hat', () => {
    assert.match(renderSignOffs([]), /niemand wieder abgemeldet/);
  });

  it('nennt jeden als Erwähnung mit Zeitpunkt', () => {
    const text = renderSignOffs([
      { discord_id: '111', display_name: 'A', updated_at: new Date(Date.now() - 5 * 60_000) },
      { discord_id: '222', display_name: 'B', updated_at: new Date(Date.now() - 60 * 60_000) },
    ]);
    assert.match(text, /2 Abmeldungen/);
    assert.match(text, /<@111>/);
    assert.match(text, /<@222>/);
    assert.match(text, /<t:\d+:R>/, 'mit relativem Zeitstempel');
  });

  it('beugt richtig bei genau einer', () => {
    const text = renderSignOffs([{ discord_id: '1', updated_at: new Date() }]);
    assert.match(text, /1 Abmeldung\*\*/);
    assert.doesNotMatch(text, /Abmeldungen/);
  });

  it('bleibt unter Discords 2000 Zeichen', () => {
    const viele = Array.from({ length: 120 }, (_, i) => ({
      discord_id: String(600000000000000000 + i),
      updated_at: new Date(),
    }));
    const text = renderSignOffs(viele);
    assert.ok(text.length <= 2000, `${text.length} Zeichen`);
    assert.match(text, /120 Abmeldungen/, 'die Gesamtzahl bleibt ehrlich');
    assert.match(text, /und weitere/);
  });
});

describe('Ping beim Einfrieren', () => {
  function besetzt(n) {
    return {
      slots: Array.from({ length: n }, (_, i) =>
        slot(i, {
          discordId: `${100 + i}`,
          displayName: `Spieler${i}`,
          rating: 8,
          label: 'Main Tank',
        }),
      ),
      bench: [],
      filled: n,
      total: n,
    };
  }

  it('setzt Waffe und Person auf dieselbe Zeile', () => {
    const text = buildLockMessage(event(), besetzt(3), null);
    const zeilen = text.split('\n').filter((z) => z.includes('<@1'));
    assert.equal(zeilen.length, 3, 'drei Plätze, drei Zeilen');
    for (const zeile of zeilen) {
      assert.match(zeile, /Main Tank · Broadsword.*<@1\d\d>/, 'Waffe und Person zusammen');
    }
  });

  it('nennt die Überschrift und die offenen Plätze', () => {
    const k = besetzt(2);
    k.slots.push(slot(2, { weaponName: 'Heavy Mace' }), slot(3, { weaponName: 'Heavy Mace' }));
    k.total = 4;
    const text = buildLockMessage(event({ title: 'Roam' }), k, null);
    assert.match(text, /\*\*Roam\*\* — Aufstellung steht/);
    assert.match(text, /2× Heavy Mace/);
  });

  it('pingt die Bank nicht, nennt sie aber', () => {
    const k = besetzt(1);
    k.bench = [{ discordId: '999', displayName: 'Wartender', bestRating: 5 }];
    const text = buildLockMessage(event(), k, null);
    assert.match(text, /Bank: Wartender/);
    assert.doesNotMatch(text, /<@999>/, 'die Bank wird nicht angepingt');
  });

  it('haengt die Rolle vorne an, wenn eine gesetzt ist', () => {
    assert.match(buildLockMessage(event(), besetzt(1), '4242'), /^<@&4242>/);
  });

  it('bleibt unter 2000 Zeichen und behält dabei Kopf und Fuß', () => {
    const k = besetzt(60);
    k.bench = [{ discordId: '1', displayName: 'Bankler', bestRating: 3 }];
    const text = buildLockMessage(event({ title: 'Grosse Comp' }), k, '4242');

    assert.ok(text.length <= 2000, `${text.length} Zeichen`);
    assert.match(text, /^<@&4242>/, 'Rollen-Ping bleibt');
    assert.match(text, /Grosse Comp/, 'Überschrift bleibt');
    assert.match(text, /Bank: Bankler/, 'Fuß bleibt');
    assert.match(text, /und \d+ weitere/, 'sagt, wie viele fehlen');
  });
});
