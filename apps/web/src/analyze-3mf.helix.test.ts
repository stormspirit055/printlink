// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { analyze3mfBuffer } from './analyze-3mf';
const file = '/Users/storm/Downloads/HelixCore_Multi_Color_Type_B_add_stopper_20260626.3mf';
const d = existsSync(file) ? describe : describe.skip;
d('helix extruder grouping', () => {
  it('one pile per extruder, no duplication', () => {
    const raw = readFileSync(file);
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
    const a = analyze3mfBuffer(buf);
    // each part.scene wraps a single cloned group; that group's children are the
    // build items assigned to this extruder pile
    const perPile = a.parts.map((p) => p.scene.children[0]?.children?.length ?? 0);
    const total = perPile.reduce((s, n) => s + n, 0);
    const colors = a.parts.map((p) => p.colorHex);
    console.log(
      'quantity=' + a.quantity,
      'colors=' + JSON.stringify(colors),
      'perPile=' + JSON.stringify(perPile),
      'total=' + total,
      'buildItems=' + a.scene.children.length,
    );
    expect(a.quantity).toBe(3);
    expect(total).toBe(a.scene.children.length); // every build item in exactly one pile
  }, 30000);
});
