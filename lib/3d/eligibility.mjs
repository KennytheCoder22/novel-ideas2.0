import crypto from 'node:crypto';
import sharp from 'sharp';
import { parseGlb, readAccessor, buildTree, nearestSurface, weighted, normalize, dot, sub, interpolatedNormal } from './surface.mjs';
// Registered before the validation run; one configuration for all inputs.
export const CONFIG = Object.freeze({ version: 1, samplesPerPrimitive: 2048, minPairs: 128, distanceFraction: .025, normalAgreement: .75, localDistanceFraction: .01, localNormalAgreement: .9, localDeltaE: 8, localLowFrequencyDeltaE: 6, localEdgeDifference: .06, severeDeltaE: 30, declineConflictFraction: .35, declineMedianDeltaE: 25, minimumGeometryFraction: .6, minimumLocalFraction: .02, approveGeometryFraction: .95, approveLocalFraction: .9, approveConflictFraction: .01, approveUVOverlapFraction: .01, minimumAxisAdvantage: .1, maxTexturePixels: 4096 * 4096 });
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const quantile = (v, q) => v.length ? [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(q * (v.length - 1)))] : null;
function lab(rgb) { const c = rgb.map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }); let [r, g, b] = c; let xyz = [(.4124564 * r + .3575761 * g + .1804375 * b) / .95047, .2126729 * r + .7151522 * g + .072175 * b, (.0193339 * r + .119192 * g + .9503041 * b) / 1.08883].map(v => v > 216 / 24389 ? Math.cbrt(v) : v * 24389 / 27 / 116 + 16 / 116); return [116 * xyz[1] - 16, 500 * (xyz[0] - xyz[1]), 200 * (xyz[1] - xyz[2])]; }
const delta = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
function sample(im, uv) { const { data, width, height } = im; const x = Math.max(0, Math.min(width - 1, uv[0] * width - .5)), y = Math.max(0, Math.min(height - 1, uv[1] * height - .5)); let ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy; return [0, 1, 2].map(c => [[ix, iy, (1 - fx) * (1 - fy)], [Math.min(ix + 1, width - 1), iy, fx * (1 - fy)], [ix, Math.min(iy + 1, height - 1), (1 - fx) * fy], [Math.min(ix + 1, width - 1), Math.min(iy + 1, height - 1), fx * fy]].reduce((s, [px, py, w]) => s + w * data[(py * width + px) * 4 + c], 0)); }
function edge(im, uv) { const dx = 1 / im.width, dy = 1 / im.height; const a = sample(im, [uv[0] - dx, uv[1]]), b = sample(im, [uv[0] + dx, uv[1]]), c = sample(im, [uv[0], uv[1] - dy]), d = sample(im, [uv[0], uv[1] + dy]); return Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2 + (c[i] - d[i]) ** 2, 0) / 6) / 255; }
function protectedPoint(p, n, g) { const depth = Math.abs((p[g.axis] - g.center) / g.half); return depth <= .12 || p[g.long] < g.min[g.long] + g.extent[g.long] * .04 || p[g.long] > g.max[g.long] - g.extent[g.long] * .04 || Math.abs(n[g.long]) > .85 || Math.abs(n[g.axis]) < (depth < .28 ? .55 : .30); }
function sequence(tris, count) { const total = tris.reduce((s, t) => s + t.area, 0); if (!total)
    return []; let j = 0, acc = tris[0].area; return Array.from({ length: count }, (_, i) => { const at = (i + .5) * total / count; while (j < tris.length - 1 && acc < at)
    acc += tris[++j].area; const u = Math.sqrt(((i + 1) * .7548776662466927) % 1), v = ((i + 1) * .5698402909980532) % 1; return { tri: tris[j], weights: [1 - u, u * (1 - v), u * v] }; }); }
