#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const dir = resolve(process.argv[2] ?? '.');
const rows = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
const groups = new Map();
for (const r of rows) {
  const key = `${r.model}__${r.thinking}`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(r);
}

console.log('| model | thinking | runs | pass% | median time | median tokens | median output | median cost | median diff |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
for (const [key, rs] of [...groups.entries()].sort()) {
  const [model, thinking] = key.split('__');
  const pass = rs.filter(r => r.status === 'pass').length / rs.length * 100;
  console.log(`| ${model} | ${thinking} | ${rs.length} | ${pass.toFixed(0)}% | ${median(rs.map(r => r.durationSeconds)).toFixed(1)}s | ${median(rs.map(r => r.usage.totalTokens)).toFixed(0)} | ${median(rs.map(r => r.usage.output)).toFixed(0)} | $${median(rs.map(r => r.usage.costTotal)).toFixed(4)} | +${median(rs.map(r => r.diff.added)).toFixed(0)}/-${median(rs.map(r => r.diff.deleted)).toFixed(0)} |`);
}

function median(xs) {
  const ys = xs.filter(Number.isFinite).sort((a,b) => a-b);
  if (!ys.length) return 0;
  const mid = Math.floor(ys.length / 2);
  return ys.length % 2 ? ys[mid] : (ys[mid - 1] + ys[mid]) / 2;
}
