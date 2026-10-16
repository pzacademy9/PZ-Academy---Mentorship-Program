/** Turns pasted bullets/numbering at the start of a line into "- " lines. Other text is untouched. */
export function normalizeBullets(text: string): string {
  return text
    .replace(/^([ \t]*)[•●▪‣◦○■][ \t\u00a0]*/gm, "$1- ")
    .replace(/^([ \t]*)(?:[–·*]|\d+[.)])[ \t\u00a0]+/gm, "$1- ");
}
