import assert from 'node:assert/strict';
import { DISCOVERIES, chooseDiscovery, readDiscoveryJournal } from '../lib/recommendationGames/cascadeDiscoveries';
const stars = Object.fromEntries(Array.from({length:12},(_,i)=>[`level-${i+1}`,3]));
const endings = new Set<string>();
for (let realm=0;realm<4;realm++) for(const first of [0,1] as const) for(const ending of [0,1] as const) {
  const empty=readDiscoveryJournal(null);
  assert.throws(()=>chooseDiscovery(empty,realm,'first',first,{}));
  assert.throws(()=>chooseDiscovery(empty,realm,'ending',ending,stars));
  const start=chooseDiscovery(empty,realm,'first',first,stars);
  assert.deepEqual(empty.entries,{},'choices must not mutate prior state');
  assert.strictEqual(chooseDiscovery(start,realm,'first',first===0?1:0,stars),start,'repeated choices must not rewrite history');
  const result=chooseDiscovery(start,realm,'ending',ending,stars);
  assert.deepEqual(readDiscoveryJournal(JSON.stringify(result)),result);
  endings.add(DISCOVERIES[realm].endings[first][ending].outcome);
}
assert.equal(endings.size,16,'branches must have distinct consequences');
for(const raw of ['{','{"version":2,"entries":{}}','{"version":1,"entries":{"unknown":{}}}','{"version":1,"entries":{"copper-garden":{"ending":0}}}','{"version":1,"entries":{"copper-garden":{"first":5}}}','{"version":1,"entries":{"copper-garden":{"interest":"more"}}}']) assert.throws(()=>readDiscoveryJournal(raw));
console.log('Discovery tests passed: 16 distinct endings, locks, persistence, idempotence, non-mutation and corrupt-data protection.');
