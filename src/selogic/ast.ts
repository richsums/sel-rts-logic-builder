// ─── AST Node Types ───────────────────────────────────────────────────────────

export type BinaryOperator = 'AND' | 'OR' | 'XOR';
export type UnaryOperator  = 'NOT' | 'EDGE';

export interface BinaryOpNode {
  type: 'BinaryOp';
  op: BinaryOperator;
  left: ASTNode;
  right: ASTNode;
}

export interface UnaryOpNode {
  type: 'UnaryOp';
  /** NOT = logical inversion; EDGE = rising-edge trigger (^ operator) */
  op: UnaryOperator;
  operand: ASTNode;
}

export interface OperandNode {
  type: 'Operand';
  name: string;
}

export interface LiteralNode {
  type: 'Literal';
  value: 0 | 1;
}

export type ASTNode = BinaryOpNode | UnaryOpNode | OperandNode | LiteralNode;

// ─── Node Constructors ────────────────────────────────────────────────────────

/** Create an operand node for a signal name. */
export function operand(name: string): OperandNode {
  return { type: 'Operand', name };
}

/** Create a literal 0 or 1 node. */
export function literal(value: 0 | 1): LiteralNode {
  return { type: 'Literal', value };
}

/** Create a binary op node. */
export function binaryOp(op: BinaryOperator, left: ASTNode, right: ASTNode): BinaryOpNode {
  return { type: 'BinaryOp', op, left, right };
}

/** Create a unary NOT node. */
export function notOp(node: ASTNode): UnaryOpNode {
  return { type: 'UnaryOp', op: 'NOT', operand: node };
}

/** Create a rising-edge EDGE node (^ prefix operator). */
export function edgeOp(node: ASTNode): UnaryOpNode {
  return { type: 'UnaryOp', op: 'EDGE', operand: node };
}

// ─── AST Utilities ────────────────────────────────────────────────────────────

/**
 * Collect all unique signal names referenced in an AST subtree.
 * Ignores literals; recurses through all operator nodes.
 */
export function collectSignals(node: ASTNode, out: Set<string> = new Set<string>()): Set<string> {
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

/**
 * Check whether an AST contains any rising-edge (EDGE) operators.
 * Used by the pattern selector to choose Pattern H.
 */
export function hasEdgeOperator(node: ASTNode): boolean {
  switch (node.type) {
    case 'UnaryOp':
      return node.op === 'EDGE' || hasEdgeOperator(node.operand);
    case 'BinaryOp':
      return hasEdgeOperator(node.left) || hasEdgeOperator(node.right);
    default:
      return false;
  }
}

/** Pretty-print an AST back to a readable expression string. */
export function astToString(node: ASTNode): string {
  switch (node.type) {
    case 'Literal':  return String(node.value);
    case 'Operand':  return node.name;
    case 'UnaryOp':  return node.op === 'EDGE'
      ? `^${astToString(node.operand)}`
      : `NOT(${astToString(node.operand)})`;
    case 'BinaryOp': {
      const sym = node.op === 'AND' ? ' * ' : node.op === 'OR' ? ' + ' : ` ${node.op} `;
      return `(${astToString(node.left)}${sym}${astToString(node.right)})`;
    }
  }
}
