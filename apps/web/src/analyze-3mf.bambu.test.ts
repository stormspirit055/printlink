// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { Mesh } from 'three';
import { analyze3mfBuffer } from './analyze-3mf';

// Bambu Studio 3MF: the filament palette lives in project_settings.config and
// each triangle carries a Bambu-private face_property referencing the filament
// index. This mirrors how Bambu Studio marks different parts with different
// extruders so they can be sliced and rendered as separate color groups.
function buildBambu3mf(): ArrayBuffer {
  const config = JSON.stringify({ filament_colour: ['#FF0000', '#00FF00'] });
  const model = `<?xml version="1.0"?>
<model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <resources>
    <object id="1" name="RedPart"><mesh><vertices>
      <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
    </vertices><triangles>
      <triangle v1="0" v2="2" v3="1" face_property="0"/>
      <triangle v1="0" v2="1" v3="3" face_property="0"/>
      <triangle v1="0" v2="3" v3="2" face_property="0"/>
      <triangle v1="1" v2="2" v3="3" face_property="0"/>
    </triangles></mesh></object>
    <object id="2" name="GreenPart"><mesh><vertices>
      <vertex x="0" y="0" z="0"/><vertex x="10" y="0" z="0"/><vertex x="0" y="10" z="0"/><vertex x="0" y="0" z="10"/>
    </vertices><triangles>
      <triangle v1="0" v2="2" v3="1" face_property="1"/>
      <triangle v1="0" v2="1" v3="3" face_property="1"/>
      <triangle v1="0" v2="3" v3="2" face_property="1"/>
      <triangle v1="1" v2="2" v3="3" face_property="1"/>
    </triangles></mesh></object>
  </resources>
  <build><item objectid="1"/><item objectid="2" transform="1 0 0 0 1 0 0 0 1 30 0 0"/></build>
</model>`;
  const files = {
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    '3D/3dmodel.model': model,
    'Metadata/project_settings.config': config,
  };
  const archive = zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
  return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength);
}

describe('analyze3mfBuffer (Bambu multicolor)', () => {
  it('groups parts by filament color instead of rendering each piece separately', () => {
    const analysis = analyze3mfBuffer(buildBambu3mf());
    // Two colors => two color groups, regardless of how many build items exist.
    expect(analysis.parts).toHaveLength(2);
    expect(analysis.parts.map((part) => part.colorHex).sort()).toEqual(['#00ff00', '#ff0000']);
    // Each group keeps only its own color visible so it renders as a single
    // same-color pile; the other color is cloned but hidden.
    analysis.parts.forEach((part) => {
      const meshes: Mesh[] = [];
      part.scene.traverse((object) => {
        if (object instanceof Mesh) meshes.push(object);
      });
      expect(meshes.some((mesh) => mesh.visible)).toBe(true);
      expect(meshes.filter((mesh) => mesh.visible).every((mesh) => {
        const color = (mesh.material as { color?: { getHexString(): string } }).color;
        return color ? `#${color.getHexString()}` === part.colorHex : true;
      })).toBe(true);
    });
  });
});