function geometry(tris, points, g, axis) { const center = (g.min[axis] + g.max[axis]) / 2, halves = [buildTree(tris.filter(t => t.p.some(p => p[axis] < center))), buildTree(tris.filter(t => t.p.some(p => p[axis] > center)))]; let good = 0, total = 0, dist = [], normals = []; for (const s of points) {
    let p = weighted(s.tri.p, s.weights), n = interpolatedNormal(s.tri, s.weights);
    if (Math.abs(p[axis] - center) < g.extent[axis] * .06)
        continue;
    const half = p[axis] > center ? 0 : 1;
    p[axis] = 2 * center - p[axis];
    n[axis] *= -1;
    total++;
    const m = nearestSurface(p, null, halves[half], g.scale * CONFIG.distanceFraction);
    if (m) {
        const nd = dot(n, interpolatedNormal(m.tri, m.weights));
        dist.push(Math.sqrt(m.distanceSquared) / g.scale);
        normals.push(nd);
        if (nd >= CONFIG.normalAgreement)
            good++;
    }
} return { axis, evaluated: total, matchedFraction: total ? good / total : 0, distanceP95: quantile(dist, .95), normalMedian: quantile(normals, .5) }; }
function uvOverlap(tris) { const size = 128, owner = new Int32Array(size * size).fill(-1), overlap = new Uint8Array(size * size); for (const t of tris) {
    const q = t.uv.map(v => v.map(x => x * size));
    let xmin = Math.max(0, Math.ceil(Math.min(...q.map(v => v[0])) - .5)), xmax = Math.min(size - 1, Math.floor(Math.max(...q.map(v => v[0])) - .5)), ymin = Math.max(0, Math.ceil(Math.min(...q.map(v => v[1])) - .5)), ymax = Math.min(size - 1, Math.floor(Math.max(...q.map(v => v[1])) - .5));
    const d = (q[1][1] - q[2][1]) * (q[0][0] - q[2][0]) + (q[2][0] - q[1][0]) * (q[0][1] - q[2][1]);
    if (Math.abs(d) < 1e-12)
        continue;
    for (let y = ymin; y <= ymax; y++)
        for (let x = xmin; x <= xmax; x++) {
            const a = ((q[1][1] - q[2][1]) * (x + .5 - q[2][0]) + (q[2][0] - q[1][0]) * (y + .5 - q[2][1])) / d, b = ((q[2][1] - q[0][1]) * (x + .5 - q[2][0]) + (q[0][0] - q[2][0]) * (y + .5 - q[2][1])) / d;
            if (a > 1e-6 && b > 1e-6 && 1 - a - b > 1e-6) {
                const i = y * size + x;
                if (owner[i] >= 0)
                    overlap[i] = 1;
                owner[i] = t.id;
            }
        }
} let used = 0, conflict = 0; for (let i = 0; i < owner.length; i++)
    if (owner[i] >= 0) {
        used++;
        conflict += overlap[i];
    } return { resolution: size, occupied: used, overlapFraction: used ? conflict / used : 1 }; }
export function decide(s, issues = []) { const reasons = [...issues]; if (s.pairs < CONFIG.minPairs)
    reasons.push('Insufficient mirrored appearance evidence'); if (s.geometryFraction < CONFIG.minimumGeometryFraction)
    reasons.push('Proposed bilateral plane lacks geometric support'); if (s.conflictFraction >= CONFIG.declineConflictFraction || s.medianDeltaE >= CONFIG.declineMedianDeltaE)
    reasons.push('Large mirrored appearance conflict'); if (s.localFraction < CONFIG.minimumLocalFraction)
    reasons.push('Too little jointly safe local support'); if (reasons.length)
    return { decision: 'DECLINE', reasons }; const approve = s.geometryFraction >= CONFIG.approveGeometryFraction && s.localFraction >= CONFIG.approveLocalFraction && s.conflictFraction <= CONFIG.approveConflictFraction && s.uvOverlapFraction <= CONFIG.approveUVOverlapFraction && !s.axisAmbiguous && !s.multipleMaterials; if (approve)
    return { decision: 'APPROVE', reasons: ['Strong geometry and appearance agreement across sampled regions'] }; return { decision: 'LIMITED', reasons: ['Global safety is unproven; restrict any repair to locally revalidated, appearance-consistent correspondences'] }; }
