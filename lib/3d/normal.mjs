import sharp from 'sharp';
import { parseGlb, serializeGlb, readAccessor } from './surface.mjs';
import { evaluateEligibility } from './eligibility.mjs';
import { primaryRegions } from './primary.mjs';
import { revalidateLocalRegions } from './local.mjs';
import { structuralMask } from './structure.mjs';
import { utilityEvidence, utilityDecision } from './utility.mjs';
import { utilitySignals } from './visibility.mjs';
// Deliberately private: only the successful normal-gate branch can serialize a repair.
async function reconstruct(input, groups) {
    const parsed = parseGlb(input), j = parsed.json, parts = [parsed.bin];
    let length = parsed.bin.length;
    function append(bytes, target) { const pad = (4 - length % 4) % 4; if (pad) {
        parts.push(Buffer.alloc(pad));
        length += pad;
    } const index = j.bufferViews.length; j.bufferViews.push({ buffer: 0, byteOffset: length, byteLength: bytes.length, ...(target ? { target } : {}) }); parts.push(bytes); length += bytes.length; return index; }
    for (const g of groups) {
        if (!g.evidence.predictedChangedTexels)
            continue;
        let mesh, primitive;
        for (const m of j.meshes)
            for (const p of m.primitives)
                if (JSON.stringify(p) === JSON.stringify(g.primitive)) {
                    mesh = m;
                    primitive = p;
                }
        if (!primitive)
            throw Error('Ambiguous reconstruction mapping');
        const pixels = Buffer.from(g.original);
        for (let i = 0; i < g.authorized.length; i++)
            if (g.authorized[i])
                for (let c = 0; c < 3; c++)
                    pixels[i * 4 + c] = Math.max(0, Math.min(255, Math.floor(Math.fround(g.sourceField[i * 3 + c] + .5))));
        const png = await sharp(pixels, { raw: { width: g.width, height: g.height, channels: 4 } }).png().toBuffer(), image = j.images.length;
        j.images.push({ bufferView: append(png), mimeType: 'image/png' });
        const material = structuredClone(j.materials[primitive.material]), texture = structuredClone(j.textures[material.pbrMetallicRoughness.baseColorTexture.index]);
        texture.source = image;
        const textureIndex = j.textures.length;
        j.textures.push(texture);
        material.pbrMetallicRoughness.baseColorTexture.index = textureIndex;
        const materialIndex = j.materials.length;
        j.materials.push(material);
        const ids = readAccessor(j, parsed.bin, primitive.indices, 1).flat(), runs = [];
        let run = null;
        for (let t = 0; t < ids.length / 3; t++) {
            const mat = g.accepted.has(t) ? materialIndex : primitive.material;
            if (!run || run.material !== mat) {
                run = { material: mat, ids: [] };
                runs.push(run);
            }
            run.ids.push(...ids.slice(t * 3, t * 3 + 3));
        }
        const replacements = runs.map(run => { const data = Buffer.alloc(run.ids.length * 4); run.ids.forEach((id, i) => data.writeUInt32LE(id, i * 4)); const accessor = j.accessors.length; j.accessors.push({ bufferView: append(data, 34963), componentType: 5125, count: run.ids.length, type: 'SCALAR' }); return { ...primitive, indices: accessor, material: run.material }; });
        mesh.primitives.splice(mesh.primitives.indexOf(primitive), 1, ...replacements);
    }
    j.buffers[0].byteLength = length;
    return serializeGlb(parsed, Buffer.concat(parts));
}
/** The sole production entrypoint. No caller-supplied decisions, masks or thresholds. */
export async function processNormalSymmetry(input) {
    const stages = [], unchanged = (reason) => ({ buffer: input, action: 'UNCHANGED', stages: [...stages], reason });
    try {
        stages.push('eligibility');
        const global = await evaluateEligibility(input), compatibility = await revalidateLocalRegions(input, [], global);
        if (compatibility.fatal?.length) {
            stages.push('utility');
            utilityDecision('DECLINE', {});
            return unchanged('Eligibility declined');
        }
        const regions = await primaryRegions(input), local = await revalidateLocalRegions(input, regions, global);
        stages.push('structural-continuity');
        const groups = local.groups.map((g, i) => { const authorized = structuralMask(g); return { ...g, authorized, accepted: regions[i].accepted, evidence: utilityEvidence(g, authorized) }; });
        const eligibility = groups.some(g => g.authorized.some(Boolean)) ? 'LIMITED' : 'DECLINE';
        stages.push('utility');
        const signals = eligibility === 'DECLINE' ? {} : utilitySignals(input, groups);
        if (!utilityDecision(eligibility, signals))
            return { ...unchanged('Normal utility not positive'), signals };
        stages.push('reconstruction');
        const output = await reconstruct(input, groups);
        return { buffer: output, action: 'RECONSTRUCT_AUTHORIZED_ONLY', stages: [...stages], signals };
    }
    catch {
        return unchanged('Unsupported input or incomplete gate evidence');
    }
}
