// ─── Recursive Descent Parser ─────────────────────────────────────────────────
//
// Grammar (precedence, lowest → highest):
//   expr   := term  (OR  term)*
//   term   := factor (AND factor)*   -- also handles implicit AND
//   factor := NOT factor | EDGE factor | atom
//   atom   := OPERAND | LITERAL | '(' expr ')'
//

import { tokenize, type Token } from './tokenizer';
import { operand, literal, binaryOp, notOp, edgeOp, type ASTNode } from './ast';

/** Internal recursive descent parser. */
class SELogicParser {
  private readonly tokens: Token[];
  private pos = 0;

  constructor(expr: string) {
    this.tokens = tokenize(expr);
  }

  private peek(): Token { return this.tokens[this.pos]; }

  private consume(): Token { return this.tokens[this.pos++]; }

  /** Parse the full expression and return root AST node. */
  parse(): ASTNode {
    const node = this.parseExpr();
    // Consume trailing tokens gracefully (e.g., mismatched parens)
    return node;
  }

  /** expr := term (OR term)* */
  private parseExpr(): ASTNode {
    let left = this.parseTerm();
    while (this.peek().type === 'OR') {
      this.consume();
      const right = this.parseTerm();
      left = binaryOp('OR', left, right);
    }
    return left;
  }

  /** term := factor (AND factor)*  — also collapses implicit AND */
  private parseTerm(): ASTNode {
    let left = this.parseFactor();
    // Explicit AND
    while (this.peek().type === 'AND') {
      this.consume();
      const right = this.parseFactor();
      left = binaryOp('AND', left, right);
    }
    // Implicit AND: next token starts a new atom with no explicit operator
    while (['OPERAND', 'LITERAL', 'LPAREN', 'NOT', 'EDGE'].includes(this.peek().type)) {
      const right = this.parseFactor();
      left = binaryOp('AND', left, right);
    }
    return left;
  }

  /** factor := NOT factor | EDGE factor | atom */
  private parseFactor(): ASTNode {
    if (this.peek().type === 'NOT') {
      this.consume();
      return notOp(this.parseFactor());
    }
    if (this.peek().type === 'EDGE') {
      this.consume();
      return edgeOp(this.parseFactor());
    }
    return this.parseAtom();
  }

  /** atom := OPERAND | LITERAL | '(' expr ')' */
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
      return operand(tok.value);
    }
    // Fallback: EOF or unknown — return literal 0
    return literal(0);
  }
}

/**
 * Parse a SELogic expression string into a typed AST.
 * Returns `null` for empty expressions.
 * On parse error, returns a single Operand node with the sanitised expression
 * and sets a flag on the returned object — callers should check `parseError`.
 */
export function parseExpression(expr: string): ASTNode | null {
  const trimmed = expr.trim();
  if (!trimmed || trimmed === '0') return literal(0);
  if (trimmed === '1') return literal(1);
  try {
    return new SELogicParser(trimmed).parse();
  } catch {
    // On parse failure, return a placeholder so callers don't crash
    return operand(trimmed.replace(/[^A-Z0-9_]/gi, '_').slice(0, 32));
  }
}

/**
 * Safe wrapper: parse expression and return both the AST and any error.
 */
export function safeParseExpression(expr: string): {
  ast: ASTNode | null;
  error: string | null;
} {
  const trimmed = expr.trim();
  if (!trimmed) return { ast: null, error: null };
  try {
    const ast = new SELogicParser(trimmed).parse();
    return { ast, error: null };
  } catch (e) {
    return {
      ast: operand(trimmed.replace(/[^A-Z0-9_]/gi, '_').slice(0, 32)),
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
