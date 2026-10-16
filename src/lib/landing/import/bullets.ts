/** Turns pasted bullets/numbering at the start of a line into "- " lines. Other text is untouched. */
export function normalizeBullets(text: string): string {
  return text.replace(/^([ \t]*)(?:[•●▪–·]|\d+[.)])[ \t]+/gm, "$1- ");
}
