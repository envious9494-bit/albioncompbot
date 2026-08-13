import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SKILL_STUFEN, summarise } from '../src/profile.js';

describe('Skill-Staffelung', () => {
  it('deckt jede Stufe von 1 bis 10 ab', () => {
    for (let stufe = 1; stufe <= 10; stufe += 1) {
      assert.ok(SKILL_STUFEN[stufe], `Stufe ${stufe} hat keine Bedeutung`);
    }
    assert.equal(Object.keys(SKILL_STUFEN).length, 10);
  });

  it('bleibt unter Discords 100 Zeichen je Beschreibung', () => {
    // Die Texte landen als description in einem Auswahlmenue. Laenger als
    // 100 Zeichen laesst Discord die Nachricht nicht durch - und zwar mit
    // einem Fehler, nicht mit einer Kuerzung.
    for (const [stufe, text] of Object.entries(SKILL_STUFEN)) {
      assert.ok(text.length <= 100, `Stufe ${stufe} ist ${text.length} Zeichen lang`);
    }
  });

  it('trennt Fullspec ab 7 von den Lernstufen darunter', () => {
    for (let stufe = 7; stufe <= 10; stufe += 1) {
      assert.match(SKILL_STUFEN[stufe], /Fullspec/, `Stufe ${stufe} sollte Fullspec nennen`);
    }
    for (let stufe = 1; stufe <= 6; stufe += 1) {
      assert.doesNotMatch(SKILL_STUFEN[stufe], /Fullspec/, `Stufe ${stufe} sollte kein Fullspec sein`);
    }
  });
});

// ---------------------------------------------------------------------
//  Uebersicht: Discord nimmt hoechstens 2000 Zeichen
// ---------------------------------------------------------------------

/** 139 Waffen wie in der echten Datenbank, verteilt auf 8 Kategorien. */
function waffenliste(anzahl = 139) {
  const kategorien = [
    'Schwerter', 'Äxte', 'Hämmer', 'Stäbe',
    'Bögen', 'Armbrüste', 'Naturstäbe', 'Kriegshandschuhe',
  ];
  return Array.from({ length: anzahl }, (_, i) => ({
    id: i + 1,
    name: `Sehr langer Waffenname Nummer ${i + 1}`,
    category: kategorien[i % kategorien.length],
    icon: '⚔️',
  }));
}

describe('Profilübersicht', () => {
  it('zaehlt statt aufzuzaehlen, wenn die Liste zu lang wird', () => {
    const waffen = waffenliste();
    const alle = new Map(waffen.map((w) => [w.id, 7]));
    const text = summarise(waffen, alle, 1500);

    assert.ok(text.length <= 1500, `${text.length} Zeichen`);
    assert.match(text, /139 Waffen/);
    // Zusammengezaehlt, nicht abgehackt
    assert.doesNotMatch(text, /…$/);
    assert.match(text, /Schwerter · \d+/);
  });

  it('zaehlt bei wenigen Waffen weiterhin einzeln auf', () => {
    const waffen = waffenliste(4);
    const paar = new Map(waffen.slice(0, 3).map((w) => [w.id, 8]));
    const text = summarise(waffen, paar, 1500);

    assert.match(text, /Sehr langer Waffenname Nummer 1 `8`/);
    assert.match(text, /3 Waffen/);
  });

  it('haelt jedes Budget ein, auch ein winziges', () => {
    const waffen = waffenliste();
    const alle = new Map(waffen.map((w) => [w.id, 7]));
    for (const budget of [1500, 800, 300, 120]) {
      const text = summarise(waffen, alle, budget);
      assert.ok(text.length <= budget || text.length <= 60, `Budget ${budget}: ${text.length} Zeichen`);
    }
  });

  it('sagt etwas Sinnvolles, wenn noch nichts eingetragen ist', () => {
    assert.match(summarise(waffenliste(), new Map(), 1500), /noch keine Waffe/);
  });
});
