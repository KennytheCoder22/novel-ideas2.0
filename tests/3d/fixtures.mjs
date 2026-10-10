import fs from 'node:fs';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { serializeGlb } from '../../lib/3d/surface.mjs';
export const recipe = JSON.parse(fs.readFileSync(new URL('./fixtures.json', import.meta.url)));
export function pixels(name) { const raw = Buffer.alloc(recipe.width * recipe.height * 4); let at = 0; for (const [count, ...rgba] of recipe.textureRuns)
    for (let i = 0; i < count; i++) {
        raw.set(rgba, at);
        at += 4;
    } const clean = Buffer.from(raw), fixture = recipe.cases.find(c => c.name === name); if (fixture)
    for (const [i, ...rgba] of fixture.edits)
        raw.set(rgba, i * 4); if (fixture && createHash('sha256').update(raw).digest('hex') !== fixture.rgbaSha256)
    throw Error('Frozen fixture texture mismatch'); return { raw, clean, fixture }; }
export async function model(name = 'CleanArt__untouched__isolated', alter = () => { }) {
    const { raw } = pixels(name), png = await sharp(raw, { raw: { width: recipe.width, height: recipe.height, channels: 4 } }).png().toBuffer(), j = { asset: { version: '2.0' }, buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], images: [], textures: [{ source: 0, sampler: 0 }], samplers: [recipe.sampler], materials: [recipe.material], meshes: [{ primitives: [] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 }, parts = [];
    let length = 0;
    function append(data) { const pad = (4 - length % 4) % 4; if (pad) {
        parts.push(Buffer.alloc(pad));
        length += pad;
    } const id = j.bufferViews.length; j.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: data.length }); parts.push(data); length += data.length; return id; }
    for (const [values, type, componentType] of [[recipe.positions, 'VEC3', 5126], [recipe.normals, 'VEC3', 5126], [recipe.uvs, 'VEC2', 5126], [recipe.indices, 'SCALAR', 5125]]) {
        const a = values.flat(), data = Buffer.alloc(a.length * 4);
        a.forEach((v, i) => componentType === 5126 ? data.writeFloatLE(v, i * 4) : data.writeUInt32LE(v, i * 4));
        j.accessors.push({ bufferView: append(data), componentType, type, count: values.length });
    }
    j.images.push({ bufferView: append(png), mimeType: 'image/png' });
    j.meshes[0].primitives.push({ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 });
    j.buffers[0].byteLength = length;
    alter(j);
    const bin = Buffer.concat(parts);
    return serializeGlb({ json: j, bin, chunks: [{ type: 0x4e4f534a }, { type: 0x004e4942 }] });
}
