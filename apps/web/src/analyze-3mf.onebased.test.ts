// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { analyze3mfBuffer } from './analyze-3mf';

// Bambu marks color with a 1-based filament index: extruder value="1" is the
// first filament, and multicolor files carry the same 1-based index on each
// triangle's face_property. A 2-color palette with face_property="2" must not
// throw "reading 'build'" (basematerials[2] out of range); it maps to filament 2.
function build1based(): ArrayBuffer {
  const config = JSON.stringify({ filament_colour: ['#FF0000', '#00FF00'] });
  const model = `<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="RedPart"><mesh><vertices>
      <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
    </vertices><triangles>
      <triangle v1="0" v2="2" v3="1" face_property="1"/>
      <triangle v1="0" v2="1" v3="3" face_property="1"/>
    </triangles></mesh></object>
    <object id="2" name="GreenPart"><mesh><vertices>
      <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
    </vertices><triangles>
      <triangle v1="0" v2="2" v3="1" face_property="2"/>
      <triangle v1="0" v2="1" v3="3" face_property="2"/>
    </triangles></mesh></object>
  </resources>
  <build><item objectid="1"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 30 0 0"/></build>
</model>`;
  const files = {
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    '3D/3dmodel.model': model,
    'Metadata/project_settings.config': config,
  };
  const a = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength);
}

describe('1-based face_property (Bambu multicolor)', () => {
  it('shifts 1-based indices and groups by color without throwing', () => {
    const analysis = analyze3mfBuffer(build1based());
    expect(analysis.parts.map((p) => p.colorHex).sort()).toEqual(['#00ff00', '#ff0000']);
  });
});
