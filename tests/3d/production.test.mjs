import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import handler from '../../api/3d-generate.ts';
import * as normal from '../../lib/3d/normal.mjs';
import { parseGlb, readAccessor } from '../../lib/3d/surface.mjs';
import { model, pixels, recipe } from './fixtures.mjs';
import { CONFIG } from '../../lib/3d/eligibility.mjs';
import { UTILITY_POLICY, utilityDecision } from '../../lib/3d/utility.mjs';
import { STRUCTURE_POLICY } from '../../lib/3d/structure.mjs';
async function request(t, glb, extra = {}) {
    const saved = globalThis.fetch, key = process.env.STABILITY_API_KEY;
    let calls = 0;
    process.env.STABILITY_API_KEY = 'test-never-a-real-key';
    globalThis.fetch = async (url, options) => { assert.equal(url, 'https://api.stability.ai/v2beta/3d/stable-fast-3d'); assert.equal(options.method, 'POST'); calls++; return new Response(glb, { status: 200, headers: { 'Content-Type': 'model/gltf-binary' } }); };
    const headers = {}, res = { statusCode: 200, setHeader(k, v) { headers[k] = v; return this; }, status(v) { this.statusCode = v; return this; }, send(v) { this.body = v; return this; }, json(v) { this.body = v; return this; } };
    try {
        await handler({ method: 'POST', headers: { host: 'test.local', origin: 'https://test.local' }, body: { mimeType: 'image/png', imageBase64: 'dGVzdA==', hiddenSideMode: 'mirror', ...extra } }, res);
    }
    finally {
        globalThis.fetch = saved;
        if (key === undefined)
            delete process.env.STABILITY_API_KEY;
        else
            process.env.STABILITY_API_KEY = key;
    }
    assert.equal(calls, 1);
    assert.equal(res.statusCode, 200);
    return { body: res.body, headers };
}
function invariants(input, output) {
    const a = parseGlb(input), b = parseGlb(output);
    assert.deepEqual(b.bin.subarray(0, a.bin.length), a.bin);
    for (const key of ['nodes', 'scenes', 'scene', 'skins', 'animations', 'samplers'])
        assert.deepEqual(b.json[key], a.json[key]);
    for (const key of ['accessors', 'bufferViews', 'materials', 'textures', 'images'])
        assert.deepEqual(b.json[key].slice(0, a.json[key].length), a.json[key]);
    assert.equal(b.json.meshes.length, a.json.meshes.length);
    const ordered = (j, bin, mesh) => mesh.primitives.flatMap(p => { const ids = readAccessor(j, bin, p.indices, 1).flat(), rows = []; for (let i = 0; i < ids.length; i += 3)
        rows.push({ attributes: p.attributes, ids: ids.slice(i, i + 3), mode: p.mode || 4 }); return rows; });
    for (let i = 0; i < a.json.meshes.length; i++)
        assert.deepEqual(ordered(a.json, a.bin, a.json.meshes[i]), ordered(b.json, b.bin, b.json.meshes[i]));
}
async function image(glb, i) { const { json: j, bin } = parseGlb(glb), v = j.bufferViews[j.images[i].bufferView]; return sharp(bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength)).ensureAlpha().raw().toBuffer(); }
test('production API authorizes the frozen 1,161 exact repairs only after all gates', async (t) => {
    const input = await model('known_damage'), { body, headers } = await request(t, input);
    assert.equal(headers['X-NovelIdeas-Symmetry-Action'], 'RECONSTRUCT_AUTHORIZED_ONLY');
    assert.equal(headers['X-NovelIdeas-Symmetry-Stages'], 'eligibility,structural-continuity,utility,reconstruction');
    invariants(input, body);
    const original = pixels('known_damage'), result = await image(body, 1);
    let changed = 0, correct = 0, falseWrites = 0;
    for (let i = 0; i < result.length; i += 4) {
        const differs = !result.subarray(i, i + 4).equals(original.raw.subarray(i, i + 4));
        if (differs) {
            changed++;
            if (result.subarray(i, i + 4).equals(original.clean.subarray(i, i + 4)))
                correct++;
            if (original.raw.subarray(i, i + 4).equals(original.clean.subarray(i, i + 4)))
                falseWrites++;
        }
    }
    assert.equal(changed, 1161);
    assert.equal(correct, 1161);
    assert.equal(falseWrites, 0);
});
for (const c of recipe.cases.filter(c => c.name.startsWith('CleanArt__')))
    test(`production preserves adversarial clean fixture: ${c.name}`, async (t) => { const input = await model(c.name), { body, headers } = await request(t, input, { eligibility: 'APPROVE', utility: 'POSITIVE', force: true, skipEligibility: true, debugTriangleCorrespondence: true }); assert.deepEqual(body, input); assert.equal(headers['X-NovelIdeas-Symmetry-Action'], 'UNCHANGED'); assert.equal(headers['X-NovelIdeas-Symmetry-Stages'], 'eligibility,structural-continuity,utility'); invariants(input, body); });
