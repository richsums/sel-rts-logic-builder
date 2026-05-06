/**
 * @module selogic/trip-paths
 * Enumerate all paths through a trip equation AST that can independently
 * assert the trip output to 1.
 *
 * Each TripPath represents ONE testable scenario:
 *   - Assert leafElement = 1 (inject fault stimulus)
 *   - Assert all andConditions = 1 (supervisor/permissive signals)
 *   - Assert all notConditions = 0 (blocking signals de-asserted)
 *   → Expect output = 1
 *
 * Additionally, for every andCondition and notCondition, an INHIBIT test
 * can be generated to prove the blocking/supervisory logic is effective.
 */

import type { ASTNode } from './ast';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TripPath {
  /** Primary signal that drives the trip (e.g. '51PT', '87L', '50P1'). */
  leafElement: string;
  /** Signals that must be asserted (= 1) alongside the leaf for trip. */
  andConditions: string[];
  /** Signals that must be de-asserted (= 0) for the path to be active. */
  notConditions: string[];
  /** True if the leaf is triggered via a rising-edge (^ prefix). */
  isEdge: boolean;
}

export interface InhibitCondition {
  /** The signal whose assertion (NOT) or de-assertion (AND) blocks trip. */
  signal: string;
  /** How the block is activated:
   *  'NOT'  → signal must be asserted (= 1) to block
   *  'AND'  → signal must be de-asserted (= 0) to block (supervisor missing) */
  blockType: 'NOT' | 'AND';
  /** The protection element that would have tripped without the block. */
  leafElement: string;
  /** Other conditions that must still hold during the inhibit test. */
  otherAndConditions: string[];
  /** Other NOT conditions that must still hold during the inhibit test. */
  otherNotConditions: string[];
}

// ─── Requirement extraction ────────────────────────────────────────────────────

interface Requirements {
  andSigs: string[];
  notSigs: string[];
}

/**
 * Extract simple signal requirements from a subtree (without enumerating paths).
 * Returns {andSigs, notSigs} representing what must hold for the subtree to be true.
 * For OR subtrees, returns empty (can't statically require one branch).
 */
function extractRequirements(node: ASTNode): Requirements {
  switch (node.type) {
    case 'Operand':
      return { andSigs: [node.name], notSigs: [] };

    case 'Literal':
      return { andSigs: [], notSigs: [] };

    case 'UnaryOp':
      if (node.op === 'NOT') {
        const child = node.operand;
        if (child.type === 'Operand') return { andSigs: [], notSigs: [child.name] };
        return { andSigs: [], notSigs: [] };
      }
      if (node.op === 'EDGE') {
        const child = node.operand;
        if (child.type === 'Operand') return { andSigs: [`^${child.name}`], notSigs: [] };
        return { andSigs: [], notSigs: [] };
      }
      return { andSigs: [], notSigs: [] };

    case 'BinaryOp':
      if (node.op === 'AND') {
        const lr = extractRequirements(node.left);
        const rr = extractRequirements(node.right);
        return {
          andSigs: [...lr.andSigs, ...rr.andSigs],
          notSigs: [...lr.notSigs, ...rr.notSigs],
        };
      }
      // OR/XOR: cannot statically require one branch
      return { andSigs: [], notSigs: [] };
  }
}

// ─── Protection element filter ────────────────────────────────────────────────

/**
 * Returns true if the signal name looks like a primary protection element
 * (i.e., something the analog renderer knows how to inject for).
 * Supervisor signals (52A, RxWI, IN*, SV*, LT*) return false.
 */
function isProtectionElement(name: string): boolean {
  const u = name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^(51P|51G|51N|50P|50G|50N|21P|21G|21N|87L|87T|67P|67G|79|SEF|Z1P|Z1G|Z2P|Z2G|POTT|PUTT|REF|SOTF)/.test(u);
}

// ─── Path enumeration ─────────────────────────────────────────────────────────

/**
 * Recursively enumerate all paths that can independently set the expression = 1.
 */
