const f = Math.fround;
export const UTILITY_POLICY = Object.freeze({ version: 1, neighborhood: 5, minimum_defect_contrast: 12 / 255, maximum_context_dispersion: 3 / 255, maximum_source_residual: 3 / 255, maximum_context_disagreement: 3 / 255, minimum_defect_reduction: 8 / 255, minimum_defect_surface_fraction: .001, minimum_visible_repair_pixels: 64, minimum_visible_repair_fraction: .001, minimum_explained_change_fraction: .5, minimum_error_reduction_fraction: .5, maximum_boundary_regression: 0, review_resolution: 512 });
export function utilityEvidence(g, authorized) {
    const { original, sourceField, owner, sourceOwner, primary, width: w, height: h } = g, N = w * h, p = UTILITY_POLICY, changed = new Uint8Array(N), repaired = new Uint8Array(N);
    let count = 0;
    for (let i = 0; i < N; i++)
        if (authorized[i])
            for (let c = 0; c < 3; c++)
                if (Math.max(0, Math.min(255, Math.floor(f(sourceField[i * 3 + c] + .5)))) !== original[i * 4 + c]) {
                    changed[i] = 1;
                    count++;
                    break;
                }
    if (!count)
        return { changed, repaired, supportedDefectTexels: 0, predictedChangedTexels: 0, predictedErrorReductionFraction: 0, predictedBoundaryRegression: 0 };
    const t = (i, c) => f(original[i * 4 + c] / 255), s = (i, c) => f(sourceField[i * 3 + c] / 255), cache = new Map(), r = p.neighborhood >> 1;
    function neighborhood(i) { const x = i % w, y = Math.floor(i / w), ids = []; for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
            ids.push(Math.max(0, Math.min(h - 1, y + dy)) * w + Math.max(0, Math.min(w - 1, x + dx))); return ids; }
    function median(values) { values.sort((a, b) => a - b); return values[values.length >> 1]; }
    function rms(v) { return f(Math.sqrt(f(f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2])) / 3))); }
    function target(i) { if (cache.has(i))
        return cache.get(i); const ids = neighborhood(i), m = [0, 1, 2].map(c => median(ids.map(j => t(j, c)))), res = rms(m.map((x, c) => f(t(i, c) - x))), v = { m, res }; cache.set(i, v); return v; }
    let defects = 0, residualSum = 0, reductionSum = 0;
    for (let i = 0; i < N; i++)
        if (changed[i]) {
            const x = i % w, y = Math.floor(i / w);
            if (x < r || x >= w - r || y < r || y >= h - r || owner[i] < 0)
                continue;
            const ids = neighborhood(i);
            if (ids.some(j => !primary[j] || sourceOwner[j] < 0 || owner[j] !== owner[i]))
                continue;
            const a = target(i), sm = [0, 1, 2].map(c => median(ids.map(j => s(j, c)))), sr = rms(sm.map((x, c) => f(s(i, c) - x))), dispersion = median(ids.map(j => target(j).res)), agreement = rms(a.m.map((x, c) => f(x - sm[c])));
            if (a.res >= p.minimum_defect_contrast && dispersion <= p.maximum_context_dispersion && sr <= p.maximum_source_residual && agreement <= p.maximum_context_disagreement && f(a.res - sr) >= p.minimum_defect_reduction) {
                repaired[i] = 1;
                defects++;
                residualSum += a.res;
                reductionSum += Math.max(f(a.res - sr), 0);
            }
        }
    let before = 0, after = 0, edges = 0;
    function norm(i, j, project) { let q = 0; for (let c = 0; c < 3; c++) {
        const d = f((project && changed[i] ? s(i, c) : t(i, c)) - (project && changed[j] ? s(j, c) : t(j, c)));
        q = f(q + f(d * d));
    } return f(Math.sqrt(q)); }
    for (let i = 0; i < N; i++)
        for (const j of [(i % w) + 1 < w ? i + 1 : -1, i + w < N ? i + w : -1])
            if (j >= 0 && changed[i] !== changed[j]) {
                edges++;
                before += norm(i, j, false);
                after += norm(i, j, true);
            }
    return { changed, repaired, supportedDefectTexels: defects, predictedChangedTexels: count, predictedErrorReductionFraction: defects ? f(reductionSum / residualSum) : 0, predictedBoundaryRegression: edges ? f(f(after / edges) - f(before / edges)) : 0 };
}
export function utilityDecision(eligibility, s) {
    const p = UTILITY_POLICY;
    if (!['LIMITED', 'APPROVE'].includes(eligibility))
        return false;
    const keys = ['supportedDefectTexels', 'defectSurfaceFraction', 'visibleRepairPixels', 'visibleRepairFraction', 'explainedChangeFraction', 'errorReductionFraction', 'boundaryRegression'];
    if (keys.some(k => !Number.isFinite(s[k])))
        return false;
    return s.supportedDefectTexels > 0 && s.defectSurfaceFraction >= p.minimum_defect_surface_fraction && s.visibleRepairPixels >= p.minimum_visible_repair_pixels && s.visibleRepairFraction >= p.minimum_visible_repair_fraction && s.explainedChangeFraction >= p.minimum_explained_change_fraction && s.errorReductionFraction >= p.minimum_error_reduction_fraction && s.boundaryRegression <= p.maximum_boundary_regression;
}