export async function evaluateEligibility(input) {
    const originalHash = hash(input), issues = [], groups = [];
    let parsed;
    try {
        parsed = parseGlb(input);
    }
    catch (e) {
        return { decision: 'DECLINE', reasons: [e.message], inputSha256: originalHash, unchanged: true, policy: { runReconstruction: false } };
    }
    const { json, bin } = parsed;
    if (json.extensionsRequired?.length)
        issues.push('Required extensions unsupported');
    if (json.skins?.length)
        issues.push('Skinning unsupported');
    for (let mi = 0; mi < (json.meshes || []).length; mi++)
        for (let pi = 0; pi < (json.meshes[mi].primitives || []).length; pi++) {
            const primitive = json.meshes[mi].primitives[pi];
            try {
                const mat = json.materials?.[primitive.material], tex = mat?.pbrMetallicRoughness?.baseColorTexture, texture = json.textures?.[tex?.index], im = json.images?.[texture?.source];
                if (!tex || !im || im.bufferView === undefined)
                    throw Error('Embedded base-color texture required');
                if ((primitive.mode ?? 4) !== 4 || primitive.targets || primitive.extensions || mat.alphaMode === 'BLEND' || tex.extensions || texture.extensions)
                    throw Error('Unsupported primitive or material mapping');
                const p = readAccessor(json, bin, primitive.attributes.POSITION, 3), uv = readAccessor(json, bin, primitive.attributes['TEXCOORD_' + (tex.texCoord ?? 0)], 2), normals = primitive.attributes.NORMAL === undefined ? null : readAccessor(json, bin, primitive.attributes.NORMAL, 3);
                if (p.length !== uv.length || uv.some(v => v.some(x => x < 0 || x > 1)))
                    throw Error('UV range outside supported [0,1] layout');
                if (normals && normals.length !== p.length)
                    throw Error('Invalid normal accessor');
                const ids = primitive.indices === undefined ? p.map((_, i) => i) : readAccessor(json, bin, primitive.indices, 1).flat();
                if (ids.length % 3 || ids.some(i => !Number.isInteger(i) || i < 0 || i >= p.length))
                    throw Error('Invalid indices');
                const min = [0, 1, 2].map(a => Math.min(...p.map(v => v[a]))), max = [0, 1, 2].map(a => Math.max(...p.map(v => v[a]))), extent = max.map((x, a) => x - min[a]), axis = extent.indexOf(Math.min(...extent)), long = [0, 1, 2].filter(a => a !== axis).sort((a, b) => extent[b] - extent[a])[0];
                const g = { axis, long, min, max, extent, center: (min[axis] + max[axis]) / 2, half: extent[axis] / 2, scale: Math.max(...extent) };
                if (g.half <= 1e-9)
                    throw Error('Degenerate symmetry extent');
                const triangles = [];
                for (let i = 0; i < ids.length; i += 3) {
                    let v = ids.slice(i, i + 3), points = v.map(i => p[i]), cr = cross(sub(points[1], points[0]), sub(points[2], points[0])), area = Math.hypot(...cr) / 2, normal = normalize(cr);
                    if (area > 1e-16)
                        triangles.push({ id: i / 3, p: points, uv: v.map(i => uv[i]), normals: normals ? v.map(i => normals[i]) : [normal, normal, normal], normal, centroid: weighted(points, [1 / 3, 1 / 3, 1 / 3]), area });
                }
                const view = json.bufferViews[im.bufferView], bytes = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
                const meta = await sharp(bytes).metadata();
                if (meta.width * meta.height > CONFIG.maxTexturePixels)
                    throw Error('Texture exceeds frozen pipeline size limit');
                const raw = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
                const image = { data: raw.data, width: raw.info.width, height: raw.info.height };
                const blur = await sharp(bytes).ensureAlpha().blur(Math.max(1, Math.min(image.width, image.height) / 256)).raw().toBuffer();
                const low = { ...image, data: blur };
                const factor = mat.pbrMetallicRoughness.baseColorFactor || [1, 1, 1, 1];
                for (let k = 0; k < image.data.length; k += 4)
                    for (let c = 0; c < 3; c++) {
                        image.data[k + c] *= factor[c];
                        low.data[k + c] *= factor[c];
                    }
                const points = sequence(triangles, CONFIG.samplesPerPrimitive), axes = [0, 1, 2].map(a => geometry(triangles, points, g, a));
                const tree = buildTree(triangles.filter(t => t.p.some(v => v[axis] < g.center)));
                let hidden = 0, pairs = 0, safe = 0, conflicts = 0, eligible = 0;
                const ds = [], lows = [], eds = [], localCandidates = [], cells = new Map();
                for (const s of points) {
                    const target = weighted(s.tri.p, s.weights), tn = interpolatedNormal(s.tri, s.weights);
                    if (target[axis] <= g.center)
                        continue;
                    hidden++;
                    const reflected = target.slice(), rn = tn.slice();
                    reflected[axis] = 2 * g.center - reflected[axis];
                    rn[axis] *= -1;
                    const m = nearestSurface(reflected, null, tree, g.scale * CONFIG.distanceFraction);
                    if (!m)
                        continue;
                    const sn = interpolatedNormal(m.tri, m.weights), nd = dot(rn, sn);
                    if (nd < CONFIG.normalAgreement)
                        continue;
                    const source = weighted(m.tri.p, m.weights);
                    if (source[axis] >= g.center)
                        continue;
                    const tu = weighted(s.tri.uv, s.weights), su = weighted(m.tri.uv, m.weights), de = delta(sample(image, tu), sample(image, su)), ld = delta(sample(low, tu), sample(low, su)), ed = Math.abs(edge(image, tu) - edge(image, su));
                    pairs++;
                    ds.push(de);
                    lows.push(ld);
                    eds.push(ed);
                    const conflict = ld >= CONFIG.severeDeltaE;
                    if (conflict)
                        conflicts++;
                    const key = [0, 1, 2].filter(a => a !== axis).map(a => Math.min(3, Math.floor((target[a] - min[a]) / extent[a] * 4))).join(',');
                    const cell = cells.get(key) || { pairs: 0, conflicts: 0 };
                    cell.pairs++;
                    cell.conflicts += Number(conflict);
                    cells.set(key, cell);
                    const protectedRegion = protectedPoint(target, tn, g) || protectedPoint(source, sn, g);
                    if (!protectedRegion)
                        eligible++;
                    if (!protectedRegion && Math.sqrt(m.distanceSquared) / g.scale <= CONFIG.localDistanceFraction && nd >= CONFIG.localNormalAgreement && de <= CONFIG.localDeltaE && ld <= CONFIG.localLowFrequencyDeltaE && ed <= CONFIG.localEdgeDifference) {
                        safe++;
                        localCandidates.push({ triangle: s.tri.id, barycentric: s.weights, sourceTriangle: m.tri.id, sourceBarycentric: m.weights, deltaE: de });
                    }
                }
                const sorted = [...axes].sort((a, b) => b.matchedFraction - a.matchedFraction), selected = axes[axis];
                groups.push({ mesh: mi, primitive: pi, material: primitive.material, axis, axisAmbiguous: sorted[0].axis !== axis || sorted[0].matchedFraction - sorted[1].matchedFraction < CONFIG.minimumAxisAdvantage, axes, surfaceArea: triangles.reduce((s, t) => s + t.area, 0), hiddenSamples: hidden, pairs, eligiblePairs: eligible, localSamples: safe, geometryFraction: selected.matchedFraction, localFraction: hidden ? safe / hidden : 0, conflictFraction: pairs ? conflicts / pairs : 1, medianDeltaE: quantile(ds, .5), p90DeltaE: quantile(ds, .9), medianLowFrequencyDeltaE: quantile(lows, .5), p90EdgeDifference: quantile(eds, .9), spatialConflictCells: [...cells].map(([cell, v]) => ({ cell, ...v, fraction: v.conflicts / v.pairs })), uvLayout: uvOverlap(triangles), localCandidates });
            }
            catch (e) {
                issues.push(`mesh ${mi}, primitive ${pi}: ${e.message}`);
            }
        }
    const totalArea = groups.reduce((s, g) => s + g.surfaceArea, 0);
    const mean = k => totalArea ? groups.reduce((s, g) => s + g.surfaceArea * (g[k] ?? 0), 0) / totalArea : 0;
    const pairs = groups.reduce((s, g) => s + g.pairs, 0);
    const summary = { pairs, geometryFraction: mean('geometryFraction'), localFraction: mean('localFraction'), conflictFraction: mean('conflictFraction'), medianDeltaE: mean('medianLowFrequencyDeltaE'), axisAmbiguous: groups.some(g => g.axisAmbiguous), multipleMaterials: new Set(groups.map(g => g.material)).size > 1, uvOverlapFraction: totalArea ? groups.reduce((s, g) => s + g.surfaceArea * g.uvLayout.overlapFraction, 0) / totalArea : 1 };
    const result = decide(summary, issues);
    const unchanged = hash(input) === originalHash;
    if (!unchanged)
        throw Error('Preflight mutated input');
    return { ...result, inputSha256: originalHash, unchanged, configuration: CONFIG, signals: summary, groups, policy: { runReconstruction: result.decision !== 'DECLINE', scope: result.decision === 'LIMITED' ? 'Intersection of frozen reliable primary region and independently revalidated local appearance agreement; no completion, growth, or bridging' : result.decision === 'APPROVE' ? 'Existing correspondence/ownership checks still required' : 'Return original bytes', allowSynthesis: false, localSamplesArePermissionMask: false, requiresPerTexelRevalidation: true }, limitations: ['No learned semantic recognition; color conflict is only a proxy', 'Raw primitive-coordinate axes only; no arbitrary-plane fit', 'Finite surface sampling can miss small lettering or rare features', 'Local candidates are diagnostic points, not permission to fill their entire triangle', 'Coarse UV overlap estimate; existing full ownership checks remain mandatory'] };
}
export { sample, edge, protectedPoint, delta };
