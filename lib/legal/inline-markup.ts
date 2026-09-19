export type LegalInlineNode =
  | { type: "text"; value: string }
  | { type: "strong"; children: readonly LegalInlineNode[] }
  | { type: "link"; href: string; children: readonly LegalInlineNode[] };

const LINK_HREF_PATTERN = /^(mailto:|https?:\/\/)/i;

function mergeTextNodes(nodes: readonly LegalInlineNode[]): LegalInlineNode[] {
  const merged: LegalInlineNode[] = [];

  for (const node of nodes) {
    const previous = merged.at(-1);
    if (node.type === "text" && previous?.type === "text") {
      merged[merged.length - 1] = {
        type: "text",
        value: `${previous.value}${node.value}`,
      };
      continue;
    }
    merged.push(node);
  }

  return merged;
}

function nextSpecialIndex(input: string, from: number): number {
  const strongIndex = input.indexOf("**", from);
  const linkIndex = input.indexOf("[", from);
  const candidates = [strongIndex, linkIndex].filter((index) => index !== -1);
  return candidates.length === 0 ? input.length : Math.min(...candidates);
}

function parseLink(
  input: string,
  from: number
): { node: LegalInlineNode; nextIndex: number } | null {
  if (input[from] !== "[") {
    return null;
  }

  const labelEnd = input.indexOf("]", from + 1);
  if (labelEnd === -1 || input[labelEnd + 1] !== "(") {
    return null;
  }

  const hrefEnd = input.indexOf(")", labelEnd + 2);
  if (hrefEnd === -1) {
    return null;
  }

  const href = input.slice(labelEnd + 2, hrefEnd);
  if (!LINK_HREF_PATTERN.test(href)) {
    return null;
  }

  return {
    node: {
      type: "link",
      href,
      children: parseLegalInline(input.slice(from + 1, labelEnd)),
    },
    nextIndex: hrefEnd + 1,
  };
}

export function parseLegalInline(input: string): LegalInlineNode[] {
  const nodes: LegalInlineNode[] = [];
  let index = 0;

  while (index < input.length) {
    if (input.startsWith("**", index)) {
      const closeIndex = input.indexOf("**", index + 2);
      if (closeIndex !== -1) {
        nodes.push({
          type: "strong",
          children: parseLegalInline(input.slice(index + 2, closeIndex)),
        });
        index = closeIndex + 2;
        continue;
      }
    }

    const link = parseLink(input, index);
    if (link) {
      nodes.push(link.node);
      index = link.nextIndex;
      continue;
    }

    const nextIndex = nextSpecialIndex(input, index);
    if (nextIndex === index) {
      nodes.push({ type: "text", value: input[index] ?? "" });
      index += 1;
      continue;
    }

    nodes.push({ type: "text", value: input.slice(index, nextIndex) });
    index = nextIndex;
  }

  return mergeTextNodes(nodes);
}
