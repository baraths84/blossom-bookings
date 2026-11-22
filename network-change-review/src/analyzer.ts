import * as ts from "typescript";
import { editorFlows, EvidenceStep, RequestSite, unwrap, widenedRequests } from "./exposure";

export interface RequestPart {
  kind: "literal" | "expression" | "unknown" | "omitted";
  text: string;
  key: string;
}

export interface FetchCall {
  destination: RequestPart;
  method: RequestPart;
  body: RequestPart;
  line: number;
  character: number;
  exposure?: EvidenceStep[];
}

export const isSourceFile = (name: string) => /\.(?:[cm]?[jt]s|[jt]sx)$/i.test(name);

const printer = ts.createPrinter({ removeComments: true });

// Compare syntax tokens so comments, indentation and quote style don't create findings.
function tokens(node: ts.Node, source: ts.SourceFile): unknown {
  if (ts.isStringLiteralLike(node)) return ["string", node.text];
  const children = node.getChildren(source);
  if (children.length) return [node.kind, ...children.map(child => tokens(child, source))];
  return [node.kind, node.getText(source)];
}

function part(expression: ts.Expression, source: ts.SourceFile): RequestPart {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) return { kind: "literal", key: node.text, text: node.text };
  return {
    kind: "expression",
    key: JSON.stringify(tokens(node, source)),
    text: printer.printNode(ts.EmitHint.Expression, node, source)
  };
}

function unknown(text: string, key = text): RequestPart {
  return { kind: "unknown", text, key };
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text;
  return undefined;
}

function optionsFields(options: ts.Expression | undefined, source: ts.SourceFile) {
  const fields: { method?: RequestPart; body?: RequestPart; bodyNode?: ts.Expression } = {};
  if (!options) return fields;
  const node = unwrap(options);
  if (!ts.isObjectLiteralExpression(node)) {
    const value = part(node, source);
    const unresolved = unknown(`From options (${value.text})`, value.key);
    return { method: unresolved, body: unresolved, bodyNode: undefined };
  }
  // Later object properties override earlier properties, including spreads.
  for (const property of node.properties) {
    const name = property.name && propertyName(property.name);
    if (name === undefined) {
      const unresolved = unknown(`From ${property.getText(source)}`, JSON.stringify(tokens(property, source)));
      fields.method = fields.body = unresolved;
      fields.bodyNode = undefined;
    } else if (name === "method" || name === "body") {
      const expression = ts.isPropertyAssignment(property) ? property.initializer :
        ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
      fields[name] = expression ? part(expression, source) : unknown(`Computed ${name}`, JSON.stringify(tokens(property, source)));
      if (name === "body") fields.bodyNode = expression;
    }
  }
  return fields;
}

function describeCall(call: ts.CallExpression, callee: ts.Identifier, source: ts.SourceFile): RequestSite {
  const input = call.arguments[0];
  const destination = input ? part(input, source) : unknown("Missing argument");
  const options = optionsFields(call.arguments[1], source);
  const literalInput = destination.kind === "literal";
  let method = options.method ?? (literalInput
    ? { kind: "literal" as const, text: "GET", key: "GET" }
    : unknown("input or default"));
  if (method.kind === "literal" && /^(delete|get|head|options|post|put)$/i.test(method.text)) {
    method = { ...method, text: method.text.toUpperCase(), key: method.text.toUpperCase() };
  }
  const body = options.body ?? (literalInput
    ? { kind: "omitted" as const, text: "No request body specified", key: "" }
    : unknown("No explicit body; input may supply one"));
  const position = source.getLineAndCharacterOfPosition(callee.getStart(source));
  return { node: call, body: options.bodyNode, call: { destination, method, body, ...position } };
}

function scan(fileName: string, text: string) {
  if (!text) return { calls: [], flows: [] };
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.Latest, jsx: ts.JsxEmit.Preserve, allowJs: true,
    noLib: true, noResolve: true, types: [], moduleDetection: ts.ModuleDetectionKind.Force
  };
  const source = ts.createSourceFile(fileName, text, options.target!, true);
  // Bind only this file. An unresolved identifier named fetch represents the global.
  const host: ts.CompilerHost = {
    getSourceFile: name => name === fileName ? source : undefined,
    fileExists: name => name === fileName, readFile: name => name === fileName ? text : undefined,
    getDefaultLibFileName: () => "", writeFile: () => {}, getCurrentDirectory: () => "",
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => "\n"
  };
  const program = ts.createProgram([fileName], options, host);
  const error = program.getSyntacticDiagnostics(source)[0];
  if (error) {
    const line = source.getLineAndCharacterOfPosition(error.start ?? 0).line + 1;
    throw new Error(`Line ${line}: ${ts.flattenDiagnosticMessageText(error.messageText, " ")}`);
  }
  const checker = program.getTypeChecker();
  const sites: RequestSite[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      if (ts.isIdentifier(callee) && callee.text === "fetch" && !checker.getSymbolAtLocation(callee)) {
        sites.push(describeCall(node, callee, source));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { calls: sites.map(site => site.call), flows: editorFlows(source, checker, sites) };
}

function signature(call: FetchCall) {
  return JSON.stringify([call.destination, call.method, call.body].map(value => [value.kind, value.key]));
}

export function addedRequests(fileName: string, before: string, after: string, previousName = fileName): FetchCall[] {
  if (before === after && fileName === previousName) return [];
  const old = new Map<string, number>();
  let baseline: ReturnType<typeof scan>;
  try {
    baseline = scan(previousName, before);
    for (const call of baseline.calls) {
      const key = signature(call);
      old.set(key, (old.get(key) ?? 0) + 1);
    }
  } catch (error) {
    throw new Error(`Could not parse HEAD. ${(error as Error).message}`);
  }
  const current = scan(fileName, after);
  const widened = widenedRequests(baseline.flows, current.flows);
  const widenedSites = new Set(widened.map(call => `${call.line}:${call.character}`));
  const added = current.calls.filter(call => {
    const key = signature(call);
    const remaining = old.get(key) ?? 0;
    if (!remaining) return !widenedSites.has(`${call.line}:${call.character}`);
    old.set(key, remaining - 1);
    return false;
  });
  return [...widened, ...added];
}
