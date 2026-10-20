export type DiffLine = {
  type: "add" | "del" | "same";
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

/**
 * Minimal LCS line diff. Adequate for paper revisions (hundreds of lines);
 * a production deployment would swap in a Myers implementation or a patch
 * service, but this keeps the MVP dependency-free.
 */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const n = oldLines.length;
  const m = newLines.length;

  // Guard against pathological sizes in the API route.
  if (n * m > 4_000_000) {
    return [
      ...oldLines.map((text, index) => ({
        type: "del" as const,
        text,
        oldLine: index + 1,
        newLine: null,
      })),
      ...newLines.map((text, index) => ({
        type: "add" as const,
        text,
        oldLine: null,
        newLine: index + 1,
      })),
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] =
        oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      out.push({ type: "same", text: oldLines[i], oldLine: i + 1, newLine: j + 1 });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "del", text: oldLines[i], oldLine: i + 1, newLine: null });
      i += 1;
    } else {
      out.push({ type: "add", text: newLines[j], oldLine: null, newLine: j + 1 });
      j += 1;
    }
  }
  while (i < n) {
    out.push({ type: "del", text: oldLines[i], oldLine: i + 1, newLine: null });
    i += 1;
  }
  while (j < m) {
    out.push({ type: "add", text: newLines[j], oldLine: null, newLine: j + 1 });
    j += 1;
  }
  return out;
}

export function diffStats(lines: DiffLine[]) {
  return {
    added: lines.filter((line) => line.type === "add").length,
    removed: lines.filter((line) => line.type === "del").length,
  };
}
