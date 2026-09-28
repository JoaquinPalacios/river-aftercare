export type GuideContentBlock =
  { type: "paragraph"; text: string } | { type: "list"; items: string[] };

const BULLET_LINE = /^(?:•|-)\s+(.*)$/;

function bulletItem(line: string): string | null {
  const match = BULLET_LINE.exec(line);
  if (!match) {
    return null;
  }
  const item = match[1].trim();
  return item.length > 0 ? item : null;
}

/**
 * Turns plain aftercare text into paragraphs and simple bullet lists.
 * Recognises lines that start with "• " or "- ". Does not interpret HTML
 * or Markdown.
 */
export function guideContentBlocks(body: string): GuideContentBlock[] {
  const blocks: GuideContentBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) {
      return;
    }
    const text = paragraph.join("\n").trim();
    paragraph = [];
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
  }

  function flushList() {
    if (list.length === 0) {
      return;
    }
    blocks.push({ type: "list", items: list });
    list = [];
  }

  for (const rawLine of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const item = bulletItem(line);
    if (item !== null) {
      flushParagraph();
      list.push(item);
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}
