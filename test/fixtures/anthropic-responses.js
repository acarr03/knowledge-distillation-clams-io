/**
 * Mock Anthropic API responses for testing.
 */

const basicResponse = {
  id: 'msg_01XFDUDYJgAACzvnptvVoYEL',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-4-5-20250514',
  content: [
    {
      type: 'text',
      text: 'Vespel SP-1 has a tensile strength of approximately 12,400 psi (86 MPa) at room temperature.',
    },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 1850,
    output_tokens: 420,
  },
};

const multiBlockResponse = {
  id: 'msg_02ABCDEFGhijklmnop',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-4-5-20250514',
  content: [
    { type: 'text', text: 'Here is the comparison:\n\n' },
    { type: 'text', text: '**Torlon 4301** excels in high-temperature applications...' },
  ],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 2200,
    output_tokens: 890,
  },
};

const sampleQueries = {
  unit_conversion: 'Convert 14.5 MPa to psi',
  calculation: 'Calculate the PV limit for this bearing application',
  compliance_check: 'Is Vespel SP-1 RoHS compliant?',
  comparison: 'Compare Torlon 4301 vs PEEK for bearing applications',
  multi_constraint_selection: 'What material works for 300F, FDA contact, and PV of 25,000?',
  document_search: 'Find datasheets mentioning chemical resistance to acetone',
  material_lookup: "What's the tensile strength of Vespel SP-1?",
  general_engineering: 'Explain creep behavior in thermoplastic polymers',
};

module.exports = { basicResponse, multiBlockResponse, sampleQueries };
