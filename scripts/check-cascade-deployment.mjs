// Explicit live QA check: writes one synthetic event, then verifies its replay.
// Run with node --import tsx scripts/check-cascade-deployment.mjs <deployment URL>
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
const require = createRequire(import.meta.url);
const game = require('../lib/recommendationGames/alchemistsCascade.ts');
const url = new URL(process.argv[2]);
if (url.protocol !== 'https:' || !/^[a-zA-Z0-9.-]+$/.test(url.hostname)) throw Error('Invalid deployment URL');
const now = new Date().toISOString();
const active = game.createActiveLevel(game.CASCADE_LEVELS[0], now);
const event = game.createCascadeEvent({
  eventType: 'board_presented', evidenceClass: 'gameplay_telemetry',
  gameSessionId: 'cascade-session-sync-verification-20260912',
  anonymousPlayerId: game.createCascadeScope('qa-cascade-sync-verification', 'default').anonymousPlayerId,
  libraryScopeId: 'default', occurredAt: now, timingBucket: 'instant',
  preferenceInference: 'none_from_gameplay',
  payload: {levelId: 'level-1', board: active.board, boardChecksum: game.boardChecksum(active.board), rngState: active.rngState},
});
const command = `npx.cmd --yes vercel curl /api/alchemists-cascade-event --deployment ${url.origin} -- -sS -i -X POST -H "Origin: ${url.origin}" -H "Content-Type: application/json" --data-binary @-`;
for (let attempt = 0; attempt < 2; attempt++) {
  const response = spawnSync(command, {shell: true, input: JSON.stringify(event), encoding: 'utf8', timeout: 60000});
  if (response.status !== 0) throw Error(`Vercel request failed: ${response.stderr}`);
  const output = response.stdout;
  const status = [...output.matchAll(/HTTP\/\S+ (\d{3})/g)].at(-1)?.[1];
  const body = output.slice(output.indexOf('{'));
  let result;
  try { result = JSON.parse(body); } catch { throw Error(`Non-JSON response: HTTP ${status}`); }
  console.log(JSON.stringify({attempt: attempt + 1, httpStatus: status, ...result}));
  if (result.status !== 'accepted' || result.storageMode !== 'durable_blob' || result.eventId !== event.eventId
    || (attempt === 0 ? status !== '201' : status !== '200' || result.idempotentReplay !== true)) {
    throw Error('Durable acceptance/replay verification failed');
  }
}
