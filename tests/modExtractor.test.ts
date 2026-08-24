import { describe, it, expect } from 'vitest';
import { parseBBCode, bbExtractText, bbSafeUrl, renderDescription, looksExclusive, esc } from '../src/lib/bbcode';
import { candidateKey, toCollectionUrl, buildExportFilename, classifyInput } from '../src/lib/modLogic';
import { isModEntry, isCuratedItem, isExportedSource, parseImportPayload } from '../src/lib/exportImport';
import type { ModEntry, CuratedItem, ExportedSource } from '../src/lib/types';

const COLLECTION_ID = '3489663816';
const ITEM_ID = '3314564075';
const ITEM_URL = `https://steamcommunity.com/sharedfiles/filedetails/?id=${ITEM_ID}`;

describe('esc', () => {
  it('escapes all five HTML-significant characters', () => {
    expect(esc(`<b>"it's" & <script>`)).toBe('&lt;b&gt;&quot;it&#39;s&quot; &amp; &lt;script&gt;');
  });
});

describe('bbSafeUrl', () => {
  it('allows absolute http/https URLs', () => {
    expect(bbSafeUrl('https://example.com/x')).toBe('https://example.com/x');
    expect(bbSafeUrl(' http://example.com ')).toBe('http://example.com/');
  });

  it('rejects javascript: and other non-http protocols (XSS boundary)', () => {
    expect(bbSafeUrl('javascript:alert(1)')).toBeNull();
    expect(bbSafeUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejects relative and malformed URLs', () => {
    expect(bbSafeUrl('/relative/path')).toBeNull();
    expect(bbSafeUrl('not a url')).toBeNull();
  });
});

describe('parseBBCode / renderDescription', () => {
  it('renders basic inline formatting tags', () => {
    const html = renderDescription('[b]bold[/b] and [i]italic[/i]');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('drops disallowed tags but keeps their inner content escaped', () => {
    const html = renderDescription('[script]alert(1)[/script]');
    // "script" is not in the allowlist, so parseBBCode treats the brackets as
    // literal text rather than a tag, and the whole thing gets HTML-escaped.
    expect(html).not.toContain('<script>');
    expect(html).toContain('alert(1)');
  });

  it('never emits a raw <script> tag or unescaped angle brackets from injected description text', () => {
    const html = renderDescription('<script>alert(1)</script> [url=javascript:alert(1)]click[/url]');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('javascript:');
  });

  it('sanitizes [url] targets and drops unsafe protocols', () => {
    const safe = renderDescription('[url=https://example.com]link[/url]');
    expect(safe).toContain('href="https://example.com/"');
    expect(safe).toContain('target="_blank"');
    expect(safe).toContain('rel="noopener noreferrer"');

    const unsafe = renderDescription('[url=javascript:alert(1)]link[/url]');
    expect(unsafe).not.toContain('href=');
    expect(unsafe).toContain('link'); // inner text still rendered, just unlinked
  });

  it('sanitizes [img] sources and drops unsafe protocols', () => {
    const safe = renderDescription('[img]https://example.com/x.png[/img]');
    expect(safe).toContain('src="https://example.com/x.png"');

    const unsafe = renderDescription('[img]javascript:alert(1)[/img]');
    expect(unsafe).not.toContain('<img');
  });

  it('renders list/olist/li structures', () => {
    const html = renderDescription('[list][*]one[*]two[/list]');
    expect(html).toContain('<ul');
    expect(html).toBe('<ul style="margin:4px 0 8px;padding-left:18px;"><li>one</li><li>two</li></ul>');
  });

  it('falls back to placeholder text for an empty description', () => {
    expect(renderDescription('   ')).toBe('<span>No description available.</span>');
  });

  it('splits blank-line-separated text into paragraphs', () => {
    const html = renderDescription('first paragraph\n\nsecond paragraph');
    expect(html).toBe('<p style="margin:0 0 8px;">first paragraph</p><p style="margin:0 0 8px;">second paragraph</p>');
  });

  it('extracts plain text from a parsed tree via bbExtractText', () => {
    const tree = parseBBCode('[b]bold [i]nested[/i][/b] tail');
    expect(bbExtractText(tree.children)).toBe('bold nested tail');
  });
});

describe('looksExclusive', () => {
  it('flags descriptions warning about mutually-exclusive branches', () => {
    expect(looksExclusive('Only use ONE of these mod IDs.')).toBe(true);
    expect(looksExclusive('These are mutually exclusive branches.')).toBe(true);
    expect(looksExclusive('Please choose one variant below.')).toBe(true);
  });

  it('does not flag ordinary multi-ID descriptions', () => {
    expect(looksExclusive('This mod includes both a base module and an optional addon.')).toBe(false);
  });
});

describe('candidateKey', () => {
  it('joins publishedfileid and name with a stable separator', () => {
    expect(candidateKey(ITEM_ID, 'MyModName')).toBe(`${ITEM_ID}::MyModName`);
  });
});

describe('toCollectionUrl', () => {
  it('builds a workshop filedetails URL from a bare numeric ID', () => {
    expect(toCollectionUrl(COLLECTION_ID)).toBe(
      `https://steamcommunity.com/sharedfiles/filedetails/?id=${COLLECTION_ID}`,
    );
  });

  it('passes through an absolute URL that already has an id param', () => {
    expect(toCollectionUrl(ITEM_URL)).toBe(ITEM_URL);
  });

  it('returns an empty string for input with no usable id', () => {
    expect(toCollectionUrl('not a url or id')).toBe('');
    expect(toCollectionUrl('https://steamcommunity.com/sharedfiles/filedetails/')).toBe('');
  });

  it('mirrors extractCollectionId from the server for the same inputs', async () => {
    const { extractCollectionId } = await import('../src/lib/server/steamApi');
    for (const input of [COLLECTION_ID, ITEM_URL]) {
      const serverId = extractCollectionId(input);
      const clientUrl = toCollectionUrl(input);
      expect(clientUrl).toContain(`id=${serverId}`);
    }
  });
});

describe('buildExportFilename', () => {
  it('builds a timestamped filename with no source-specific id', () => {
    expect(buildExportFilename()).toMatch(/^pz-modlist-\d{8}-\d{4}\.json$/);
  });
});

describe('classifyInput', () => {
  it('routes a full workshop filedetails URL into collections', () => {
    const result = classifyInput(ITEM_URL);
    expect(result.collections).toEqual([ITEM_ID]);
    expect(result.items).toEqual([]);
    expect(result.bad).toEqual([]);
  });

  it('routes a bare numeric ID into items', () => {
    const result = classifyInput(COLLECTION_ID);
    expect(result.collections).toEqual([]);
    expect(result.items).toEqual([COLLECTION_ID]);
  });

  it('splits on commas and newlines, trimming whitespace', () => {
    const result = classifyInput(`  ${COLLECTION_ID} ,\n${ITEM_URL}  ,, `);
    expect(result.items).toEqual([COLLECTION_ID]);
    expect(result.collections).toEqual([ITEM_ID]);
  });

  it('collects tokens with no extractable numeric id as bad', () => {
    const result = classifyInput('not a url or id, also garbage');
    expect(result.collections).toEqual([]);
    expect(result.items).toEqual([]);
    expect(result.bad).toEqual(['not a url or id', 'also garbage']);
  });

  it('handles a mix of collections, items, and bad tokens in one input', () => {
    const result = classifyInput(`${ITEM_URL}, ${COLLECTION_ID}, garbage`);
    expect(result.collections).toEqual([ITEM_ID]);
    expect(result.items).toEqual([COLLECTION_ID]);
    expect(result.bad).toEqual(['garbage']);
  });

  it('returns all-empty for blank input', () => {
    expect(classifyInput('')).toEqual({ collections: [], items: [], bad: [] });
    expect(classifyInput('   ')).toEqual({ collections: [], items: [], bad: [] });
  });
});

function makeModEntry(overrides: Partial<ModEntry> = {}): ModEntry {
  return {
    publishedfileid: ITEM_ID,
    title: 'Test Mod',
    previewUrl: '',
    description: '',
    ok: true,
    ids: ['123'],
    names: ['TestModId'],
    ...overrides,
  };
}

function makeCuratedItem(overrides: Partial<CuratedItem> = {}): CuratedItem {
  return {
    key: `${ITEM_ID}-TestModId-1`,
    publishedfileid: ITEM_ID,
    title: 'Test Mod',
    name: 'TestModId',
    sources: ['Custom'],
    ...overrides,
  };
}

function makeExportedSource(overrides: Partial<ExportedSource> = {}): ExportedSource {
  return {
    key: 'custom',
    kind: 'custom',
    title: 'Custom items',
    sourceId: null,
    url: '',
    items: [makeModEntry()],
    fetchedAt: null,
    ...overrides,
  };
}

describe('isModEntry', () => {
  it('accepts a well-formed ModEntry', () => {
    expect(isModEntry(makeModEntry())).toBe(true);
  });

  it.each([
    ['null', null],
    ['missing field', { publishedfileid: ITEM_ID }],
    ['wrong type for ok', makeModEntry({ ok: 'yes' as unknown as boolean })],
    ['non-string in ids array', { ...makeModEntry(), ids: [1, 2] }],
  ])('rejects %s', (_label, value) => {
    expect(isModEntry(value)).toBe(false);
  });
});

describe('isCuratedItem', () => {
  it('accepts a well-formed CuratedItem', () => {
    expect(isCuratedItem(makeCuratedItem())).toBe(true);
  });

  it('rejects an object missing required fields', () => {
    expect(isCuratedItem({ key: 'x', publishedfileid: ITEM_ID })).toBe(false);
  });

  it('rejects a non-string entry in sources', () => {
    expect(isCuratedItem({ ...makeCuratedItem(), sources: [1, 2] })).toBe(false);
  });
});

describe('isExportedSource', () => {
  it('accepts a well-formed collection source', () => {
    expect(isExportedSource(makeExportedSource({ kind: 'collection', sourceId: COLLECTION_ID }))).toBe(true);
  });

  it('accepts a well-formed custom source with a null sourceId/fetchedAt', () => {
    expect(isExportedSource(makeExportedSource())).toBe(true);
  });

  it('rejects an unknown kind', () => {
    expect(isExportedSource({ ...makeExportedSource(), kind: 'bogus' })).toBe(false);
  });

  it('rejects a malformed item in items', () => {
    expect(isExportedSource({ ...makeExportedSource(), items: [{ bogus: true }] })).toBe(false);
  });
});

describe('parseImportPayload', () => {
  function validPayload() {
    return {
      schemaVersion: 3,
      exportedAt: new Date().toISOString(),
      sources: [makeExportedSource({ kind: 'collection', sourceId: COLLECTION_ID, title: 'Vanilla+ Essentials' })],
      curated: [makeCuratedItem()],
      b42Format: true,
    };
  }

  it('accepts a well-formed export payload round-trip, preserving sources, curated order, and b42Format', () => {
    const result = parseImportPayload(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.sources).toHaveLength(1);
      expect(result.payload.sources[0].title).toBe('Vanilla+ Essentials');
      expect(result.payload.curated).toHaveLength(1);
      expect(result.payload.curated[0].sources).toEqual(['Custom']);
      expect(result.payload.b42Format).toBe(true);
    }
  });

  it('rejects non-object input', () => {
    const result = parseImportPayload('a string');
    expect(result.ok).toBe(false);
  });

  it('rejects an unrecognized schemaVersion', () => {
    const result = parseImportPayload({ ...validPayload(), schemaVersion: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/incompatible version/i);
  });

  it('rejects malformed source entries', () => {
    const result = parseImportPayload({ ...validPayload(), sources: [{ bogus: true }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/source entry/i);
  });

  it('rejects malformed curated entries', () => {
    const result = parseImportPayload({ ...validPayload(), curated: [{ bogus: true }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/curated entry/i);
  });

  it('rejects a payload missing required scalar fields', () => {
    const payload = validPayload() as any;
    delete payload.exportedAt;
    const result = parseImportPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing required fields/i);
  });

  it('rejects a payload missing b42Format', () => {
    const payload = validPayload() as any;
    delete payload.b42Format;
    const result = parseImportPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing required fields/i);
  });
});
