import { describe, it, expect } from 'vitest';
import {
  parseBBCode,
  bbExtractText,
  bbSafeUrl,
  renderDescription,
  looksExclusive,
  candidateKey,
  toCollectionUrl,
  buildExportFilename,
  isModEntry,
  isCuratedItem,
  parseImportPayload,
  esc,
  type AppState,
  type ModEntry,
  type CuratedItem,
} from '../src/scripts/modExtractor';

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
    const { extractCollectionId } = await import('../src/pages/api/convert');
    for (const input of [COLLECTION_ID, ITEM_URL]) {
      const serverId = extractCollectionId(input);
      const clientUrl = toCollectionUrl(input);
      expect(clientUrl).toContain(`id=${serverId}`);
    }
  });
});

describe('buildExportFilename', () => {
  const baseState = { collectionUrl: '', inputValue: '' } as AppState;

  it('prefers the id embedded in collectionUrl', () => {
    const name = buildExportFilename({ ...baseState, collectionUrl: ITEM_URL, inputValue: 'ignored' });
    expect(name).toMatch(new RegExp(`^pz-modlist-${ITEM_ID}-\\d{8}-\\d{4}\\.json$`));
  });

  it('falls back to a numeric inputValue when collectionUrl has no id', () => {
    const name = buildExportFilename({ ...baseState, collectionUrl: '', inputValue: COLLECTION_ID });
    expect(name).toMatch(new RegExp(`^pz-modlist-${COLLECTION_ID}-\\d{8}-\\d{4}\\.json$`));
  });

  it('falls back to "modlist" when nothing usable is present', () => {
    const name = buildExportFilename({ ...baseState, collectionUrl: '', inputValue: 'not numeric' });
    expect(name).toMatch(/^pz-modlist-modlist-\d{8}-\d{4}\.json$/);
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
});

describe('parseImportPayload', () => {
  function validPayload() {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      fetchedAt: null,
      collectionUrl: ITEM_URL,
      inputValue: COLLECTION_ID,
      b42Format: false,
      mods: [makeModEntry()],
      curated: [makeCuratedItem()],
    };
  }

  it('accepts a well-formed export payload round-trip', () => {
    const result = parseImportPayload(validPayload());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.mods).toHaveLength(1);
      expect(result.payload.curated).toHaveLength(1);
    }
  });

  it('rejects non-object input', () => {
    const result = parseImportPayload('a string');
    expect(result.ok).toBe(false);
  });

  it('rejects an unrecognized schemaVersion', () => {
    const result = parseImportPayload({ ...validPayload(), schemaVersion: 999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/incompatible version/i);
  });

  it('rejects malformed mod entries', () => {
    const result = parseImportPayload({ ...validPayload(), mods: [{ bogus: true }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/mod entry/i);
  });

  it('rejects malformed curated entries', () => {
    const result = parseImportPayload({ ...validPayload(), curated: [{ bogus: true }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/curated entry/i);
  });

  it('rejects a payload missing required scalar fields', () => {
    const payload = validPayload() as any;
    delete payload.b42Format;
    const result = parseImportPayload(payload);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing required fields/i);
  });

  it('accepts a string fetchedAt as well as null', () => {
    const result = parseImportPayload({ ...validPayload(), fetchedAt: new Date().toISOString() });
    expect(result.ok).toBe(true);
  });
});