function collectPaths(
  node: ASTNode,
  andRequired: string[],
  notRequired: string[],
): TripPath[] {
  switch (node.type) {
    case 'Literal':
      return []; // Constants don't generate testable paths

    case 'Operand':
      return [{
        leafElement: node.name,
        andConditions: [...andRequired],
        notConditions: [...notRequired],
        isEdge: false,
      }];

    case 'UnaryOp': {
      if (node.op === 'NOT') return []; // NOT cannot be a positive trip source
      if (node.op === 'EDGE') {
        const child = node.operand;
        if (child.type === 'Operand') {
          return [{
            leafElement: child.name,
            andConditions: [...andRequired],
            notConditions: [...notRequired],
            isEdge: true,
          }];
        }
        return collectPaths(child, andRequired, notRequired);
      }
      return [];
    }

    case 'BinaryOp': {
      if (node.op === 'OR') {
        // Each OR branch is an independent trip path
        return [
          ...collectPaths(node.left, andRequired, notRequired),
          ...collectPaths(node.right, andRequired, notRequired),
        ];
      }

      if (node.op === 'AND') {
        // Paths from LEFT: RIGHT provides AND/NOT requirements
        const rightReqs = extractRequirements(node.right);
        const leftPaths = collectPaths(
          node.left,
          [...andRequired, ...rightReqs.andSigs],
          [...notRequired, ...rightReqs.notSigs],
        );

        // Paths from RIGHT: LEFT provides AND/NOT requirements
        const leftReqs = extractRequirements(node.left);
        const rightPaths = collectPaths(
          node.right,
          [...andRequired, ...leftReqs.andSigs],
          [...notRequired, ...leftReqs.notSigs],
        );

        return [...leftPaths, ...rightPaths];
      }

      // XOR: treat each side as OR (independent paths)
      return [
        ...collectPaths(node.left, andRequired, notRequired),
        ...collectPaths(node.right, andRequired, notRequired),
      ];
    }
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enumerate all independent trip paths through a trip equation AST.
 *
 * Returns one TripPath per unique protection element leaf, filtered to only
 * include signals that the analog renderer can inject fault quantities for.
 * Supervisor signals (52A, RxWI, etc.) appear as andConditions, not as paths.
 *
 * De-duplicates: if the same leaf element appears via multiple OR branches,
 * keeps the path with the fewest total conditions (simplest test setup).
 */
export function enumerateTripPaths(ast: ASTNode): TripPath[] {
  const raw = collectPaths(ast, [], []);

  // Filter: only keep paths where the leaf is a recognisable protection element
  const filtered = raw.filter(p => isProtectionElement(p.leafElement));

  // De-duplicate by leafElement (keep fewest conditions)
  const seen = new Map<string, TripPath>();
  for (const path of filtered) {
    const key = path.leafElement;
    if (!seen.has(key)) {
      seen.set(key, path);
    } else {
      const existing = seen.get(key)!;
      const existTotal = existing.andConditions.length + existing.notConditions.length;
      const newTotal   = path.andConditions.length + path.notConditions.length;
      if (newTotal < existTotal) seen.set(key, path);
    }
  }

  return Array.from(seen.values());
}

/**
 * Build the full list of inhibit conditions for a set of trip paths.
 *
 * For each TripPath:
 *   - One InhibitCondition per notCondition (signal=HIGH blocks trip)
 *   - One InhibitCondition per andCondition (signal=LOW blocks trip — missing supervisor)
 *
 * De-duplicates by (signal, leafElement) to avoid redundant inhibit scripts.
 */
export function buildInhibitConditions(paths: TripPath[]): InhibitCondition[] {
  const seen = new Set<string>();
  const result: InhibitCondition[] = [];

  for (const path of paths) {
    // NOT conditions: asserting the signal blocks the trip
    for (const sig of path.notConditions) {
      const key = `${path.leafElement}|NOT|${sig}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          signal: sig,
          blockType: 'NOT',
          leafElement: path.leafElement,
          otherAndConditions: path.andConditions,
          otherNotConditions: path.notConditions.filter(s => s !== sig),
        });
      }
    }

    // AND conditions: de-asserting the supervisor blocks the trip
    for (const sig of path.andConditions) {
      // Strip ^ prefix for edge-triggered supervisors
      const cleanSig = sig.startsWith('^') ? sig.slice(1) : sig;
      const key = `${path.leafElement}|AND|${cleanSig}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          signal: cleanSig,
          blockType: 'AND',
          leafElement: path.leafElement,
          otherAndConditions: path.andConditions.filter(s => s !== sig),
          otherNotConditions: path.notConditions,
        });
      }
    }
  }

  return result;
}
