export type GuideContentBlock =
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

const BULLET_LINE = /^(?:•|-)\s+(.*)$/;
const ORDERED_LINE = /^(\d+)\.\s+(.*)$/;

type ListStyle = "unordered" | "ordered";

function listItem(line: string): { style: ListStyle; text: string } | null {
  const bullet = BULLET_LINE.exec(line);
  if (bullet) {
    const text = bullet[1].trim();
    return text.length > 0 ? { style: "unordered", text } : null;
  }
  const ordered = ORDERED_LINE.exec(line);
  if (ordered) {
    const text = ordered[2].trim();
    return text.length > 0 ? { style: "ordered", text } : null;
  }
  return null;
}

/**
 * Turns plain aftercare text into paragraphs and simple lists.
 * Recognises lines that start with "• ", "- ", or "1. " (any positive
 * integer, a dot, then whitespace). Does not interpret HTML or Markdown.
 */
export function guideContentBlocks(body: string): GuideContentBlock[] {
  const blocks: GuideContentBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let listStyle: ListStyle | null = null;

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
    if (list.length === 0 || !listStyle) {
      list = [];
      listStyle = null;
      return;
    }
    blocks.push({
      type: "list",
      ordered: listStyle === "ordered",
      items: list,
    });
    list = [];
    listStyle = null;
  }

  for (const rawLine of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const item = listItem(line);
    if (item) {
      if (listStyle && listStyle !== item.style) {
        flushList();
      }
      flushParagraph();
      listStyle = item.style;
      list.push(item.text);
      continue;
    }
    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}
