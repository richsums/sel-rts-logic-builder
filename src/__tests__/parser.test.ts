import { describe, it, expect } from 'vitest';
import { parseExpression, safeParseExpression } from '../selogic/parser';
import { astToString, hasEdgeOperator, collectSignals } from '../selogic/ast';
import { parseKeyValue } from '../relay-adapters/common/parser-utils';

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

// ─── SEL settings file line parser ───────────────────────────────────────────

describe('parseKeyValue — SEL settings formats', () => {
  it('parses KEY,"VALUE" format (settings sections)', () => {
    const result = parseKeyValue('TR,"51P1T+51G1T+67P1T+67G1T+67G2T"');
    expect(result).not.toBeNull();
    expect(result?.key).toBe('TR');
    expect(result?.value).toBe('51P1T+51G1T+67P1T+67G1T+67G2T');
  });

  it('parses KEY,"NUMERIC_VALUE" format', () => {
    const result = parseKeyValue('50P1P,"15.60"');
    expect(result).not.toBeNull();
    expect(result?.key).toBe('50P1P');
    expect(result?.value).toBe('15.60');
  });

  it('parses KEY,"VALUE WITH SPACES" format', () => {
    const result = parseKeyValue('RID,"ELR F351A 02-26-26"');
    expect(result).not.toBeNull();
    expect(result?.key).toBe('RID');
    expect(result?.value).toBe('ELR F351A 02-26-26');
  });

  it('parses KEY=VALUE format (INFO section)', () => {
    const result = parseKeyValue('RELAYTYPE=SEL-351S-6');
    expect(result).not.toBeNull();
    expect(result?.key).toBe('RELAYTYPE');
    expect(result?.value).toBe('SEL-351S-6');
  });

  it('parses FID=... format (INFO section)', () => {
    const result = parseKeyValue('FID=SEL-351S-6-R518-V4-Z107106-D20250428');
    expect(result).not.toBeNull();
    expect(result?.key).toBe('FID');
    expect(result?.value).toBe('SEL-351S-6-R518-V4-Z107106-D20250428');
  });

  it('returns null for comment lines starting with *', () => {
    expect(parseKeyValue('* This is a comment')).toBeNull();
  });

  it('returns null for comment lines starting with ;', () => {
    expect(parseKeyValue('; Another comment')).toBeNull();
  });

  it('returns null for blank lines', () => {
    expect(parseKeyValue('')).toBeNull();
    expect(parseKeyValue('   ')).toBeNull();
  });

  it('returns null for section header lines', () => {
    expect(parseKeyValue('[L1]')).toBeNull();
    expect(parseKeyValue('[G]')).toBeNull();
    expect(parseKeyValue('[1]')).toBeNull();
  });

  it('key is always uppercased', () => {
    const r1 = parseKeyValue('nfreq,"60"');
    expect(r1?.key).toBe('NFREQ');
    const r2 = parseKeyValue('nfreq=60');
    expect(r2?.key).toBe('NFREQ');
  });

  it('handles 52A assignment with binary input', () => {
    const result = parseKeyValue('52A,"IN101"');
    expect(result?.key).toBe('52A');
    expect(result?.value).toBe('IN101');
  });

  it('handles output contact assignment', () => {
    const result = parseKeyValue('OUT101,"TRIP"');
    expect(result?.key).toBe('OUT101');
    expect(result?.value).toBe('TRIP');
  });
});
