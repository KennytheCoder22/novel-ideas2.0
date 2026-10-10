import { parseGlb, readAccessor } from './surface.mjs';
import { UTILITY_POLICY } from './utility.mjs';
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) { return Array.from({ length: 16 }, (_, i) => { const row = i % 4, col = Math.floor(i / 4); let s = 0; for (let k = 0; k < 4; k++)
    s += a[k * 4 + row] * b[col * 4 + k]; return s; }); }
function local(n) { if (n.matrix)
    return n.matrix; const [x, y, z, w] = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1], t = n.translation || [0, 0, 0]; return [(1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0, 2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0, 2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0, ...t, 1]; }
function surfaceGroups(input, groups) {
    const { json, bin } = parseGlb(input), result = [], parents = new Map(), matrices = new Map(), active = [], visiting = new Set();
    for (let i = 0; i < json.nodes.length; i++)
        for (const c of json.nodes[i].children || [])
            parents.set(c, i);
    function matrix(i) { if (visiting.has(i))
        throw Error('Cyclic scene'); if (!matrices.has(i)) {
        visiting.add(i);
        matrices.set(i, multiply(parents.has(i) ? matrix(parents.get(i)) : identity(), local(json.nodes[i])));
        visiting.delete(i);
    } return matrices.get(i); }
    function visit(i) { if (active.includes(i))
        throw Error('Repeated scene instance'); active.push(i); for (const c of json.nodes[i].children || [])
        visit(c); }
    for (const i of json.scenes[json.scene || 0].nodes)
        visit(i);
    for (const i of active) {
        const node = json.nodes[i];
        if (node.mesh === undefined)
            continue;
        if (node.skin !== undefined)
            throw Error('Unsupported skin');
        for (const p of json.meshes[node.mesh].primitives) {
            const g = groups.find(x => JSON.stringify(x.primitive) === JSON.stringify(p));
            if (!g)
                throw Error('Missing surface mapping');
            const m = matrix(i), positions = readAccessor(json, bin, p.attributes.POSITION, 3).map(v => [0, 1, 2].map(c => m[c] * v[0] + m[4 + c] * v[1] + m[8 + c] * v[2] + m[12 + c])), uv = readAccessor(json, bin, p.attributes.TEXCOORD_0, 2), ids = readAccessor(json, bin, p.indices, 1).flat(), triangles = [];
            for (let k = 0; k < ids.length; k += 3)
                triangles.push(ids.slice(k, k + 3));
            const material = json.materials[p.material], tex = json.textures[material.pbrMetallicRoughness.baseColorTexture.index], sam = json.samplers?.[tex.sampler] || {};
            result.push({ ...g, positions, uv, indices: triangles, wrap: [sam.wrapS || 10497, sam.wrapT || 10497] });
        }
    }
    if (result.length !== groups.length)
        throw Error('Ambiguous primitive-to-surface mapping');
    return result;
}
const wrapped = (i, n, mode) => mode === 33071 ? Math.max(0, Math.min(n - 1, i)) : mode === 33648 ? ((i % (2 * n) + 2 * n) % (2 * n) < n ? (i % (2 * n) + 2 * n) % (2 * n) : 2 * n - 1 - (i % (2 * n) + 2 * n) % (2 * n)) : (i % n + n) % n;
function visibility(groups, angle, size) {
    const a = angle * Math.PI / 180, right = [Math.cos(a), 0, Math.sin(a)], toward = [Math.sin(a), 0, -Math.cos(a)], dot = (p, v) => p[0] * v[0] + p[1] * v[1] + p[2] * v[2];
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const g of groups)
        for (const p of g.positions) {
            const v = [dot(p, right), p[1]];
            for (let c = 0; c < 2; c++) {
                lo[c] = Math.min(lo[c], v[c]);
                hi[c] = Math.max(hi[c], v[c]);
            }
        }
    const scale = (size - 30) / Math.max(hi[0] - lo[0], hi[1] - lo[1]), depth = new Float64Array(size * size).fill(-Infinity), object = new Uint8Array(size * size), repair = new Uint8Array(size * size);
    for (const g of groups) {
        const { width: w, height: h, positions, uv, indices, authorized, evidence, owner, wrap } = g, selected = new Set();
        for (let i = 0; i < owner.length; i++)
            if (authorized[i])
                selected.add(owner[i]);
        const q = positions.map(p => [(dot(p, right) - (lo[0] + hi[0]) / 2) * scale + size / 2, size / 2 - (p[1] - (lo[1] + hi[1]) / 2) * scale, dot(p, toward)]);
        for (const pass of [true, false])
            for (let ti = 0; ti < indices.length; ti++) {
                if (selected.has(ti) !== pass)
                    continue;
                const t = indices[ti], [p, b, c] = t.map(i => q[i]), den = (b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1]);
                if (Math.abs(den) < 1e-10)
                    continue;
                for (let y = Math.max(0, Math.ceil(Math.min(p[1], b[1], c[1]))); y <= Math.min(size - 1, Math.floor(Math.max(p[1], b[1], c[1]))); y++)
                    for (let x = Math.max(0, Math.ceil(Math.min(p[0], b[0], c[0]))); x <= Math.min(size - 1, Math.floor(Math.max(p[0], b[0], c[0]))); x++) {
                        const wa = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den, wb = ((c[1] - p[1]) * (x - c[0]) + (p[0] - c[0]) * (y - c[1])) / den, wc = 1 - wa - wb, z = wa * p[2] + wb * b[2] + wc * c[2], pixel = y * size + x;
                        if (wa < 0 || wb < 0 || wc < 0 || z <= depth[pixel])
                            continue;
                        depth[pixel] = z;
                        object[pixel] = 1;
                        repair[pixel] = 0;
                        if (pass) {
                            const u = wa * uv[t[0]][0] + wb * uv[t[1]][0] + wc * uv[t[2]][0], v = wa * uv[t[0]][1] + wb * uv[t[1]][1] + wc * uv[t[2]][1], tx = u * w - .5, ty = v * h - .5, ix = Math.floor(tx), iy = Math.floor(ty), fx = tx - ix, fy = ty - iy;
                            let color = 0;
                            for (const [dx, dy, k] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]])
                                color += 255 * evidence.repaired[wrapped(iy + dy, h, wrap[1]) * w + wrapped(ix + dx, w, wrap[0])] * k;
                            repair[pixel] = Number(Math.trunc(color) > 127);
                        }
                    }
            }
    }
    const objectPixels = object.reduce((a, b) => a + b, 0), repairPixels = repair.reduce((a, b) => a + b, 0);
    return { angle, objectPixels, repairPixels, fraction: repairPixels / Math.max(1, objectPixels) };
}
export function utilitySignals(input, groups) {
    const surfaces = surfaceGroups(input, groups);
    let area = 0, defectArea = 0, changedArea = 0, defects = 0, changed = 0, reduction = 0, boundary = 0;
    for (const g of surfaces) {
        const weights = g.indices.map(t => { const p = t.map(i => g.positions[i]), a = p[1].map((x, k) => x - p[0][k]), b = p[2].map((x, k) => x - p[0][k]), surface = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]) / 2; area += surface; const u = t.map(i => g.uv[i]), ua = Math.abs((u[1][0] - u[0][0]) * (u[2][1] - u[0][1]) - (u[1][1] - u[0][1]) * (u[2][0] - u[0][0])) / 2; return surface / Math.max(ua * g.width * g.height, 1e-30); });
        const e = g.evidence;
        for (let i = 0; i < g.owner.length; i++)
            if (g.owner[i] >= 0) {
                if (e.repaired[i])
                    defectArea += weights[g.owner[i]];
                if (e.changed[i])
                    changedArea += weights[g.owner[i]];
            }
        defects += e.supportedDefectTexels;
        changed += e.predictedChangedTexels;
        reduction += e.predictedErrorReductionFraction * e.supportedDefectTexels;
        boundary += e.predictedBoundaryRegression * e.predictedChangedTexels;
    }
    const views = [0, 45, 90, 180, 225, 270].map(a => visibility(surfaces, a, UTILITY_POLICY.review_resolution));
    return { supportedDefectTexels: defects, defectSurfaceFraction: defectArea / Math.max(area, 1e-30), visibleRepairPixels: Math.max(...views.map(v => v.repairPixels)), visibleRepairFraction: Math.max(...views.map(v => v.fraction)), explainedChangeFraction: defectArea / Math.max(changedArea, 1e-30), errorReductionFraction: reduction / Math.max(1, defects), boundaryRegression: boundary / Math.max(1, changed), predictedChangedTexels: changed };
}
