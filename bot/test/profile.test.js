import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SKILL_STUFEN } from '../src/profile.js';

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
