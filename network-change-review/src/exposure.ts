import * as ts from "typescript";
import type { FetchCall } from "./analyzer";

export interface EvidenceStep {
  label: string;
  line: number;
  character: number;
  length: number;
}

export interface RequestSite {
  call: FetchCall;
  node: ts.CallExpression;
  body?: ts.Expression;
}

interface Flow {
  key: string;
  scope: "selection" | "document";
  call: FetchCall;
  steps: EvidenceStep[];
}

export function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node) || ts.isSatisfiesExpression(node)) {
    node = node.expression;
  }
  return node;
}

function enclosingFunction(node: ts.Node) {
  return ts.findAncestor(node.parent, ts.isFunctionLike);
}

function functionName(fn: ts.SignatureDeclaration | undefined): ts.DeclarationName | undefined {
  if (!fn) return;
  if (fn.name) return fn.name;
  if (ts.isVariableDeclaration(fn.parent)) return fn.parent.name;
}

function scopePath(node: ts.Node): string[] {
  const names: string[] = [];
  for (let fn = enclosingFunction(node); fn; fn = enclosingFunction(fn)) {
    names.push(functionName(fn)?.getText() ?? "(anonymous)");
  }
  return names;
}

function point(node: ts.Node, label: string): EvidenceStep {
  const position = node.getSourceFile().getLineAndCharacterOfPosition(node.getStart());
  return { label, ...position, length: node.getWidth() };
}

function member(node: ts.Expression, name: string) {
  const value = unwrap(node);
  return ts.isPropertyAccessExpression(value) && value.name.text === name ? value : undefined;
}

function vscodeImport(node: ts.Node, checker: ts.TypeChecker, expected: string) {
  const decl = checker.getSymbolAtLocation(node)?.declarations?.[0];
  if (!decl) return false;
  const statement = ts.findAncestor(decl, ts.isImportDeclaration);
  if (!statement || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== "vscode") return false;
  if (ts.isNamespaceImport(decl)) return expected === "*";
  return ts.isImportSpecifier(decl) && (decl.propertyName ?? decl.name).text === expected;
}

function immutableValue(input: ts.Expression, checker: ts.TypeChecker) {
  let value = unwrap(input);
  const seen = new Set<ts.Node>();
  while (ts.isIdentifier(value) && !seen.has(value)) {
    seen.add(value);
    const declaration = checker.getSymbolAtLocation(value)?.valueDeclaration;
    if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name) ||
      !ts.isVariableDeclarationList(declaration.parent) || !(declaration.parent.flags & ts.NodeFlags.Const) ||
      !declaration.initializer) break;
    value = unwrap(declaration.initializer);
  }
  return value;
}

function isEditor(value: ts.Expression, checker: ts.TypeChecker, writes: Set<ts.Symbol>) {
  const symbol = checker.getSymbolAtLocation(value);
  if (symbol && writes.has(symbol)) return false;
  const declaration = symbol?.valueDeclaration;
  if (declaration && ts.isParameter(declaration) && declaration.type && ts.isTypeReferenceNode(declaration.type)) {
    const name = declaration.type.typeName;
    return ts.isIdentifier(name) ? vscodeImport(name, checker, "TextEditor") :
      name.right.text === "TextEditor" && vscodeImport(name.left, checker, "*");
  }
  const active = member(value, "activeTextEditor");
  if (!active) return false;
  const window = unwrap(active.expression);
  const property = member(window, "window");
  return property ? vscodeImport(property.expression, checker, "*") : vscodeImport(window, checker, "window");
}

function editorRead(input: ts.Expression, checker: ts.TypeChecker, writes: Set<ts.Symbol>) {
  const call = immutableValue(input, checker);
  if (!ts.isCallExpression(call)) return;
  const getText = member(call.expression, "getText");
  const doc = getText && member(getText.expression, "document");
  if (!doc || !getText) return;
  const editor = immutableValue(doc.expression, checker);
  if (!isEditor(editor, checker, writes)) return;
  if (call.arguments.length === 0) return { scope: "document" as const, node: getText.name, editor };
  const selection = call.arguments.length === 1 && member(immutableValue(call.arguments[0], checker), "selection");
  if (!selection) return;
  const selectedEditor = immutableValue(selection.expression, checker);
  if (editor !== selectedEditor && !(ts.isIdentifier(editor) && ts.isIdentifier(selectedEditor) &&
    checker.getSymbolAtLocation(editor) === checker.getSymbolAtLocation(selectedEditor))) return;
  return { scope: "selection" as const, node: getText.name, editor };
}

