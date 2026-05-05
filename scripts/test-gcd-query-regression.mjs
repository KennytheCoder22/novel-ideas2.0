import fs from 'fs';

const src = fs.readFileSync('screens/recommenders/gcd/gcdGraphicNovelRecommender.ts', 'utf8');

const requiredTerms = ['"horror"','"dark"','"supernatural"','"manga"','"graphic novel"'];
const missing = requiredTerms.filter((t) => !src.includes(t));
if (missing.length) {
  console.error('Missing required broad GCD terms:', missing.join(', '));
  process.exit(1);
}

if (src.includes('psychological horror novel')) {
  console.error('Found forbidden book query in GCD path: psychological horror novel');
  process.exit(1);
}

console.log('GCD query regression check passed.');
