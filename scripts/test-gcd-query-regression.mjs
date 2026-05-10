import fs from 'fs';

const src = fs.readFileSync('screens/recommenders/gcd/gcdGraphicNovelRecommender.ts', 'utf8');

const requiredTerms = ['"marvel comics"','"dc comics"','"image comics"','"dark horse comics"','"scholastic graphix"','"humanoids"','"comixology originals"'];
const missing = requiredTerms.filter((t) => !src.includes(t));
if (missing.length) {
  console.error('Missing required broad GCD terms:', missing.join(', '));
  process.exit(1);
}

const forbiddenBookQueries = ['psychological horror novel', 'horror comics', 'supernatural comics'];
const foundForbidden = forbiddenBookQueries.filter((term) => src.includes(term));
if (foundForbidden.length) {
  console.error('Found forbidden non-anchor query in GCD path:', foundForbidden.join(', '));
  process.exit(1);
}

console.log('GCD query regression check passed.');
