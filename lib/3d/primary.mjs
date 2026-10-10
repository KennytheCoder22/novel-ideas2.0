import sharp from 'sharp';
import { parseGlb, readAccessor, buildTree, nearestSurface, rasterize, weighted, normalize, dot, interpolatedNormal } from './surface.mjs';
import { protectedPoint } from './eligibility.mjs';
const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
// Frozen primary-region definition: Broad correspondence, moderate confidence,
// largest 4-connected >= .75 core, then its containing accepted component.
function component(mask, w) {
    const labels = new Int32Array(mask.length), sizes = [0], queue = new Int32Array(mask.length);
    let id = 0;
    for (let i = 0; i < mask.length; i++)
        if (mask[i] && !labels[i]) {
            id++;
            let head = 0, tail = 1;
            queue[0] = i;
            labels[i] = id;
            while (head < tail) {
                const a = queue[head++], x = a % w;
                for (const n of [x ? a - 1 : -1, x + 1 < w ? a + 1 : -1, a - w, a + w])
                    if (n >= 0 && n < mask.length && mask[n] && !labels[n]) {
                        labels[n] = id;
                        queue[tail++] = n;
                    }
            }
            sizes[id] = tail;
        }
    return { labels, sizes };
}
function confidence(p, n, g) {
    const depth = Math.abs((p[g.axis] - g.center) / g.half), side = Math.abs(n[g.axis]), sideLimit = depth < .28 ? .55 : .30, end = Math.min(p[g.long] - (g.min[g.long] + g.extent[g.long] * .04), (g.max[g.long] - g.extent[g.long] * .04) - p[g.long]) / g.extent[g.long];
    return Math.min(smooth((depth - .12) / .05), smooth(end / .025), smooth((.85 - Math.abs(n[g.long])) / .16), smooth((side - sideLimit) / .16), side < .55 ? smooth((depth - .28) / .05) : 1);
}
export async function primaryRegions(input) {
    const { json, bin } = parseGlb(input), regions = [];
    for (const mesh of json.meshes)
        for (const primitive of mesh.primitives) {
            const pos = readAccessor(json, bin, primitive.attributes.POSITION, 3), uv = readAccessor(json, bin, primitive.attributes.TEXCOORD_0, 2), norm = readAccessor(json, bin, primitive.attributes.NORMAL, 3), ids = readAccessor(json, bin, primitive.indices, 1).flat();
            const min = [0, 1, 2].map(a => pos.reduce((m, p) => Math.min(m, p[a]), Infinity)), max = [0, 1, 2].map(a => pos.reduce((m, p) => Math.max(m, p[a]), -Infinity)), extent = max.map((v, a) => v - min[a]), axis = extent.indexOf(Math.min(...extent)), long = [0, 1, 2].filter(a => a !== axis).sort((a, b) => extent[b] - extent[a])[0], g = { min, max, extent, axis, long, center: (min[axis] + max[axis]) / 2, half: extent[axis] / 2, scale: Math.max(...extent) };
            const triangles = [];
            for (let i = 0; i < ids.length; i += 3) {
                const v = ids.slice(i, i + 3), p = v.map(i => pos[i]);
                triangles.push({ id: i / 3, p, uv: v.map(i => uv[i]), normals: v.map(i => norm[i]), normal: normalize(weighted(v.map(i => norm[i]), [1 / 3, 1 / 3, 1 / 3])), centroid: weighted(p, [1 / 3, 1 / 3, 1 / 3]) });
            }
            const material = json.materials[primitive.material], texture = json.textures[material.pbrMetallicRoughness.baseColorTexture.index], image = json.images[texture.source], view = json.bufferViews[image.bufferView], { width, height } = await sharp(bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)).metadata(), N = width * height;
            const owner = new Int32Array(N).fill(-1), available = new Uint8Array(N), high = new Uint8Array(N), accepted = new Set(), tree = buildTree(triangles.filter(t => t.p.some(p => p[axis] < g.center)));
            const candidates = triangles.filter(t => t.p.every(p => p[axis] > g.center));
            for (const t of candidates)
                rasterize(t, width, height, (x, y) => { const i = y * width + x; owner[i] = owner[i] === -1 ? t.id : owner[i] === t.id ? t.id : -2; });
            for (const t of candidates)
                rasterize(t, width, height, (x, y, w) => {
                    const i = y * width + x;
                    if (owner[i] !== t.id)
                        return;
                    const p = weighted(t.p, w), n = interpolatedNormal(t, w);
                    if (protectedPoint(p, n, g))
                        return;
                    const depth = (p[axis] - g.center) / g.half;
                    p[axis] = 2 * g.center - p[axis];
                    n[axis] *= -1;
                    const match = nearestSurface(p, null, tree, g.scale * .025);
                    if (!match)
                        return;
                    const sp = weighted(match.tri.p, match.weights), sn = interpolatedNormal(match.tri, match.weights), nd = dot(n, sn);
                    if (protectedPoint(sp, sn, g) || sp[axis] >= g.center || nd < .75)
                        return;
                    const su = weighted(match.tri.uv, match.weights), sx = Math.floor(su[0] * width - .5), sy = Math.floor(su[1] * height - .5);
                    if (sx < 0 || sy < 0 || sx + 1 >= width || sy + 1 >= height)
                        return;
                    available[i] = 1;
                    accepted.add(t.id);
                    const c = smooth((depth - .12) / (.28 - .12)) * Math.min(confidence(p, n, g), confidence(sp, sn, g), smooth((1 - Math.sqrt(match.distanceSquared) / (g.scale * .025)) / .35), smooth((nd - .75) / .12));
                    high[i] = Number(c >= .75);
                });
            const hc = component(high, width), ac = component(available, width);
            let biggest = 0;
            for (let k = 1; k < hc.sizes.length; k++)
                if (hc.sizes[k] > (hc.sizes[biggest] || 0))
                    biggest = k;
            let label = 0;
            if (biggest) {
                const pixel = hc.labels.indexOf(biggest);
                label = ac.labels[pixel];
            }
            const mask = Uint8Array.from(ac.labels, v => Number(label > 0 && v === label));
            regions.push({ primitive, mask, accepted });
        }
    return regions;
}
