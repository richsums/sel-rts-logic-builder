// ─── AST Node Types ───────────────────────────────────────────────────────────

export type Operator = 'AND' | 'OR' | 'NOT' | 'XOR' | 'PULSE' | 'EDGE';

export interface BinaryOpNode {
  type: 'BinaryOp';
  op: Operator;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOpNode {
  type: 'UnaryOp';
  op: 'NOT';
  operand: ASTNode;
}

export interface OperandNode {
  type: 'Operand';
  name: string;         // signal name (e.g. "51P1T", "IN101", "M1")
  inverted: boolean;    // true if preceded by NOT / !
}

export interface LiteralNode {
  type: 'Literal';
  value: 0 | 1;
}

export type ASTNode = BinaryOpNode | UnaryOpNode | OperandNode | LiteralNode;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function operand(name: string, inverted = false): OperandNode {
  return { type: 'Operand', name, inverted };
}

export function literal(value: 0 | 1): LiteralNode {
  return { type: 'Literal', value };
}

export function binaryOp(op: Operator, left: ASTNode, right: ASTNode): BinaryOpNode {
  return { type: 'BinaryOp', op, left, right };
}

export function unaryOp(operand: ASTNode): UnaryOpNode {
  return { type: 'UnaryOp', op: 'NOT', operand };
}

/** Collect all unique signal names referenced in an AST */
export function collectSignals(node: ASTNode, out = new Set<string>()): Set<string> {
  switch (node.type) {
    case 'Operand':
      out.add(node.name);
      break;
    case 'UnaryOp':
      collectSignals(node.operand, out);
      break;
    case 'BinaryOp':
      collectSignals(node.left, out);
      collectSignals(node.right, out);
      break;
    case 'Literal':
      break;
  }
  return out;
}

/** Pretty-print an AST back to a human-readable expression */
export function astToString(node: ASTNode): string {
  switch (node.type) {
    case 'Literal': return String(node.value);
    case 'Operand': return node.inverted ? `!${node.name}` : node.name;
    case 'UnaryOp': return `NOT(${astToString(node.operand)})`;
    case 'BinaryOp': {
      const sym = node.op === 'AND' ? ' * ' : node.op === 'OR' ? ' + ' : ` ${node.op} `;
      return `(${astToString(node.left)}${sym}${astToString(node.right)})`;
    }
  }
}
