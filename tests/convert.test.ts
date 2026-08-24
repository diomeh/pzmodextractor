import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '../src/pages/api/convert';
import {
  extractCollectionId,
  extractMatches,
  WORKSHOP_ID_PATTERN,
  MOD_ID_PATTERN,
} from '../src/lib/server/steamApi';

// Fixtures supplied for this suite: a real collection ID and a real single
// workshop item URL/ID (not a collection).
const COLLECTION_ID = '3489663816';
const ITEM_ID = '3314564075';
const ITEM_URL = `https://steamcommunity.com/sharedfiles/filedetails/?id=${ITEM_ID}`;

describe('extractCollectionId', () => {
  it('accepts a bare numeric ID', () => {
    expect(extractCollectionId(COLLECTION_ID)).toBe(COLLECTION_ID);
  });

  it('accepts a numeric ID with surrounding whitespace', () => {
    expect(extractCollectionId(`  ${COLLECTION_ID}  \n`)).toBe(COLLECTION_ID);
  });

  it('extracts the id query param from a workshop URL', () => {
    expect(extractCollectionId(ITEM_URL)).toBe(ITEM_ID);
  });

  it('extracts the id query param regardless of other query params', () => {
    expect(extractCollectionId(`${ITEM_URL}&someparam=1`)).toBe(ITEM_ID);
  });

  it('returns null for a URL with no id param', () => {
    expect(extractCollectionId('https://steamcommunity.com/sharedfiles/filedetails/')).toBeNull();
  });

  it('returns null for garbage input', () => {
    expect(extractCollectionId('not a url or id')).toBeNull();
    expect(extractCollectionId('')).toBeNull();
  });
});

