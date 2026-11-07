/**
 * Minimal XML reader for the public-data APIs (law.go.kr DRF, data.go.kr).
 * Several of them answer only in XML, and their JSON shapes are undocumented, so
 * responses are read as XML and walked generically instead of by fixed paths.
 */
export type XmlNode = { name: string; attrs: Record<string, string>; children: XmlNode[]; text: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  const token = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = token.exec(xml))) {
    const top = stack[stack.length - 1]!;
    if (m[1] !== undefined) top.text += m[1];
    else if (m[2]) {
      // close tag: pop to the matching element (tolerates stray/misnested tags)
      const idx = stack.map((n) => n.name).lastIndexOf(m[2]);
      if (idx > 0) stack.length = idx;
    } else if (m[3]) {
      const attrs: Record<string, string> = {};
      for (const a of (m[4] ?? "").matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        attrs[a[1]!] = decodeEntities(a[2] ?? a[3] ?? "");
      }
      const node: XmlNode = { name: m[3], attrs, children: [], text: "" };
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.text += decodeEntities(m[6]);
  }
  return root;
}

export const textOf = (node: XmlNode | undefined): string => (node ? node.text.trim() : "");

export function find(node: XmlNode, name: string): XmlNode | undefined {
  for (const child of node.children) {
    if (child.name === name) return child;
    const hit = find(child, name);
    if (hit) return hit;
  }
  return undefined;
}

export function findAll(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  for (const child of node.children) {
    if (child.name === name) out.push(child);
    findAll(child, name, out);
  }
  return out;
}

/** Leaf children (elements without element children) as a flat field map. */
export function fields(node: XmlNode): Record<string, string> {
  const out: Record<string, string> = {};
  for (const child of node.children) {
    if (child.children.length === 0) out[child.name] = child.text.trim();
  }
  return out;
}

/**
 * Repeated result records: elements made only of leaf fields (at least `minFields`),
 * e.g. `<law>` rows in a law.go.kr search or `<item>` rows from data.go.kr.
 */
export function records(node: XmlNode, minFields = 3): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const walk = (n: XmlNode) => {
    for (const child of n.children) {
      const leafCount = child.children.filter((c) => c.children.length === 0).length;
      if (child.children.length > 0 && leafCount === child.children.length && leafCount >= minFields) {
        out.push(fields(child));
      } else walk(child);
    }
  };
  walk(node);
  return out;
}

/** First non-empty value among candidate field names. */
export function pick(record: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]?.trim();
    if (value) return value;
  }
  return "";
}
