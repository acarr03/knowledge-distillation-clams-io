/**
 * Heuristic complexity scorer for user queries.
 * Returns an integer from 1 (simple) to 5 (very complex).
 *
 * Factors:
 *  - Number of constraint patterns found
 *  - Word count of the query
 *  - Depth markers (why, explain, trade-off, etc.)
 *  - Volume of RAG context provided
 */

const CONSTRAINT_PATTERNS = [
  /\band\b/i,
  /\bbut\b/i,
  /\bwith\b/i,
  /\bunder\b/i,
  /\babove\b/i,
  /\bbelow\b/i,
  /\bbetween\b/i,
  /\blimit\b/i,
  /\bmaximum\b/i,
  /\bminimum\b/i,
  /\bat\s+least\b/i,
  /\bno\s+more\s+than\b/i,
  /\bless\s+than\b/i,
  /\bgreater\s+than\b/i,
  /\bexceed\b/i,
  /\brange\b/i,
];

const DEPTH_PATTERNS = [
  /\bwhy\b/i,
  /\bexplain\b/i,
  /\btrade-?off\b/i,
  /\banalyz(e|is)\b/i,
  /\bcomplex\b/i,
  /\bdetail(ed)?\b/i,
  /\bfailure\s+mode\b/i,
  /\broot\s+cause\b/i,
];

export function scoreComplexity(query, ragContext) {
  if (!query || typeof query !== 'string') return 1;

  let score = 1;

  // Count constraint patterns (each match adds 0.5, then floor)
  let constraintHits = 0;
  for (const pattern of CONSTRAINT_PATTERNS) {
    if (pattern.test(query)) constraintHits++;
  }
  score += Math.floor(constraintHits / 2);

  // Word count factor
  const wordCount = query.trim().split(/\s+/).length;
  if (wordCount > 40) score += 1;
  else if (wordCount > 20) score += 0.5;

  // Depth markers
  let depthHits = 0;
  for (const pattern of DEPTH_PATTERNS) {
    if (pattern.test(query)) depthHits++;
  }
  if (depthHits >= 2) score += 1;
  else if (depthHits >= 1) score += 0.5;

  // RAG context volume — more context suggests a more complex question
  if (ragContext) {
    const contextStr = typeof ragContext === 'string' ? ragContext : JSON.stringify(ragContext);
    if (contextStr.length > 5000) score += 1;
    else if (contextStr.length > 2000) score += 0.5;
  }

  // Clamp to 1–5
  return Math.max(1, Math.min(5, Math.round(score)));
}
