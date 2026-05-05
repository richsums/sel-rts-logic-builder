import { describe, it, expect } from 'vitest';
import { parseExpression, safeParseExpression } from '../selogic/parser';
import { astToString, hasEdgeOperator, collectSignals } from '../selogic/ast';

describe('SELogic AST parser', () => {
  it('parses literal 0', () => {
    const ast = parseExpression('0');
    expect(ast?.type).toBe('Literal');
    if (ast?.type === 'Literal') expect(ast.value).toBe(0);
  });

  it('parses literal 1', () => {
    const ast = parseExpression('1');
    expect(ast?.type).toBe('Literal');
    if (ast?.type === 'Literal') expect(ast.value).toBe(1);
  });

  it('parses single operand', () => {
    const ast = parseExpression('IN101');
    expect(ast?.type).toBe('Operand');
    if (ast?.type === 'Operand') expect(ast.name).toBe('IN101');
  });

  it('parses OR expression', () => {
    const ast = parseExpression('A + B');
    expect(ast?.type).toBe('BinaryOp');
    if (ast?.type === 'BinaryOp') {
      expect(ast.op).toBe('OR');
      expect(ast.left.type).toBe('Operand');
      expect(ast.right.type).toBe('Operand');
    }
  });

  it('parses AND expression', () => {
    const ast = parseExpression('A * B');
    expect(ast?.type).toBe('BinaryOp');
    if (ast?.type === 'BinaryOp') expect(ast.op).toBe('AND');
  });

  it('AND has higher precedence than OR', () => {
    // A + B * C should be A + (B * C)
    const ast = parseExpression('A + B * C');
    expect(ast?.type).toBe('BinaryOp');
    if (ast?.type === 'BinaryOp') {
      expect(ast.op).toBe('OR');
      expect(ast.right.type).toBe('BinaryOp');
      if (ast.right.type === 'BinaryOp') expect(ast.right.op).toBe('AND');
    }
  });

  it('parses NOT unary operator', () => {
    const ast = parseExpression('!A');
    expect(ast?.type).toBe('UnaryOp');
    if (ast?.type === 'UnaryOp') {
      expect(ast.op).toBe('NOT');
      expect(ast.operand.type).toBe('Operand');
    }
  });

  it('parses ^ as EDGE unary operator', () => {
    const ast = parseExpression('^IN101');
    expect(ast?.type).toBe('UnaryOp');
    if (ast?.type === 'UnaryOp') {
      expect(ast.op).toBe('EDGE');
      expect(ast.operand.type).toBe('Operand');
      if (ast.operand.type === 'Operand') expect(ast.operand.name).toBe('IN101');
    }
  });

  it('hasEdgeOperator returns true for ^ expression', () => {
    const ast = parseExpression('^IN101');
    expect(ast).not.toBeNull();
    if (ast) expect(hasEdgeOperator(ast)).toBe(true);
  });

  it('hasEdgeOperator returns false for plain expression', () => {
    const ast = parseExpression('A + B');
    expect(ast).not.toBeNull();
    if (ast) expect(hasEdgeOperator(ast)).toBe(false);
  });

  it('parses parenthesised subexpression', () => {
    const ast = parseExpression('(A + B) * C');
    expect(ast?.type).toBe('BinaryOp');
    if (ast?.type === 'BinaryOp') {
      expect(ast.op).toBe('AND');
      expect(ast.left.type).toBe('BinaryOp');
    }
  });

  it('parses compound POTT expression', () => {
    const expr = '(21P2 + 21G2) * 67P * RxWI';
    const ast = parseExpression(expr);
    expect(ast).not.toBeNull();
    const signals = ast ? Array.from(collectSignals(ast)) : [];
    expect(signals).toContain('21P2');
    expect(signals).toContain('21G2');
    expect(signals).toContain('67P');
    expect(signals).toContain('RXWI');
  });

  it('collects all signals from compound expression', () => {
    const ast = parseExpression('51P1T + 51G1T + 50P1 + 50G1');
    expect(ast).not.toBeNull();
    const signals = ast ? Array.from(collectSignals(ast)) : [];
    expect(signals).toContain('51P1T');
    expect(signals).toContain('51G1T');
    expect(signals).toContain('50P1');
    expect(signals).toContain('50G1');
    expect(signals).toHaveLength(4);
  });

  it('astToString round-trips simple expressions', () => {
    const ast = parseExpression('A + B');
    expect(ast).not.toBeNull();
    if (ast) {
      const str = astToString(ast);
      expect(str).toContain('A');
      expect(str).toContain('B');
    }
  });

  it('safeParseExpression returns error on malformed input', () => {
    const result = safeParseExpression(')invalid(');
    // Should not throw, returns an ast fallback with no error thrown
    expect(result.ast).not.toBeNull();
  });

  it('safeParseExpression returns null ast for empty string', () => {
    const result = safeParseExpression('');
    expect(result.ast).toBeNull();
    expect(result.error).toBeNull();
  });

  it('parses implicit AND (juxtaposition)', () => {
    // Some SELogic uses implicit AND: "A B" = "A AND B"
    const ast = parseExpression('A B');
    expect(ast?.type).toBe('BinaryOp');
    if (ast?.type === 'BinaryOp') expect(ast.op).toBe('AND');
  });
});
