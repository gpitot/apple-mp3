import songs from '../output/songs-with-urls.json'


const durations = songs.songs.map(s => s.youtubeDurationSec)

// median
const sorted = durations.slice().sort((a, b) => a - b);

// get number of songs per duration bucket
const buckets: Record<string, number> = {};
for (const d of durations) {
  const bucket = `${Math.floor(d / 30) * 30}-${Math.floor(d / 30) * 30 + 29}`;
  buckets[bucket] = (buckets[bucket] || 0) + 1;
}

// sort buckets
const sortedBuckets = Object.entries(buckets).sort((a, b) => {
  const aStart = parseInt(a[0].split("-")[0]);
  const bStart = parseInt(b[0].split("-")[0]);
  return aStart - bStart;
});

console.log("Duration buckets (sec):");
for (const [bucket, count] of Object.entries(sortedBuckets)) {
  console.log(`  ${bucket}: ${count} songs`);
}