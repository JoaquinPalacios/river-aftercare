import { guideContentBlocks } from "@/lib/aftercare/guide-content";

import styles from "../patient.module.css";

export function GuideContent({
  text,
  idPrefix,
}: {
  text: string;
  idPrefix: string;
}) {
  const blocks = guideContentBlocks(text);
  if (blocks.length === 0) {
    return null;
  }

  return (
    <>
      {blocks.map((block, index) =>
        block.type === "list" ? (
          <ul key={`${idPrefix}-list-${index}`} className={styles.contentList}>
            {block.items.map((item, itemIndex) => (
              <li key={`${idPrefix}-item-${index}-${itemIndex}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p key={`${idPrefix}-p-${index}`} className={styles.body}>
            {block.text}
          </p>
        )
      )}
    </>
  );
}
