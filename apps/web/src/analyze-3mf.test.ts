// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { analyze3mfBuffer } from './analyze-3mf';

function build3mf(): ArrayBuffer {
  const files = new Map<string, string>([
    [
      '_rels/.rels',
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    ],
    [
      '3D/3dmodel.model',
      '<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources><object id="1" name="Cube"><mesh><vertices><vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/></vertices><triangles><triangle v1="0" v2="2" v3="1"/><triangle v1="0" v2="1" v3="3"/><triangle v1="0" v2="3" v3="2"/><triangle v1="1" v2="2" v3="3"/></triangles></mesh></object></resources><build><item objectid="1"/><item objectid="1" transform="1 0 0 0 1 0 0 0 1 30 0 0"/></build></model>',
    ],
  ]);
  const archive = zipSync(Object.fromEntries([...files].map(([path, value]) => [path, strToU8(value)])));
  return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength);
}

describe('analyze3mfBuffer', () => {
  it('returns one independently renderable part per 3MF build item', () => {
    const analysis = analyze3mfBuffer(build3mf());
    expect(analysis.quantity).toBe(2);
    expect(analysis.parts).toHaveLength(2);
    expect(analysis.parts.map((part) => part.name)).toEqual(['Cube', 'Cube']);
    expect(analysis.parts.every((part) => part.scene.children.length === 1)).toBe(true);
    expect(analysis.sizeX).toBe(40);
    expect(analysis.parts[0].sizeX).toBe(10);
    expect(analysis.parts[1].sizeX).toBe(10);
  });
});
