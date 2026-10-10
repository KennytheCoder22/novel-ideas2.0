import assert from 'node:assert/strict';
import sharp from 'sharp';
import * as h from './eligibility.mjs';
import { parseGlb, readAccessor, buildTree, nearestSurface, weighted, normalize, dot, sub, interpolatedNormal, rasterize } from './surface.mjs';
const { CONFIG, delta, sample, edge, protectedPoint } = h;
export async function revalidateLocalRegions(input, regions, gateDiagnostics) {
    const { json, bin } = parseGlb(input), result = [];
    // Only geometric/global coverage failures may use the local path. Compatibility
    // and strong global appearance conflicts cannot be bypassed by selecting patches.
    const fatal = gateDiagnostics.reasons.filter(x => !['Proposed bilateral plane lacks geometric support', 'Too little jointly safe local support', 'Insufficient mirrored appearance evidence', 'Global safety is unproven; restrict any repair to locally revalidated, appearance-consistent correspondences', 'Strong geometry and appearance agreement across sampled regions'].includes(x));
    if (fatal.length)
        return { decision: 'DECLINE', fatal, groups: [] };
    for (let gi = 0; gi < regions.length; gi++) {
        const primitive = regions[gi].primitive;
        assert(json.meshes.some(m => m.primitives.some(p => JSON.stringify(p) === JSON.stringify(primitive))));
        const pos = readAccessor(json, bin, primitive.attributes.POSITION, 3), uv = readAccessor(json, bin, primitive.attributes.TEXCOORD_0, 2), norm = readAccessor(json, bin, primitive.attributes.NORMAL, 3), ids = readAccessor(json, bin, primitive.indices, 1).flat();
        const min = [0, 1, 2].map(a => Math.min(...pos.map(p => p[a]))), max = [0, 1, 2].map(a => Math.max(...pos.map(p => p[a]))), extent = max.map((v, a) => v - min[a]), axis = extent.indexOf(Math.min(...extent)), long = [0, 1, 2].filter(a => a !== axis).sort((a, b) => extent[b] - extent[a])[0], g = { min, max, extent, axis, long, center: (min[axis] + max[axis]) / 2, half: extent[axis] / 2, scale: Math.max(...extent) };
        const triangles = [];
        for (let t = 0; t < ids.length; t += 3) {
            const v = ids.slice(t, t + 3), p = v.map(i => pos[i]), normal = normalize(weighted(v.map(i => norm[i]), [1 / 3, 1 / 3, 1 / 3]));
            triangles.push({ id: t / 3, p, uv: v.map(i => uv[i]), normals: v.map(i => norm[i]), normal, centroid: weighted(p, [1 / 3, 1 / 3, 1 / 3]) });
        }
        const mat = json.materials[primitive.material], tex = json.textures[mat.pbrMetallicRoughness.baseColorTexture.index], im = json.images[tex.source], view = json.bufferViews[im.bufferView], bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength), raw = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), { width, height } = raw.info, N = width * height;
        const original = Buffer.from(raw.data), image = { data: Buffer.from(original), width, height }, low = { data: await sharp(bytes).ensureAlpha().blur(Math.max(1, Math.min(width, height) / 256)).raw().toBuffer(), width, height };
        const factor = mat.pbrMetallicRoughness.baseColorFactor || [1, 1, 1, 1];
        for (let i = 0; i < N; i++)
            for (let c = 0; c < 3; c++) {
                image.data[i * 4 + c] *= factor[c];
                low.data[i * 4 + c] *= factor[c];
            }
        const primary = regions[gi].mask;
        assert.equal(primary.length, N);
        const owner = new Int32Array(N).fill(-1), weights1 = new Float64Array(N), weights2 = new Float64Array(N);
        for (const t of triangles)
            if (t.p.every(p => p[axis] > g.center))
                rasterize(t, width, height, (x, y, w) => { const i = y * width + x; owner[i] = owner[i] === -1 ? t.id : owner[i] === t.id ? t.id : -2; weights1[i] = w[0]; weights2[i] = w[1]; });
        const tree = buildTree(triangles.filter(t => t.p.some(p => p[axis] < g.center))), mask = new Uint8Array(N), reason = new Uint8Array(N), projected = Buffer.from(original), targetDelta = new Float32Array(N), edgeDiff = new Float32Array(N), ownerOut = new Int32Array(owner), distances = [], normalDots = [], des = [], lds = [];
        const sourceField = new Float32Array(N * 3), sourceOwner = new Int32Array(N).fill(-1);
        const stat = { group: gi, width, height, primaryTexels: 0, pairs: 0, geometryPassed: 0, localPassed: 0, severeConflicts: 0, rejections: { ownership: 0, distance: 0, normal: 0, sourceOwnership: 0, protected: 0, localDistance: 0, localNormal: 0, color: 0, lowFrequency: 0, edge: 0 }, allFailures: { localDistance: 0, localNormal: 0, color: 0, lowFrequency: 0, edge: 0 }, maximumAcceptedDeltaE: 0 };
        for (let i = 0; i < N; i++)
            if (primary[i]) {
                stat.primaryTexels++;
                if (owner[i] < 0) {
                    stat.rejections.ownership++;
                    reason[i] = 1;
                    continue;
                }
                const t = triangles[owner[i]], w = [weights1[i], weights2[i], 1 - weights1[i] - weights2[i]], p = weighted(t.p, w), n = interpolatedNormal(t, w), reflect = p.slice(), rn = n.slice();
                reflect[axis] = 2 * g.center - reflect[axis];
                rn[axis] *= -1;
                const m = nearestSurface(reflect, null, tree, g.scale * CONFIG.distanceFraction);
                if (!m) {
                    stat.rejections.distance++;
                    reason[i] = 2;
                    continue;
                }
                const sn = interpolatedNormal(m.tri, m.weights), nd = dot(rn, sn), sp = weighted(m.tri.p, m.weights), distance = Math.sqrt(m.distanceSquared) / g.scale;
                if (nd < CONFIG.normalAgreement) {
                    stat.rejections.normal++;
                    reason[i] = 3;
                    continue;
                }
                if (sp[axis] >= g.center) {
                    stat.rejections.sourceOwnership++;
                    reason[i] = 4;
                    continue;
                }
                stat.geometryPassed++;
                const tu = weighted(t.uv, w), su = weighted(m.tri.uv, m.weights), de = delta(sample(image, tu), sample(image, su)), ld = delta(sample(low, tu), sample(low, su)), ed = Math.abs(edge(image, tu) - edge(image, su));
                sourceOwner[i] = m.tri.id;
                sourceField.set(sample({ data: original, width, height }, su), i * 3);
                stat.pairs++;
                des.push(de);
                lds.push(ld);
                if (ld >= CONFIG.severeDeltaE)
                    stat.severeConflicts++;
                targetDelta[i] = de;
                edgeDiff[i] = ed;
                if (protectedPoint(p, n, g) || protectedPoint(sp, sn, g)) {
                    stat.rejections.protected++;
                    reason[i] = 5;
                    continue;
                }
                const failures = [['localDistance', distance > CONFIG.localDistanceFraction, 6], ['localNormal', nd < CONFIG.localNormalAgreement, 7], ['color', de > CONFIG.localDeltaE, 8], ['lowFrequency', ld > CONFIG.localLowFrequencyDeltaE, 9], ['edge', ed > CONFIG.localEdgeDifference, 10]];
                for (const [key, failed] of failures)
                    if (failed)
                        stat.allFailures[key]++;
                const first = failures.find(x => x[1]);
                if (first) {
                    stat.rejections[first[0]]++;
                    reason[i] = first[2];
                    continue;
                }
                mask[i] = 1;
                stat.localPassed++;
                stat.maximumAcceptedDeltaE = Math.max(stat.maximumAcceptedDeltaE, de);
                distances.push(distance);
                normalDots.push(nd);
                const color = sample({ data: original, width, height }, su);
                for (let c = 0; c < 3; c++)
                    projected[i * 4 + c] = Math.round(color[c]);
            }
        const median = a => a.length ? [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)] : null;
        const signals = { pairs: stat.pairs, geometryFraction: stat.geometryPassed / stat.primaryTexels, localFraction: stat.localPassed / stat.primaryTexels, conflictFraction: stat.severeConflicts / Math.max(1, stat.pairs), medianDeltaE: median(lds), axisAmbiguous: gateDiagnostics.groups[gi]?.axisAmbiguous ?? true, multipleMaterials: gateDiagnostics.signals.multipleMaterials, uvOverlapFraction: gateDiagnostics.groups[gi]?.uvLayout.overlapFraction ?? 1 };
        stat.regionSignals = signals;
        stat.proposedLocalDecision = h.decide(signals).decision;
        stat.proposedLocalReasons = h.decide(signals).reasons;
        stat.medianRawDeltaE = median(des);
        stat.maximumAcceptedDistance = distances.length ? Math.max(...distances) : null;
        stat.minimumAcceptedNormal = normalDots.length ? Math.min(...normalDots) : null;
        // Existing global admission or independently measured region-scoped admission.
        const global = gateDiagnostics.decision;
        stat.admitted = (global === 'LIMITED' || stat.proposedLocalDecision !== 'DECLINE');
        if (!stat.admitted) {
            mask.fill(0);
            original.copy(projected);
        }
        result.push({ stat, primitive, triangles, mask, primary, reason, targetDelta, edgeDiff, owner: ownerOut, sourceOwner, sourceField, original, projected, width, height });
    }
    return { decision: result.some(g => g.stat.admitted && g.stat.localPassed) ? 'LIMITED' : 'DECLINE', groups: result };
}
