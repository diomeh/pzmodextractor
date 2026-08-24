import { renderDescription } from '../lib/bbcode';

interface Props {
  description: string;
  className?: string;
}

// Isolates the app's one dangerouslySetInnerHTML boundary. renderDescription already
// sanitizes BBCode to a fixed tag allowlist (see src/lib/bbcode.ts) before this ever
// touches the DOM.
export function BBCodeDescription({ description, className }: Props) {
  return <div class={className} dangerouslySetInnerHTML={{ __html: renderDescription(description) }} />;
}
