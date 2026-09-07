/** Public API of the CPU example pinned in the runner; no implementation or oracle. */
export declare function structuredMarkdownDiff(beforeBody: string, afterBody: string): {
  hunks: Array<{
    oldStart: number; oldCount: number; newStart: number; newCount: number;
    lines: Array<{ type: 'CONTEXT' | 'REMOVE' | 'ADD'; oldLine: number | null; newLine: number | null; text: string }>;
  }>;
  changedSections: string[];
  rangeValidation: {
    status: 'PASS'; scope: 'FULL_DOCUMENT'; oldLines: number; newLines: number;
    algorithm: 'LCS' | 'BOUNDED_FALLBACK'; validated: true;
  };
};