test('unsupported mapping cannot be forced through API or exported processing entrypoint', async (t) => { assert.deepEqual(Object.keys(normal), ['processNormalSymmetry']); for (const alter of [j => { delete j.meshes[0].primitives[0].attributes.TEXCOORD_0; }, j => { j.skins = [{ joints: [0] }]; }, j => { j.extensionsRequired = ['unknown']; }]) {
    const input = await model(undefined, alter), copy = Buffer.from(input), direct = await normal.processNormalSymmetry(input, { force: true, eligibility: 'APPROVE', utility: 'POSITIVE' });
    assert.equal(direct.buffer, input);
    assert.deepEqual(input, copy);
    assert(!direct.stages.includes('reconstruction'));
    const result = await request(t, input, { force: true, eligibility: 'APPROVE', utility: 'POSITIVE' });
    assert.deepEqual(result.body, input);
    assert.equal(result.headers['X-NovelIdeas-Symmetry-Stages'], 'eligibility,utility');
} });
test('infer remains a byte-identical pass-through', async (t) => { const input = await model('known_damage'), result = await request(t, input, { hiddenSideMode: 'infer' }); assert.deepEqual(result.body, input); assert.equal(result.headers['X-NovelIdeas-Symmetry-Stages'], undefined); });
test('malformed input fails closed without a reconstruction stage', async () => { const input = Buffer.from('invalid GLB'); const result = await normal.processNormalSymmetry(input); assert.equal(result.buffer, input); assert(!result.stages.includes('reconstruction')); });
test('frozen policy thresholds and fail-closed utility boundaries', () => {
    assert.deepEqual(CONFIG, { version: 1, samplesPerPrimitive: 2048, minPairs: 128, distanceFraction: .025, normalAgreement: .75, localDistanceFraction: .01, localNormalAgreement: .9, localDeltaE: 8, localLowFrequencyDeltaE: 6, localEdgeDifference: .06, severeDeltaE: 30, declineConflictFraction: .35, declineMedianDeltaE: 25, minimumGeometryFraction: .6, minimumLocalFraction: .02, approveGeometryFraction: .95, approveLocalFraction: .9, approveConflictFraction: .01, approveUVOverlapFraction: .01, minimumAxisAdvantage: .1, maxTexturePixels: 4096 * 4096 });
    assert.deepEqual(STRUCTURE_POLICY, { windows: [3, 7], orientationMinimumSimilarity: .9, directionalConsistencyMaximumDifference: .06, centeredPatternMaximumRMS: .06, gradientPatternMaximumRMS: .06, flatNumericalEpsilon: 1e-12 });
    assert.deepEqual(UTILITY_POLICY, { version: 1, neighborhood: 5, minimum_defect_contrast: 12 / 255, maximum_context_dispersion: 3 / 255, maximum_source_residual: 3 / 255, maximum_context_disagreement: 3 / 255, minimum_defect_reduction: 8 / 255, minimum_defect_surface_fraction: .001, minimum_visible_repair_pixels: 64, minimum_visible_repair_fraction: .001, minimum_explained_change_fraction: .5, minimum_error_reduction_fraction: .5, maximum_boundary_regression: 0, review_resolution: 512 });
    const good = { supportedDefectTexels: 10, defectSurfaceFraction: .001, visibleRepairPixels: 64, visibleRepairFraction: .001, explainedChangeFraction: .5, errorReductionFraction: .5, boundaryRegression: 0 };
    assert(utilityDecision('LIMITED', good));
    assert(!utilityDecision('DECLINE', good));
    assert(!utilityDecision('LIMITED', {}));
    for (const key of Object.keys(good)) {
        assert(!utilityDecision('LIMITED', { ...good, [key]: NaN }));
    }
    for (const [key, value] of [['supportedDefectTexels', 0], ['defectSurfaceFraction', .0009], ['visibleRepairPixels', 63], ['visibleRepairFraction', .0009], ['explainedChangeFraction', .49], ['errorReductionFraction', .49], ['boundaryRegression', .00001]])
        assert(!utilityDecision('LIMITED', { ...good, [key]: value }));
});

test('positive local defect evidence still cannot bypass a negative utility decision', async t => {
 const input = await model('small_defect_utility_declines');
 const result = await normal.processNormalSymmetry(input);
 assert.equal(result.signals.supportedDefectTexels, 9);
 assert.equal(result.signals.predictedChangedTexels, 9);
 assert.equal(result.action, 'UNCHANGED');
 assert.equal(result.buffer, input);
 assert.deepEqual(result.stages, ['eligibility', 'structural-continuity', 'utility']);
 const api = await request(t, input, {utility:'POSITIVE',force:true,skipUtility:true});
 assert.deepEqual(api.body, input);
 assert.equal(api.headers['X-NovelIdeas-Symmetry-Action'], 'UNCHANGED');
 assert.equal(api.headers['X-NovelIdeas-Symmetry-Stages'], 'eligibility,structural-continuity,utility');
});
