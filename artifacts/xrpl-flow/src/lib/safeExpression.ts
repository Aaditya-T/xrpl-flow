import jsep, { type Expression } from 'jsep';

const BINARY_OPERATORS = new Set(['==', '!=', '===', '!==', '>', '>=', '<', '<=']);
const LOGICAL_OPERATORS = new Set(['&&', '||']);

type AstNode = Expression & {
  operator?: string;
  left?: AstNode;
  right?: AstNode;
  argument?: AstNode;
  object?: AstNode;
  property?: AstNode & { name?: string };
  computed?: boolean;
  name?: string;
  value?: unknown;
};

function evaluateNode(node: AstNode, output: unknown): unknown {
  switch (node.type) {
    case 'Literal': return node.value;
    case 'Identifier':
      if (node.name !== 'output') throw new Error(`Only the "output" root is allowed; received "${node.name}".`);
      return output;
    case 'MemberExpression': {
      if (node.computed) throw new Error('Computed property access is not allowed.');
      const object = evaluateNode(node.object!, output);
      const property = node.property?.name;
      if (!property || property === '__proto__' || property === 'prototype' || property === 'constructor') {
        throw new Error('Unsafe property access is not allowed.');
      }
      if (object === null || object === undefined || typeof object !== 'object') return undefined;
      return (object as Record<string, unknown>)[property];
    }
    case 'UnaryExpression':
      if (node.operator !== '!') throw new Error(`Unary operator "${node.operator}" is not allowed.`);
      return !evaluateNode(node.argument!, output);
    case 'LogicalExpression': {
      if (!LOGICAL_OPERATORS.has(node.operator!)) throw new Error(`Logical operator "${node.operator}" is not allowed.`);
      const left = Boolean(evaluateNode(node.left!, output));
      return node.operator === '&&' ? left && Boolean(evaluateNode(node.right!, output)) : left || Boolean(evaluateNode(node.right!, output));
    }
    case 'BinaryExpression': {
      if (!BINARY_OPERATORS.has(node.operator!)) throw new Error(`Binary operator "${node.operator}" is not allowed.`);
      const left = evaluateNode(node.left!, output);
      const right = evaluateNode(node.right!, output);
      switch (node.operator) {
        case '==': return left === right;
        case '!=': return left !== right;
        case '===': return left === right;
        case '!==': return left !== right;
        case '>': return (left as string | number) > (right as string | number);
        case '>=': return (left as string | number) >= (right as string | number);
        case '<': return (left as string | number) < (right as string | number);
        case '<=': return (left as string | number) <= (right as string | number);
      }
      return false;
    }
    default:
      throw new Error(`Expression feature "${node.type}" is not allowed.`);
  }
}

export function evaluateSafeExpression(expression: string, output: unknown): boolean {
  if (!expression.trim()) throw new Error('Expression cannot be empty.');
  let ast: AstNode;
  try {
    ast = jsep(expression) as AstNode;
  } catch (error) {
    throw new Error(`Invalid expression: ${error instanceof Error ? error.message : String(error)}`);
  }
  return Boolean(evaluateNode(ast, output));
}