function indexBindings(source: ts.SourceFile, checker: ts.TypeChecker) {
  const calls = new Map<ts.Symbol, ts.CallExpression[]>();
  const writes = new Set<ts.Symbol>();
  function markWrite(node: ts.Node) {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      if (symbol) writes.add(symbol);
    }
    ts.forEachChild(node, markWrite);
  }
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = unwrap(node.expression);
      const symbol = ts.isIdentifier(callee) && checker.getSymbolAtLocation(callee);
      if (symbol) {
        const sites = calls.get(symbol) ?? [];
        sites.push(node);
        calls.set(symbol, sites);
      }
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) markWrite(node.left);
    else if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) markWrite(node.operand);
    else if (ts.isForInStatement(node) || ts.isForOfStatement(node)) markWrite(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { calls, writes };
}

export function editorFlows(source: ts.SourceFile, checker: ts.TypeChecker, sites: RequestSite[]): Flow[] {
  if (!sites.length) return [];
  const { calls, writes } = indexBindings(source, checker);
  const flows: Flow[] = [];
  for (const site of sites) {
    const { call, body } = site;
    if (!body || call.method.kind !== "literal" || !["POST", "PUT", "PATCH", "DELETE"].includes(call.method.text) ||
      call.destination.kind !== "literal" || !URL.canParse(call.destination.text)) continue;
    const url = new URL(call.destination.text);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) continue;
    const collect = (input: ts.Expression, argumentIndex?: number, hop?: ts.CallExpression) => {
      const read = editorRead(input, checker, writes);
      if (!read) return;
      const steps = [point(read.node, read.scope === "document" ? "Read entire document" : "Read selection")];
      if (hop) steps.push(point(unwrap(hop.expression), `Pass text to ${unwrap(hop.expression).getText()}`));
      steps.push(point(unwrap(site.node.expression), `${call.method.text} ${call.destination.text}`));
      const key = JSON.stringify([scopePath(read.node), read.editor.getText(), scopePath(site.node),
        hop && scopePath(hop), argumentIndex, call.method.key, call.destination.key]);
      flows.push({ key, scope: read.scope, call, steps });
    };
    const value = immutableValue(body, checker);
    const symbol = ts.isIdentifier(value) && checker.getSymbolAtLocation(value);
    const parameter = symbol && symbol.valueDeclaration;
    if (!parameter || !ts.isParameter(parameter)) {
      collect(value);
      continue;
    }
    const fn = enclosingFunction(site.node);
    const name = functionName(fn);
    if (parameter.parent !== fn || !name || !ts.isIdentifier(name) || writes.has(symbol) || parameter.dotDotDotToken) continue;
    const helper = checker.getSymbolAtLocation(name);
    if (!helper || writes.has(helper)) continue;
    const index = fn.parameters.indexOf(parameter);
    const invocations = calls.get(helper) ?? [];
    const callerCounts = new Map<ts.SignatureDeclaration | undefined, number>();
    for (const hop of invocations) {
      const caller = enclosingFunction(hop);
      callerCounts.set(caller, (callerCounts.get(caller) ?? 0) + 1);
    }
    for (const hop of invocations) {
      if (callerCounts.get(enclosingFunction(hop)) !== 1) continue;
      const input = hop.arguments[index];
      if (input && !hop.arguments.slice(0, index + 1).some(ts.isSpreadElement)) collect(input, index, hop);
    }
  }
  return flows;
}

export function widenedRequests(before: Flow[], after: Flow[]): FetchCall[] {
  function groups(flows: Flow[]) {
    const map = new Map<string, Flow[]>();
    for (const flow of flows) {
      const group = map.get(flow.key) ?? [];
      group.push(flow);
      map.set(flow.key, group);
    }
    return map;
  }
  const baseline = groups(before);
  const findings: FetchCall[] = [];
  for (const [key, group] of groups(after)) {
    const prior = baseline.get(key);
    if (prior?.length === 1 && prior[0].scope === "selection" && group.length === 1 && group[0].scope === "document") {
      findings.push({ ...group[0].call, exposure: group[0].steps });
    }
  }
  return findings;
}
