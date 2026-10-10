// Float32 operations mirror the frozen NumPy/OpenCV structural veto.
const f = Math.fround;
export function box(a, w, h, k) {
    const tmp = new Float64Array(a.length), out = new Float32Array(a.length), r = k >> 1;
    for (let y = 0; y < h; y++) {
        let sum = 0;
        for (let x = 0; x <= r && x < w; x++)
            sum += a[y * w + x];
        for (let x = 0; x < w; x++) {
            tmp[y * w + x] = sum;
            if (x - r >= 0)
                sum -= a[y * w + x - r];
            if (x + r + 1 < w)
                sum += a[y * w + x + r + 1];
        }
    }
    for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let y = 0; y <= r && y < h; y++)
            sum += tmp[y * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = sum / (k * k);
            if (y - r >= 0)
                sum -= tmp[(y - r) * w + x];
            if (y + r + 1 < h)
                sum += tmp[(y + r + 1) * w + x];
        }
    }
    return out;
}
export function erode(mask, w, h, k) { const out = new Uint8Array(mask.length), r = k >> 1; for (let y = r; y < h - r; y++)
    for (let x = r; x < w - r; x++) {
        let ok = 1;
        outer: for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++)
                if (!mask[(y + dy) * w + x + dx]) {
                    ok = 0;
                    break outer;
                }
        out[y * w + x] = ok;
    } return out; }
function continuity(g) {
    const { owner, sourceOwner, primary, triangles, width: w, height: h } = g, edges = new Map(), adj = new Set(), n = triangles.length;
    for (const t of triangles) {
        const p = t.p.map(v => v.map(x => Math.round(x * 1e9) / 1e9).join(','));
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
            const key = [p[a], p[b]].sort().join('|');
            if (!edges.has(key))
                edges.set(key, []);
            edges.get(key).push(t.id);
        }
    }
    for (const ids of edges.values())
        for (const a of ids)
            for (const b of ids)
                adj.add(a * n + b);
    const context = new Uint8Array(primary.length);
    for (let y = 1; y < h - 1; y++)
        for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (!primary[i] || owner[i] < 0 || sourceOwner[i] < 0)
                continue;
            let valid = true;
            for (const j of [i - 1, i + 1, i - w, i + w])
                for (const field of [owner, sourceOwner])
                    if (!primary[j] || field[j] < 0 || (field[i] !== field[j] && !adj.has(field[i] * n + field[j])))
                        valid = false;
            context[i] = Number(valid);
        }
    return context;
}
export const STRUCTURE_POLICY = Object.freeze({ windows: Object.freeze([3, 7]), orientationMinimumSimilarity: .9, directionalConsistencyMaximumDifference: .06, centeredPatternMaximumRMS: .06, gradientPatternMaximumRMS: .06, flatNumericalEpsilon: 1e-12 });
export function structuralMask(g) {
    const { width: w, height: h, original, sourceField, mask: base } = g, N = w * h, eps = STRUCTURE_POLICY.flatNumericalEpsilon;
    const ax = new Float32Array(N * 3), ay = new Float32Array(N * 3), sx = new Float32Array(N * 3), sy = new Float32Array(N * 3), diff = new Float32Array(N * 3);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = y * w + x;
            for (let c = 0; c < 3; c++) {
                const t = j => j < 0 ? 0 : f(original[j * 4 + c] / 255), s = j => j < 0 ? 0 : f(sourceField[j * 3 + c] / 255), l = x ? i - 1 : -1, r = x + 1 < w ? i + 1 : -1, u = y ? i - w : -1, d = y + 1 < h ? i + w : -1;
                ax[i * 3 + c] = f(f(t(r) - t(l)) * .5);
                ay[i * 3 + c] = f(f(t(d) - t(u)) * .5);
                sx[i * 3 + c] = f(f(s(r) - s(l)) * .5);
                sy[i * 3 + c] = f(f(s(d) - s(u)) * .5);
                diff[i * 3 + c] = f(s(i) - t(i));
            }
        }
    function tensor(gx, gy, k) { const xx = new Float32Array(N), yy = new Float32Array(N), xy = new Float32Array(N); for (let i = 0; i < N; i++) {
        let a = 0, b = 0, c = 0;
        for (let q = 0; q < 3; q++) {
            const x = gx[i * 3 + q], y = gy[i * 3 + q];
            a = f(a + f(x * x));
            b = f(b + f(y * y));
            c = f(c + f(x * y));
        }
        xx[i] = a;
        yy[i] = b;
        xy[i] = c;
    } const a = box(xx, w, h, k), b = box(yy, w, h, k), c = box(xy, w, h, k), energy = new Float32Array(N), coherence = new Float32Array(N), angle = new Float32Array(N); for (let i = 0; i < N; i++) {
        const d = f(a[i] - b[i]);
        energy[i] = f(a[i] + b[i]);
        coherence[i] = f(f(Math.sqrt(f(f(d * d) + f(f(4 * c[i]) * c[i])))) / Math.max(energy[i], eps));
        angle[i] = f(f(Math.atan2(f(2 * c[i]), d)) * .5);
    } return { energy, coherence, angle }; }
    const square = new Float32Array(N), grad = new Float32Array(N), channels = [0, 1, 2].map(() => new Float32Array(N));
    for (let i = 0; i < N; i++) {
        let a = 0, b = 0;
        for (let c = 0; c < 3; c++) {
            const q = i * 3 + c, d = diff[q], dx = f(sx[q] - ax[q]), dy = f(sy[q] - ay[q]);
            a = f(a + f(d * d));
            b = f(b + f(f(dx * dx) + f(dy * dy)));
            channels[c][i] = d;
        }
        square[i] = f(a / 3);
        grad[i] = f(f(b / 3) / 2);
    }
    const context = continuity(g), keep = Uint8Array.from(base);
    for (const k of STRUCTURE_POLICY.windows) {
        const valid = erode(context, w, h, k), a = tensor(ax, ay, k), s = tensor(sx, sy, k), means = channels.map(x => box(x, w, h, k)), sq = box(square, w, h, k), gg = box(grad, w, h, k);
        for (let i = 0; i < N; i++)
            if (keep[i]) {
                let meanSq = 0;
                for (let c = 0; c < 3; c++)
                    meanSq = f(meanSq + f(means[c][i] * means[c][i]));
                const pattern = f(Math.sqrt(Math.max(0, f(sq[i] - f(meanSq / 3))))), gradient = f(Math.sqrt(Math.max(0, gg[i]))), active = a.energy[i] > eps && s.energy[i] > eps, orientation = active ? f(f(1 - Math.abs(f(Math.cos(f(a.angle[i] - s.angle[i]))))) * Math.min(a.coherence[i], s.coherence[i])) : 0, direction = a.energy[i] > eps || s.energy[i] > eps ? Math.abs(f(a.coherence[i] - s.coherence[i])) : 0;
                if (!valid[i] || orientation > 1 - STRUCTURE_POLICY.orientationMinimumSimilarity || direction > STRUCTURE_POLICY.directionalConsistencyMaximumDifference || pattern > STRUCTURE_POLICY.centeredPatternMaximumRMS || gradient > STRUCTURE_POLICY.gradientPatternMaximumRMS)
                    keep[i] = 0;
            }
    }
    return keep;
}
