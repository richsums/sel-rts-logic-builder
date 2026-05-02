// ─── SELogic Tokenizer ────────────────────────────────────────────────────────

export type TokenType =
  | 'AND' | 'OR' | 'NOT' | 'XOR'
  | 'LPAREN' | 'RPAREN'
  | 'OPERAND' | 'LITERAL'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const OPERATORS: Record<string, TokenType> = {
  AND: 'AND', OR: 'OR', NOT: 'NOT', XOR: 'XOR',
  '*': 'AND', '+': 'OR', '!': 'NOT', '&': 'AND', '|': 'OR',
};

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expr.length) {
    // Skip whitespace
    if (/\s/.test(expr[i])) { i++; continue; }

    // Parentheses
    if (expr[i] === '(') { tokens.push({ type: 'LPAREN', value: '(', pos: i++ }); continue; }
    if (expr[i] === ')') { tokens.push({ type: 'RPAREN', value: ')', pos: i++ }); continue; }

    // Single-char operators
    if ('*+!&|'.includes(expr[i])) {
      const ch = expr[i];
      tokens.push({ type: OPERATORS[ch] as TokenType, value: ch, pos: i++ });
      continue;
    }

    // Identifiers (operands, keywords, literals)
    if (/[A-Za-z0-9_]/.test(expr[i])) {
      let j = i;
      while (j < expr.length && /[A-Za-z0-9_.#]/.test(expr[j])) j++;
      const word = expr.slice(i, j);
      const upper = word.toUpperCase();

      if (upper in OPERATORS) {
        tokens.push({ type: OPERATORS[upper] as TokenType, value: word, pos: i });
      } else if (upper === '0' || upper === '1') {
        tokens.push({ type: 'LITERAL', value: upper, pos: i });
      } else {
        tokens.push({ type: 'OPERAND', value: upper, pos: i });
      }
      i = j;
      continue;
    }

    // Skip unknown chars
    i++;
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}
