/**
 * Valid query categories matching the CHECK constraint on interactions.query_category.
 */
export const CATEGORIES = [
  'unit_conversion',
  'calculation',
  'compliance_check',
  'comparison',
  'multi_constraint_selection',
  'document_search',
  'material_lookup',
  'general_engineering',
];

/**
 * Ordered classification rules. Most specific categories first to avoid
 * mis-classification.
 *
 * Key ordering decisions:
 *  - multi_constraint_selection before compliance_check: "What material for FDA contact?"
 *    is a selection query, not a compliance query. "What material" / "recommend" / "suggest"
 *    are strong intent signals that override keyword mentions of FDA/RoHS.
 *  - compliance_check before comparison: "Compare RoHS vs REACH" → compliance_check
 *
 * Uses \b word boundaries to prevent false positives like "epsilon" matching "psi".
 */
const rules = [
  {
    category: 'unit_conversion',
    test: (q) =>
      /\bconvert\b/i.test(q) ||
      /\b\d+(\.\d+)?\s*(mm|cm|in|inches|ft|feet|m|meters?)\b.*\bto\b/i.test(q) ||
      /\b\d+(\.\d+)?\s*(psi|mpa|gpa|ksi|bar|pa)\b.*\bto\b/i.test(q) ||
      /\b\d+(\.\d+)?\s*(°[fc]|fahrenheit|celsius|kelvin)\b.*\bto\b/i.test(q) ||
      /\b\d+(\.\d+)?\s*(lb|kg|oz|g|lbs)\b.*\bto\b/i.test(q),
  },
  {
    category: 'calculation',
    test: (q) =>
      /\bcalculat(e|ion)\b/i.test(q) ||
      /\bpv\s*(limit|value)\b/i.test(q) ||
      /\bcompute\b/i.test(q) ||
      /\bformula\b/i.test(q),
  },
  {
    category: 'multi_constraint_selection',
    test: (q) =>
      /\bwhat\s+material\b/i.test(q) ||
      /\brecommend\b/i.test(q) ||
      /\bsuggest\b/i.test(q) ||
      /\bselect\s+(a\s+)?material\b/i.test(q) ||
      /\bbest\s+(material|plastic|polymer)\b/i.test(q) ||
      /\bwhich\s+(material|plastic|polymer)\b/i.test(q),
  },
  {
    category: 'compliance_check',
    test: (q) =>
      /\bcomplian(ce|t)\b/i.test(q) ||
      /\brohs\b/i.test(q) ||
      /\breach\b/i.test(q) ||
      /\bfda\b/i.test(q) ||
      /\bul\s*94\b/i.test(q) ||
      /\bregulat(ion|ory|ed)\b/i.test(q) ||
      /\bcertifi(ed|cation)\b/i.test(q),
  },
  {
    category: 'comparison',
    test: (q) =>
      /\bcompar(e|ison|ing)\b/i.test(q) ||
      /\bvs\.?\b/i.test(q) ||
      /\bversus\b/i.test(q) ||
      /\bdifference\s+between\b/i.test(q) ||
      /\bbetter\b.*\bor\b/i.test(q),
  },
  {
    category: 'document_search',
    test: (q) =>
      /\bfind\s+(me\s+)?(datasheets?|documents?|specs?|tds)\b/i.test(q) ||
      /\bsearch\s+(for\s+)?(datasheets?|documents?)\b/i.test(q) ||
      /\bshow\s+me\b/i.test(q) ||
      /\blook\s*up\b.*\b(datasheet|document|spec)\b/i.test(q),
  },
  {
    category: 'material_lookup',
    test: (q) =>
      /\bwhat('s|\s+is)\s+the\s+.*(strength|modulus|temperature|density|elongation|hardness|coefficient)\b/i.test(q) ||
      /\b(tensile|flexural|compressive|impact)\s+(strength|modulus)\b/i.test(q) ||
      /\bproperties\s+of\b/i.test(q) ||
      /\b(hdt|cte|ctm|cof|thermal\s+conductivity)\b/i.test(q) ||
      /\bdata\s*sheet\b/i.test(q),
  },
];

/**
 * Classify a user query into one of 8 categories.
 * Returns the first matching category, or 'general_engineering' as fallback.
 */
export function classifyQuery(query) {
  if (!query || typeof query !== 'string') return 'general_engineering';

  for (const rule of rules) {
    if (rule.test(query)) return rule.category;
  }

  return 'general_engineering';
}
