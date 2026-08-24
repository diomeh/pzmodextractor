import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// CLAUDE.md calls out that the web app (src/lib/server/steamApi.ts) and the
// Tampermonkey userscript (userscripts/pz-collection-to-modstring.user.js)
// are two independent implementations of the same extraction logic that must
// be kept in sync manually. This guards against silent drift between them.

const convertSrc = readFileSync(
  path.resolve(__dirname, '../src/lib/server/steamApi.ts'),
  'utf8',
);
const userscriptSrc = readFileSync(
  path.resolve(__dirname, '../userscripts/pz-collection-to-modstring.user.js'),
  'utf8',
);

function extractServerPattern(name: string): string {
  const re = new RegExp(`${name} = /(.*)/gim;`);
  const match = convertSrc.match(re);
  if (!match) throw new Error(`Could not find ${name} in steamApi.ts`);
  return match[1];
}

function extractUserscriptPattern(name: string): string {
  const re = new RegExp(`const ${name} = "((?:[^"\\\\]|\\\\.)*)";`);
  const match = userscriptSrc.match(re);
  if (!match) throw new Error(`Could not find ${name} in the userscript`);
  // The userscript stores the pattern as a JS string literal (double-escaped
  // backslashes); unescape it back to the raw regex source for comparison.
  return match[1].replace(/\\\\/g, '\\');
}

describe('extraction regex parity between web app and userscript', () => {
  it('WORKSHOP_ID_PATTERN sources match', () => {
    expect(extractUserscriptPattern('WORKSHOP_ID_PATTERN')).toBe(
      extractServerPattern('WORKSHOP_ID_PATTERN'),
    );
  });

  it('MOD_ID_PATTERN sources match', () => {
    expect(extractUserscriptPattern('MOD_ID_PATTERN')).toBe(extractServerPattern('MOD_ID_PATTERN'));
  });
});
