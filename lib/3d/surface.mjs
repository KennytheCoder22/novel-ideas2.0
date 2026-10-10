import { Buffer } from "node:buffer";
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => a.map((x, i) => x - b[i]);
const normalize = a => {
    const n = Math.hypot(...a);
    return n > 1e-9 && Number.isFinite(n) ? a.map(x => x / n) : [0, 0, 0];
};
const weighted = (values, weights) => values[0].map((_, a) => weights.reduce((sum, w, i) => sum + w * values[i][a], 0));
export function parseGlb(input) {
    if (input.length < 20 || input.readUInt32LE(0) !== 0x46546c67 || input.readUInt32LE(4) !== 2 || input.readUInt32LE(8) !== input.length)
        throw new Error('Invalid GLB header');
    const chunks = [];
    for (let offset = 12; offset < input.length;) {
        if (offset + 8 > input.length)
            throw new Error('Truncated GLB chunk');
        const size = input.readUInt32LE(offset), type = input.readUInt32LE(offset + 4);
        if (size % 4 || offset + 8 + size > input.length)
            throw new Error('Invalid GLB chunk size');
        chunks.push({ type, data: input.subarray(offset + 8, offset + 8 + size) });
        offset += 8 + size;
    }
    if (chunks[0]?.type !== 0x4e4f534a)
        throw new Error('Missing GLB JSON');
    const json = JSON.parse(chunks[0].data.toString('utf8').replace(/\0/g, '').trim());
    const binary = chunks.find(c => c.type === 0x004e4942);
    if (!binary || json.buffers?.length !== 1 || json.buffers[0].uri)
        throw new Error('Only single embedded-buffer GLBs supported');
    return { json, bin: binary.data, chunks };
}
export function serializeGlb(parsed, bin = parsed.bin) {
    let json = Buffer.from(JSON.stringify(parsed.json));
    json = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 32)]);
    bin = Buffer.concat([bin, Buffer.alloc((4 - bin.length % 4) % 4)]);
    const chunks = parsed.chunks.map(c => ({ type: c.type, data: c.type === 0x4e4f534a ? json : c.type === 0x004e4942 ? bin : c.data }));
    const out = Buffer.alloc(12 + chunks.reduce((n, c) => n + 8 + c.data.length, 0));
    out.writeUInt32LE(0x46546c67, 0);
    out.writeUInt32LE(2, 4);
    out.writeUInt32LE(out.length, 8);
    let offset = 12;
    for (const c of chunks) {
        out.writeUInt32LE(c.data.length, offset);
        out.writeUInt32LE(c.type, offset + 4);
        c.data.copy(out, offset + 8);
        offset += 8 + c.data.length;
    }
    return out;
}
function readAccessor(json, bin, index, components) {
    const a = json.accessors?.[index], v = json.bufferViews?.[a?.bufferView];
    const sizes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
    const types = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    if (!a || a.sparse || !v || (v.buffer ?? 0) !== 0 || types[a.type] !== components || !sizes[a.componentType])
        throw new Error('Unsupported accessor');
    const size = sizes[a.componentType], width = size * components, stride = v.byteStride || width;
    const start = (v.byteOffset || 0) + (a.byteOffset || 0);
    if (!Number.isInteger(a.count) || a.count < 0 || stride < width || (a.byteOffset || 0) + (a.count ? (a.count - 1) * stride + width : 0) > v.byteLength || start + (a.count ? (a.count - 1) * stride + width : 0) > bin.length)
        throw new Error('Invalid accessor range');
    function read(at) {
        let value;
        switch (a.componentType) {
            case 5120:
                value = bin.readInt8(at);
                break;
            case 5121:
                value = bin.readUInt8(at);
                break;
            case 5122:
                value = bin.readInt16LE(at);
                break;
            case 5123:
                value = bin.readUInt16LE(at);
                break;
            case 5125:
                value = bin.readUInt32LE(at);
                break;
            case 5126:
                value = bin.readFloatLE(at);
                break;
        }
        if (a.normalized && a.componentType !== 5126) {
            const maximum = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 4294967295 }[a.componentType];
            value = Math.max(a.componentType === 5120 || a.componentType === 5122 ? -1 : 0, value / maximum);
        }
        if (!Number.isFinite(value))
            throw new Error('Nonfinite accessor');
        return value;
    }
    return Array.from({ length: a.count }, (_, i) => Array.from({ length: components }, (_, c) => read(start + i * stride + c * size)));
}
// Closest point on a triangle, expressed as barycentric weights (Ericson).
function closestWeights(p, vertices) {
    const [a, b, c] = vertices, ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0)
        return [1, 0, 0];
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3)
        return [0, 1, 0];
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        return [1 - v, v, 0];
    }
    const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
    if (d6 >= 0 && d5 <= d6)
        return [0, 0, 1];
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6);
        return [1 - w, 0, w];
    }
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
        const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
        return [0, 1 - w, w];
    }
    const sum = va + vb + vc;
    if (Math.abs(sum) < 1e-20)
        return null;
    const v = vb / sum, w = vc / sum;
    return [1 - v - w, v, w];
}
function buildTree(triangles) {
    if (!triangles.length)
        return null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const tri of triangles)
        for (const p of tri.p)
            for (let a = 0; a < 3; a++) {
                min[a] = Math.min(min[a], p[a]);
                max[a] = Math.max(max[a], p[a]);
            }
    if (triangles.length <= 8)
        return { min, max, triangles };
    const extents = max.map((v, a) => v - min[a]), axis = extents.indexOf(Math.max(...extents));
    triangles.sort((a, b) => a.centroid[axis] - b.centroid[axis]);
    const middle = triangles.length >> 1;
    return { min, max, left: buildTree(triangles.slice(0, middle)), right: buildTree(triangles.slice(middle)) };
}
function boxDistance(p, node) {
    return p.reduce((sum, x, a) => sum + Math.max(node.min[a] - x, 0, x - node.max[a]) ** 2, 0);
}
function nearestSurface(point, normal, tree, tolerance) {
    let distance = tolerance * tolerance, match = null;
    function visit(node) {
        if (!node || boxDistance(point, node) > distance)
            return;
        if (node.triangles) {
            for (const tri of node.triangles) {
                if (normal && dot(normal, tri.normal) < 0.75)
                    continue;
                const weights = closestWeights(point, tri.p);
                if (!weights)
                    continue;
                const delta = sub(point, weighted(tri.p, weights)), d = dot(delta, delta);
                if (d <= distance) {
                    distance = d;
                    match = { tri, weights, distanceSquared: d };
                }
            }
        }
        else {
            const first = boxDistance(point, node.left) < boxDistance(point, node.right) ? node.left : node.right;
            visit(first);
            visit(first === node.left ? node.right : node.left);
        }
    }
    visit(tree);
    return match;
}
function rasterize(tri, width, height, visit) {
    // glTF texture coordinates address the top row at v=0; no atlas-wide flip.
    const p = tri.uv.map(uv => [uv[0] * width - 0.5, uv[1] * height - 0.5]);
    const denominator = (p[1][1] - p[2][1]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][1] - p[2][1]);
    if (Math.abs(denominator) < 1e-10)
        return;
    const minX = Math.max(0, Math.ceil(Math.min(...p.map(v => v[0])))), maxX = Math.min(width - 1, Math.floor(Math.max(...p.map(v => v[0]))));
    const minY = Math.max(0, Math.ceil(Math.min(...p.map(v => v[1])))), maxY = Math.min(height - 1, Math.floor(Math.max(...p.map(v => v[1]))));
    for (let y = minY; y <= maxY; y++)
        for (let x = minX; x <= maxX; x++) {
            const a = ((p[1][1] - p[2][1]) * (x - p[2][0]) + (p[2][0] - p[1][0]) * (y - p[2][1])) / denominator;
            const b = ((p[2][1] - p[0][1]) * (x - p[2][0]) + (p[0][0] - p[2][0]) * (y - p[2][1])) / denominator, c = 1 - a - b;
            if (a >= -1e-7 && b >= -1e-7 && c >= -1e-7)
                visit(x, y, [a, b, c]);
        }
}
function interpolatedNormal(tri, weights) {
    const normal = normalize(weighted(tri.normals, weights));
    return Math.hypot(...normal) > 0.5 ? normal : tri.normal.slice();
}
export { readAccessor, buildTree, nearestSurface, weighted, normalize, dot, sub, interpolatedNormal, rasterize };
