export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---- BBCode -> safe HTML for Steam Workshop descriptions ----

type BBTag = 'b' | 'i' | 'u' | 's' | 'strike' | 'h1' | 'h2' | 'h3' | 'url' | 'img' | 'hr' | 'list' | 'olist' | 'li';

interface BBTextNode {
  type: 'text';
  value: string;
}

interface BBElementNode {
  type: BBTag | 'root';
  arg?: string;
  children: BBNode[];
}

type BBNode = BBTextNode | BBElementNode;

const BB_ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'b',
  'i',
  'u',
  's',
  'strike',
  'h1',
  'h2',
  'h3',
  'url',
  'img',
  'hr',
  'list',
  'olist',
]);
const BB_BLOCK_TAGS: ReadonlySet<string> = new Set(['h1', 'h2', 'h3', 'list', 'olist', 'hr']);

export function parseBBCode(raw: string): BBElementNode {
  const root: BBElementNode = { type: 'root', children: [] };
  const stack: BBElementNode[] = [root];
  const tagRe = /\[(\/)?([a-zA-Z0-9]+|\*)(=[^\]]*)?\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushText = (text: string) => {
    if (!text) return;
    stack[stack.length - 1].children.push({ type: 'text', value: text });
  };

  while ((match = tagRe.exec(raw))) {
    pushText(raw.slice(lastIndex, match.index));
    lastIndex = tagRe.lastIndex;

    const isClose = !!match[1];
    const rawName = match[2].toLowerCase();
    const arg = match[3] ? match[3].slice(1) : undefined;

    if (rawName === '*') {
      const top = stack[stack.length - 1];
      if (top.type === 'li') stack.pop();
      const container = stack[stack.length - 1];
      if (container.type === 'list' || container.type === 'olist') {
        const li: BBElementNode = { type: 'li', children: [] };
        container.children.push(li);
        stack.push(li);
      } else {
        pushText('[*]');
      }
      continue;
    }

    if (!BB_ALLOWED_TAGS.has(rawName)) {
      pushText(match[0]);
      continue;
    }

    if (rawName === 'hr') {
      if (!isClose) stack[stack.length - 1].children.push({ type: 'hr', children: [] });
      continue;
    }

    if (!isClose) {
      const node: BBElementNode = { type: rawName as BBTag, arg, children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      let idx = -1;
      for (let i = stack.length - 1; i >= 1; i--) {
        if (stack[i].type === rawName) {
          idx = i;
          break;
        }
      }
      if (idx !== -1) stack.length = idx;
    }
  }
  pushText(raw.slice(lastIndex));
  return root;
}

export function bbExtractText(nodes: BBNode[]): string {
  return nodes.map((n) => (n.type === 'text' ? n.value : bbExtractText(n.children))).join('');
}

export function bbSafeUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch {
    // not a valid absolute URL
  }
  return null;
}

function bbRenderNodes(nodes: BBNode[]): string {
  return nodes.map(bbRenderNode).join('');
}

function bbRenderNode(node: BBNode): string {
  if (node.type === 'text') return esc(node.value).replace(/\n/g, '<br>');

  switch (node.type) {
    case 'b':
      return `<strong>${bbRenderNodes(node.children)}</strong>`;
    case 'i':
      return `<em>${bbRenderNodes(node.children)}</em>`;
    case 'u':
      return `<u>${bbRenderNodes(node.children)}</u>`;
    case 's':
    case 'strike':
      return `<s>${bbRenderNodes(node.children)}</s>`;
    case 'url': {
      const href = bbSafeUrl(node.arg ?? bbExtractText(node.children));
      const inner = bbRenderNodes(node.children);
      return href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${inner}</a>`
        : inner;
    }
    case 'img': {
      const src = bbSafeUrl(bbExtractText(node.children));
      return src
        ? `<img src="${esc(src)}" alt="" loading="lazy" style="max-width:100%;border-radius:0;margin:4px 0;" />`
        : '';
    }
    case 'h1':
      return `<div style="font-size:15px;font-weight:800;color:#e8e8e8;margin:10px 0 4px;">${bbRenderNodes(node.children)}</div>`;
    case 'h2':
      return `<div style="font-size:13px;font-weight:700;color:#e8e8e8;margin:8px 0 4px;">${bbRenderNodes(node.children)}</div>`;
    case 'h3':
      return `<div style="font-size:12px;font-weight:700;color:#999999;margin:6px 0 3px;">${bbRenderNodes(node.children)}</div>`;
    case 'hr':
      return `<hr style="border:none;border-top:1px solid #555555;margin:8px 0;" />`;
    case 'list':
    case 'olist': {
      const tag = node.type === 'olist' ? 'ol' : 'ul';
      const items = node.children
        .filter((c): c is BBElementNode => c.type === 'li')
        .map((li) => `<li>${bbRenderNodes(li.children)}</li>`)
        .join('');
      return `<${tag} style="margin:4px 0 8px;padding-left:18px;">${items}</${tag}>`;
    }
    default:
      return bbRenderNodes(node.children);
  }
}

function bbRenderParagraph(paragraph: string): string {
  const tree = parseBBCode(paragraph);
  const meaningful = tree.children.filter((c) => !(c.type === 'text' && !c.value.trim()));
  if (meaningful.length === 1 && meaningful[0].type !== 'text' && BB_BLOCK_TAGS.has(meaningful[0].type)) {
    return bbRenderNode(meaningful[0]);
  }
  return `<p style="margin:0 0 8px;">${bbRenderNodes(tree.children)}</p>`;
}

export function renderDescription(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '<span>No description available.</span>';
  return trimmed
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(bbRenderParagraph)
    .join('');
}

// Fuzzy hint only: Steam Workshop has no structured way for an author to mark a
// multi-ID item's IDs as alternative branches, so this just scans the description's
// prose for the phrasing authors commonly use to warn about it (e.g. Authentic Z's
// "only use ONE" branch split). False negatives/positives are expected and fine —
// it's a hint, not a guarantee.
const EXCLUSIVE_HINT_PATTERN =
  /only (?:use|enable|run|activate) one|only one (?:should|can) be|choose one|pick one|mutually exclusive|do not (?:use|enable|run) (?:both|more than one)|not (?:both|together)|branch(?:es)?\b/i;

export function looksExclusive(description: string): boolean {
  return EXCLUSIVE_HINT_PATTERN.test(description);
}
