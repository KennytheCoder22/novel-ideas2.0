/// <reference types="node" />
export function processNormalSymmetry(input: Buffer): Promise<{buffer: Buffer; action: 'UNCHANGED' | 'RECONSTRUCT_AUTHORIZED_ONLY'; stages: string[]; reason?: string; signals?: Record<string, number>}>;
