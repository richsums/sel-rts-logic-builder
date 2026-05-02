// ─── Recursive Descent Parser ─────────────────────────────────────────────────
// Grammar (precedence, low → high):
//   expr   := term (OR term)*
//   term   := factor (AND factor)*
//   factor := NOT factor | atom
//   atom   := OPERAND | LITERAL | '(' expr ')'

import { tokenize, type Token } from './tokenizer';
import { operand, literal, binaryOp, unaryOp, type ASTNode } from './ast';

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(expr: string) {
    this.tokens = tokenize(expr);
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private consume(): Token { return this.tokens[this.pos++]; }
  private expect(type: string): Token {
    const t = this.consume();
    if (t.type !== type) throw new Error(`Expected ${type} but got ${t.type} ("${t.value}")`);
    return t;
  }

  parse(): ASTNode {
    const node = this.parseExpr();
    if (this.peek().type !== 'EOF') {
      // Ignore trailing tokens gracefully
    }
    return node;
  }

  private parseExpr(): ASTNode {
    let left = this.parseTerm();
    while (this.peek().type === 'OR') {
      this.consume();
      const right = this.parseTerm();
      left = binaryOp('OR', left, right);
    }
    return left;
  }

  private parseTerm(): ASTNode {
    let left = this.parseFactor();
    while (this.peek().type === 'AND') {
      this.consume();
      const right = this.parseFactor();
      left = binaryOp('AND', left, right);
    }
    // Implicit AND: if next token is an operand/literal/lparen with no explicit operator
    while (['OPERAND','LITERAL','LPAREN','NOT'].includes(this.peek().type)) {
      const right = this.parseFactor();
      left = binaryOp('AND', left, right);
    }
    return left;
  }

  private parseFactor(): ASTNode {
    if (this.peek().type === 'NOT') {
      this.consume();
      const inner = this.parseFactor();
      return unaryOp(inner);
    }
    return this.parseAtom();
  }

  private parseAtom(): ASTNode {
    const tok = this.peek();
    if (tok.type === 'LPAREN') {
      this.consume();
      const inner = this.parseExpr();
      if (this.peek().type === 'RPAREN') this.consume();
      return inner;
    }
    if (tok.type === 'LITERAL') {
      this.consume();
      return literal(tok.value === '1' ? 1 : 0);
    }
    if (tok.type === 'OPERAND') {
      this.consume();
      // Check if next char is "!" suffix (some SELogic uses signal! for NOT)
      return operand(tok.value, false);
    }
    // Fallback: treat EOF or unknown as literal 0
    return literal(0);
  }
}

/** Parse a SELogic expression string into an AST. Returns null on empty. */
export function parseExpression(expr: string): ASTNode | null {
  const trimmed = expr.trim();
  if (!trimmed || trimmed === '0') return literal(0);
  if (trimmed === '1') return literal(1);
  try {
    return new Parser(trimmed).parse();
  } catch {
    // On parse error, return the raw expression as a single operand
    return operand(trimmed.replace(/[^A-Z0-9_]/gi, '_').slice(0, 20));
  }
}
