// A deliberately small JSON-schema subset validator for tool-call arguments.
// Small local models regularly emit "0.87" for a number, extra keys, or a
// missing field; we coerce what is safely coercible and reject the rest with
// an error message the model can act on.

export type JsonType = 'string' | 'integer' | 'number' | 'boolean';

export interface PropSchema {
  type: JsonType;
  description?: string;
  enum?: readonly string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
}

export interface ObjectSchema {
  type: 'object';
  properties: Record<string, PropSchema>;
  required: readonly string[];
}

export type ValidationResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export function validateArgs(schema: ObjectSchema, raw: unknown): ValidationResult {
  let input = raw;
  if (typeof input === 'string') {
    const s = input.trim();
    if (s === '') input = {};
    else {
      try {
        input = JSON.parse(s);
      } catch {
        return { ok: false, error: `arguments are not valid JSON: ${JSON.stringify(s.slice(0, 80))}` };
      }
    }
  }
  if (input === undefined || input === null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'arguments must be a JSON object' };
  }
  const obj = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const problems: string[] = [];

  for (const [key, ps] of Object.entries(schema.properties)) {
    let v = obj[key];
    if (v === undefined || v === null || v === '') {
      if (schema.required.includes(key)) problems.push(`missing required "${key}" (${describe(ps)})`);
      continue;
    }
    switch (ps.type) {
      case 'string': {
        // Small models sometimes send a list where a multi-line string is wanted: one item per line.
        if (Array.isArray(v) && v.every(x => typeof x === 'string' || typeof x === 'number')) v = v.map(String).join('\n');
        if (typeof v === 'number' || typeof v === 'boolean') v = String(v);
        if (typeof v !== 'string') { problems.push(`"${key}" must be a string`); break; }
        const s = v.trim();
        if (ps.enum && !ps.enum.includes(s)) {
          const hit = ps.enum.find(e => e.toLowerCase() === s.toLowerCase());
          if (hit) { out[key] = hit; break; }
          problems.push(`"${key}" must be one of ${ps.enum.join('|')}`);
          break;
        }
        if (ps.minLength !== undefined && s.length < ps.minLength) { problems.push(`"${key}" is too short (${s.length} characters, minimum ${ps.minLength}); rewrite it longer, as complete sentences with concrete facts`); break; }
        if (ps.maxLength !== undefined && s.length > ps.maxLength) { out[key] = s.slice(0, ps.maxLength); break; }
        if (ps.pattern && !new RegExp(ps.pattern).test(s)) { problems.push(`"${key}" must match ${ps.pattern}`); break; }
        out[key] = s;
        break;
      }
      case 'integer':
      case 'number': {
        const n = typeof v === 'string' ? Number(v.trim()) : v;
        if (typeof n !== 'number' || !Number.isFinite(n)) { problems.push(`"${key}" must be a number`); break; }
        if (ps.type === 'integer' && !Number.isInteger(n)) { problems.push(`"${key}" must be an integer`); break; }
        if (ps.minimum !== undefined && n < ps.minimum) { problems.push(`"${key}" is ${n}, which is below the minimum ${ps.minimum}`); break; }
        if (ps.maximum !== undefined && n > ps.maximum) { problems.push(`"${key}" is ${n}, which is above the maximum ${ps.maximum}`); break; }
        out[key] = n;
        break;
      }
      case 'boolean': {
        if (v === true || v === 'true') out[key] = true;
        else if (v === false || v === 'false') out[key] = false;
        else problems.push(`"${key}" must be true or false`);
        break;
      }
    }
  }
  if (problems.length) return { ok: false, error: problems.join('; ') };
  return { ok: true, value: out };
}

function describe(ps: PropSchema): string {
  if (ps.enum) return ps.enum.join('|');
  if (ps.type === 'number' || ps.type === 'integer') {
    const r = ps.minimum !== undefined || ps.maximum !== undefined ? ` ${ps.minimum ?? ''}..${ps.maximum ?? ''}` : '';
    return ps.type + r;
  }
  return ps.type;
}
