import { describe, it, expect } from 'vitest';
import { tokenize } from '../selogic/tokenizer';

describe('SELogic tokenizer', () => {
  it('tokenizes AND keyword', () => {
    const tokens = tokenize('A AND B');
    expect(tokens.some(t => t.type === 'AND')).toBe(true);
  });

  it('tokenizes * as AND', () => {
    const tokens = tokenize('A * B');
    expect(tokens.find(t => t.value === '*')?.type).toBe('AND');
  });

  it('tokenizes OR keyword', () => {
    const tokens = tokenize('A OR B');
    expect(tokens.some(t => t.type === 'OR')).toBe(true);
  });

  it('tokenizes + as OR', () => {
    const tokens = tokenize('A + B');
    expect(tokens.find(t => t.value === '+')?.type).toBe('OR');
  });

  it('tokenizes ! as NOT', () => {
    const tokens = tokenize('!A');
    expect(tokens.find(t => t.value === '!')?.type).toBe('NOT');
  });

  it('tokenizes NOT keyword', () => {
    const tokens = tokenize('NOT A');
    expect(tokens.find(t => t.type === 'NOT')).toBeTruthy();
  });

  it('tokenizes ^ as EDGE (rising edge)', () => {
    const tokens = tokenize('^IN101');
    expect(tokens.find(t => t.value === '^')?.type).toBe('EDGE');
  });

  it('tokenizes & as AND', () => {
    const tokens = tokenize('A & B');
    expect(tokens.find(t => t.value === '&')?.type).toBe('AND');
  });

  it('tokenizes | as OR', () => {
    const tokens = tokenize('A | B');
    expect(tokens.find(t => t.value === '|')?.type).toBe('OR');
  });

  it('tokenizes parentheses', () => {
    const tokens = tokenize('(A + B)');
    expect(tokens.some(t => t.type === 'LPAREN')).toBe(true);
    expect(tokens.some(t => t.type === 'RPAREN')).toBe(true);
  });

  it('tokenizes literal 0', () => {
    const tokens = tokenize('0');
    expect(tokens.find(t => t.type === 'LITERAL')?.value).toBe('0');
  });

  it('tokenizes literal 1', () => {
    const tokens = tokenize('1');
    expect(tokens.find(t => t.type === 'LITERAL')?.value).toBe('1');
  });

  it('tokenizes compound expression', () => {
    const tokens = tokenize('51P1T + 51G1T * !BLK');
    const types = tokens.filter(t => t.type !== 'EOF').map(t => t.type);
    expect(types).toContain('OPERAND');
    expect(types).toContain('OR');
    expect(types).toContain('AND');
    expect(types).toContain('NOT');
  });

  it('always ends with EOF token', () => {
    const tokens = tokenize('A + B');
    expect(tokens[tokens.length - 1].type).toBe('EOF');
  });

  it('handles XOR keyword', () => {
    const tokens = tokenize('A XOR B');
    expect(tokens.some(t => t.type === 'XOR')).toBe(true);
  });

  it('handles R_TRIG as EDGE', () => {
    const tokens = tokenize('R_TRIG');
    expect(tokens.some(t => t.type === 'EDGE')).toBe(true);
  });

  it('normalises operand names to uppercase', () => {
    const tokens = tokenize('in101');
    expect(tokens.find(t => t.type === 'OPERAND')?.value).toBe('IN101');
  });

  it('skips whitespace', () => {
    const t1 = tokenize('A+B').filter(t => t.type !== 'EOF');
    const t2 = tokenize('A + B').filter(t => t.type !== 'EOF');
    expect(t1.length).toBe(t2.length);
  });
});
