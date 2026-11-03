#!/usr/bin/env node
import path from 'node:path';
import { buildTransferSeries } from '../src/series-reader/build.mjs';

const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!['--public-dir', '--output-dir'].includes(name) || !value || value.startsWith('--')) {
    console.error('Usage: node scripts/build-transfer-series.mjs --public-dir public --output-dir /tmp/transfer-series-dist');
    process.exit(1);
  }
  argumentsByName.set(name, path.resolve(value));
}

try {
  if (!argumentsByName.has('--public-dir') || !argumentsByName.has('--output-dir')) {
    throw new Error('--public-dir와 --output-dir가 필요합니다.');
  }
  const result = await buildTransferSeries({
    publicDir: argumentsByName.get('--public-dir'),
    outputDir: argumentsByName.get('--output-dir'),
  });
  console.log(`${result.routes.length} routes written to ${result.outputDir}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