describe('extractMatches', () => {
  it('extracts a single Workshop ID from a description', () => {
    const desc = 'Some text\nWorkshop ID: 123456789\nMore text';
    expect(extractMatches(desc, new RegExp(WORKSHOP_ID_PATTERN))).toEqual(['123456789']);
  });

  it('extracts multiple Mod IDs declared in one description', () => {
    const desc = ['Mod ID: FirstMod', 'Mod ID: SecondMod'].join('\n');
    expect(extractMatches(desc, new RegExp(MOD_ID_PATTERN))).toEqual(['FirstMod', 'SecondMod']);
  });

  it('tolerates the "ModID:" (no space) spelling variant', () => {
    expect(extractMatches('ModID: NoSpaceVariant', new RegExp(MOD_ID_PATTERN))).toEqual([
      'NoSpaceVariant',
    ]);
  });

  it('returns an empty array when the pattern is absent', () => {
    expect(extractMatches('nothing to see here', new RegExp(MOD_ID_PATTERN))).toEqual([]);
  });

  it('is reusable across calls despite the shared global-flag regex constants', () => {
    // WORKSHOP_ID_PATTERN/MOD_ID_PATTERN carry the `g` flag; String#match resets
    // lastIndex internally, but this guards against a future refactor to `.exec()`
    // reintroducing cross-call statefulness.
    expect(extractMatches('Workshop ID: 111', WORKSHOP_ID_PATTERN)).toEqual(['111']);
    expect(extractMatches('Workshop ID: 222', WORKSHOP_ID_PATTERN)).toEqual(['222']);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/convert', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function makeRequest(input: unknown): Request {
    return new Request('http://localhost/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
  }

  it('returns 400 for an unparseable body', async () => {
    const request = new Request('http://localhost/api/convert', {
      method: 'POST',
      body: 'not json',
    });
    const res = await POST({ request } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it('returns 400 when no collection ID can be extracted', async () => {
    const request = makeRequest('not a url or id');
    const res = await POST({ request } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/collection ID/i);
  });

  it('resolves a collection, fetches details, and extracts Workshop/Mod IDs from descriptions', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes('GetCollectionDetails')) {
        return jsonResponse({
          response: {
            collectiondetails: [
              {
                result: 1,
                children: [
                  { publishedfileid: ITEM_ID, sortorder: 0 },
                  { publishedfileid: '999', sortorder: 1 },
                ],
              },
            ],
          },
        });
      }
      if (url.includes('GetPublishedFileDetails')) {
        return jsonResponse({
          response: {
            publishedfiledetails: [
              {
                publishedfileid: ITEM_ID,
                result: 1,
                title: 'Test Mod',
                preview_url: 'https://example.com/preview.jpg',
                description: 'Workshop ID: 123456789\nMod ID: TestModId',
              },
              {
                publishedfileid: '999',
                result: 2, // failed lookup
              },
            ],
          },
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const res = await POST({ request: makeRequest(COLLECTION_ID) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mods: any[] };
    expect(json.mods).toHaveLength(2);

    const [first, second] = json.mods;
    expect(first.publishedfileid).toBe(ITEM_ID);
    expect(first.title).toBe('Test Mod');
    expect(first.ok).toBe(true);
    expect(first.ids).toEqual(['123456789']);
    expect(first.names).toEqual(['TestModId']);

    expect(second.publishedfileid).toBe('999');
    expect(second.ok).toBe(false);
    expect(second.title).toBe('Unknown item 999');
  });

  it('includes a source title/url derived from the collection id\'s own published-file detail', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init: any) => {
      if (url.includes('GetCollectionDetails')) {
        return jsonResponse({
          response: { collectiondetails: [{ result: 1, children: [{ publishedfileid: ITEM_ID, sortorder: 0 }] }] },
        });
      }
      if (url.includes('GetPublishedFileDetails')) {
        const body = new URLSearchParams(init.body as string);
        const itemcount = Number(body.get('itemcount'));
        const requestedIds = Array.from({ length: itemcount }, (_, i) => body.get(`publishedfileids[${i}]`));
        expect(requestedIds).toContain(COLLECTION_ID);
        expect(requestedIds).toContain(ITEM_ID);
        return jsonResponse({
          response: {
            publishedfiledetails: [
              { publishedfileid: COLLECTION_ID, result: 1, title: 'Vanilla+ Essentials' },
              { publishedfileid: ITEM_ID, result: 1, title: 'Test Mod', description: '' },
            ],
          },
        });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    });

    const res = await POST({ request: makeRequest(COLLECTION_ID) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mods: any[]; source: { id: string; title: string; url: string } };
    expect(json.mods).toHaveLength(1);
    expect(json.source).toEqual({
      id: COLLECTION_ID,
      title: 'Vanilla+ Essentials',
      url: `https://steamcommunity.com/sharedfiles/filedetails/?id=${COLLECTION_ID}`,
    });
  });

  it('falls back to a generic source title when the collection id has no own detail', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes('GetCollectionDetails')) {
        return jsonResponse({
          response: { collectiondetails: [{ result: 1, children: [{ publishedfileid: ITEM_ID }] }] },
        });
      }
      return jsonResponse({
        response: { publishedfiledetails: [{ publishedfileid: ITEM_ID, result: 1, title: 'Test Mod', description: '' }] },
      });
    });

    const res = await POST({ request: makeRequest(COLLECTION_ID) } as Parameters<typeof POST>[0]);
    const json = (await res.json()) as { source: { title: string } };
    expect(json.source.title).toBe(`Workshop item ${COLLECTION_ID}`);
  });

  it('accepts a workshop item URL and resolves via its id query param', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string) => {
      if (url.includes('GetCollectionDetails')) {
        return jsonResponse({
          response: { collectiondetails: [{ result: 1, children: [{ publishedfileid: ITEM_ID }] }] },
        });
      }
      return jsonResponse({
        response: {
          publishedfiledetails: [
            { publishedfileid: ITEM_ID, result: 1, title: 'From URL', description: '' },
          ],
        },
      });
    });

    const res = await POST({ request: makeRequest(ITEM_URL) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { mods: any[] };
    expect(json.mods[0].publishedfileid).toBe(ITEM_ID);
  });

  it('returns 500 with the underlying message when the collection lookup fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ response: { collectiondetails: [{ result: 2 }] } }),
    );

    const res = await POST({ request: makeRequest(COLLECTION_ID) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/not a Steam Workshop collection/i);
  });

  it('propagates a non-ok Steam API HTTP response as a 500', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('', { status: 503 }),
    );

    const res = await POST({ request: makeRequest(COLLECTION_ID) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(500);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/503/);
  });

  it('chunks published file detail requests at 50 items', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => String(i + 1));
    let detailsCalls = 0;

    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: string, init: any) => {
      if (url.includes('GetCollectionDetails')) {
        return jsonResponse({
          response: {
            collectiondetails: [{ result: 1, children: ids.map((id) => ({ publishedfileid: id })) }],
          },
        });
      }
      detailsCalls += 1;
      const body = new URLSearchParams(init.body as string);
      const itemcount = Number(body.get('itemcount'));
      const details = Array.from({ length: itemcount }, (_, i) => ({
        publishedfileid: body.get(`publishedfileids[${i}]`)!,
        result: 1,
        title: 't',
        description: '',
      }));
      return jsonResponse({ response: { publishedfiledetails: details } });
    });

    const res = await POST({ request: makeRequest(COLLECTION_ID) } as Parameters<typeof POST>[0]);
    const json = (await res.json()) as { mods: any[] };
    expect(json.mods).toHaveLength(120);
    expect(detailsCalls).toBe(3); // 50 + 50 + 20
  });
});
