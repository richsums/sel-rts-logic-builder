// ─── SELogic Tokenizer ────────────────────────────────────────────────────────

/** All token types produced by the SELogic lexer. */
export type TokenType =
  | 'AND'
  | 'OR'
  | 'NOT'
  | 'XOR'
  | 'EDGE'       // ^ prefix — rising edge
  | 'LPAREN'
  | 'RPAREN'
  | 'OPERAND'
  | 'LITERAL'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

/** Single-character operator mapping */
const SINGLE_CHAR_OPS: Record<string, TokenType> = {
  '*': 'AND',
  '+': 'OR',
  '!': 'NOT',
  '&': 'AND',
  '|': 'OR',
  '^': 'EDGE',
  '/': 'EDGE',   // SEL-351 classic rising-edge prefix (e.g. "/TRIP")
};

/** Keyword operator mapping (case-insensitive) */
const KEYWORD_OPS: Record<string, TokenType> = {
  AND:   'AND',
  OR:    'OR',
  NOT:   'NOT',
  XOR:   'XOR',
  EDGE:  'EDGE',
  R_TRIG: 'EDGE',
};

/**
 * Tokenize a SELogic expression string into a flat list of tokens.
 * Handles: AND/OR/NOT/XOR/EDGE keywords, *, +, !, &, |, ^, parentheses,
 * identifiers (signal names), and integer literals 0/1.
 */
export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) { i++; continue; }

    // Parentheses
    if (expr[i] === '(') { tokens.push({ type: 'LPAREN', value: '(', pos: i++ }); continue; }
    if (expr[i] === ')') { tokens.push({ type: 'RPAREN', value: ')', pos: i++ }); continue; }

    // Single-character operators
    if (expr[i] in SINGLE_CHAR_OPS) {
      const ch = expr[i];
      tokens.push({ type: SINGLE_CHAR_OPS[ch], value: ch, pos: i++ });
      continue;
    }

    // Identifiers, keywords, and numeric literals
    if (/[A-Za-z0-9_]/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_.#]/.test(expr[j])) j++;
      const word = expr.slice(i, j);
      const upper = word.toUpperCase();

      if (upper in KEYWORD_OPS) {
        tokens.push({ type: KEYWORD_OPS[upper], value: word, pos: i });
      } else if (upper === '0' || upper === '1') {
        tokens.push({ type: 'LITERAL', value: upper, pos: i });
      } else {
        tokens.push({ type: 'OPERAND', value: upper, pos: i });
      }
      i = j;
      continue;
    }

    // Skip unknown characters (e.g., := assignment in PAC syntax)
    i++;
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}
