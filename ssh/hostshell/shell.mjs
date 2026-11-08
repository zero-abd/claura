// A small bash-like interpreter for the host shell simulator: words and quoting, $VAR, globs,
// pipes, ; && ||, redirects, and the Claura policy gate in front of every command.
import path from 'node:path';
import { BUILTIN_NAMES, COMMANDS, DENY_OPS, DENY_RO, MUTATING, denial } from './commands.mjs';

const OPS = ['&&', '||', '>>', '2>>', '2>&1', '&>', '2>', '|', ';', '>', '<', '&'];

class ParseError extends Error {}

/** Split a command line into words (with quoting info) and operators. */
export function tokenize(line) {
  const toks = [];
  let cur = null;
  const push = () => {
    if (cur) toks.push({ t: 'word', parts: cur });
    cur = null;
  };
  const add = (s, q) => {
    cur ??= [];
    cur.push({ s, q });
  };
  for (let i = 0; i < line.length; ) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t') {
      push();
      i++;
    } else if (ch === "'") {
      const j = line.indexOf("'", i + 1);
      if (j < 0) throw new ParseError("unexpected EOF while looking for matching `''");
      add(line.slice(i + 1, j), 's');
      i = j + 1;
    } else if (ch === '"') {
      let j = i + 1;
      let s = '';
      while (j < line.length && line[j] !== '"') {
        if (line[j] === '\\' && '"\\$`'.includes(line[j + 1] ?? '')) {
          s += line[j + 1];
          j += 2;
        } else s += line[j++];
      }
      if (j >= line.length) throw new ParseError('unexpected EOF while looking for matching `"\'');
      if (/\$\(|`/.test(s)) throw new ParseError('command substitution is not available in this restricted shell');
      add(s, 'd');
      i = j + 1;
    } else if (ch === '\\') {
      add(line[i + 1] ?? '', 's');
      i += 2;
    } else if (ch === '`' || (ch === '$' && line[i + 1] === '(')) {
      throw new ParseError('command substitution is not available in this restricted shell');
    } else if (ch === '#' && cur === null) {
      break;
    } else {
      const op = OPS.find((o) => line.startsWith(o, i));
      if (op && !(op === '2>' && cur)) {
        // a lone "2" glued to > is part of the operator only at the start of a word
        push();
        toks.push({ t: 'op', v: op });
        i += op.length;
      } else {
        let j = i;
        while (j < line.length && !' \t\'"\\`'.includes(line[j]) && !OPS.some((o) => line.startsWith(o, j) && !(o === '2>' && j > i)) && !(line[j] === '$' && line[j + 1] === '(')) j++;
        if (j === i) j = i + 1;
        add(line.slice(i, j), 'u');
        i = j;
      }
    }
  }
  push();
  return toks;
}

function parse(toks) {
  // list of { op, pipeline: [ { words, redirs } ] }
  const list = [];
  let pipeline = [];
  let cmd = { words: [], redirs: [] };
  let op = ';';
  const endCmd = () => {
    if (cmd.words.length || cmd.redirs.length) pipeline.push(cmd);
    else if (pipeline.length) throw new ParseError("syntax error near unexpected token `|'");
    cmd = { words: [], redirs: [] };
  };
  const endPipe = (nextOp) => {
    endCmd();
    if (pipeline.length) list.push({ op, pipeline });
    else if (nextOp !== ';') throw new ParseError(`syntax error near unexpected token \`${nextOp}'`);
    pipeline = [];
    op = nextOp;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'word') cmd.words.push(t);
    else if (t.v === '|') endCmd();
    else if (['&&', '||', ';'].includes(t.v)) endPipe(t.v);
    else if (t.v === '&') throw new ParseError('background jobs are not available in this restricted shell');
    else if (t.v === '2>&1') cmd.redirs.push({ type: '2>&1' });
    else {
      const target = toks[i + 1];
      if (!target || target.t !== 'word') throw new ParseError("syntax error near unexpected token `newline'");
      cmd.redirs.push({ type: t.v, target });
      i++;
    }
  }
  endPipe(';');
  return list;
}

export class Shell {
  /**
   * @param {object} o
   * @param {object} o.world  simulated machine
   * @param {object} o.fs     Vfs
   * @param {'forensic'|'ops'} o.mode
   * @param {() => number} o.cols
   * @param {(rec: object) => void} o.audit
   */
  constructor({ world, fs, mode, cols, audit, now }) {
    this.w = world;
    this.fs = fs;
    this.mode = mode;
    this.colsFn = cols;
    this.auditFn = audit ?? (() => {});
    this.nowFn = now ?? Date.now;
    this.cwd = fs.home;
    this.history = [];
    this.last = 0;
    this.env = {
      USER: world.user, LOGNAME: world.user, HOME: fs.home, SHELL: '/usr/local/bin/claura-shell', HOSTNAME: world.hostname,
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', LANG: 'en_US.UTF-8', TERM: process.env.TERM || 'xterm-256color',
      PWD: this.cwd, SSH_TTY: world.session.tty ? `/dev/${world.session.tty}` : '/dev/pts/0',
    };
    this.vars = {};
  }

  prompt() {
    const home = this.fs.home;
    const shown = this.cwd === home ? '~' : this.cwd.startsWith(`${home}/`) ? `~${this.cwd.slice(home.length)}` : this.cwd;
    const color = this.mode === 'forensic' ? '38;5;208' : '38;5;41';
    const tag = this.mode === 'forensic' ? ' \x1b[2m[read-only]\x1b[0m' : '';
    return `\x1b[1;${color}m${this.w.user}@${this.w.hostname}\x1b[0m:\x1b[1;34m${shown}\x1b[0m${tag}$ `;
  }

  /** Words that complete the token ending at `pos`. */
  complete(line, pos) {
    const before = line.slice(0, pos);
    const start = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t'), before.lastIndexOf('|'), before.lastIndexOf(';')) + 1;
    const word = before.slice(start);
    const first = !/\S/.test(before.slice(0, start).replace(/[|;&]/g, ''));
    const prevOp = /[|;&]\s*$/.test(before.slice(0, start));
    let matches = [];
    if ((first || prevOp) && !word.includes('/')) {
      const names = new Set([...Object.keys(COMMANDS), ...BUILTIN_NAMES]);
      matches = [...names].filter((n) => n.startsWith(word) && !['[', '.'].includes(n)).sort();
    } else {
      const slash = word.lastIndexOf('/');
      const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
      const base = word.slice(slash + 1);
      const dir = this.fs.resolve(dirPart || '.', this.cwd);
      if (this.fs.stat(dir)?.type === 'd') {
        matches = this.fs.list(dir)
          .filter((n) => n.startsWith(base) && (base.startsWith('.') || !n.startsWith('.')))
          .map((n) => `${dirPart}${n}${this.fs.stat(dir === '/' ? `/${n}` : `${dir}/${n}`)?.type === 'd' ? '/' : ''}`);
      }
    }
    return { start, end: pos, matches };
  }

  /**
   * Run one command line.
   * @returns {{ out: string, exit: boolean }} terminal text (with \n line ends) and whether to log out
   */
  runLine(line) {
    const text = line.trim();
    if (!text) return { out: '', exit: false };
    this.history.push(text);
    if (this.history.length > 500) this.history.shift();
    this.term = '';
    this.exit = false;
    let list;
    try {
      list = parse(tokenize(text));
    } catch (e) {
      this.term += `claura-shell: ${e.message}\n`;
      this.last = 2;
      this.audit(text, 'error', e.message);
      return { out: this.term, exit: false };
    }
    for (const item of list) {
      if (item.op === '&&' && this.last !== 0) continue;
      if (item.op === '||' && this.last === 0) continue;
      this.last = this.runPipeline(item.pipeline, text);
      if (this.exit) break;
    }
    return { out: this.term, exit: this.exit };
  }

  audit(cmd, verdict, reason) {
    this.auditFn({ ts: this.nowFn(), cmd: cmd.slice(0, 400), verdict, reason, cwd: this.cwd });
  }

  expand(word) {
    let out = '';
    let glob = false;
    for (const { s, q } of word.parts) {
      let v = s;
      if (q !== 's') {
        v = v.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*|\?)\}?/g, (_, name) => (name === '?' ? String(this.last) : (this.vars[name] ?? this.env[name] ?? '')));
        if (q === 'u' && /^~(\/|$)/.test(v) && out === '') v = this.fs.home + v.slice(1);
      }
      if (q === 'u' && /[*?[]/.test(v)) glob = true;
      out += v;
    }
    return { text: out, glob };
  }

  runPipeline(stages, rawLine) {
    let stdin = null;
    let code = 0;
    for (let i = 0; i < stages.length; i++) {
      const final = i === stages.length - 1;
      const r = this.runSimple(stages[i], stdin, final, rawLine);
      code = r.code;
      stdin = r.out;
      if (this.exit) break;
    }
    return code;
  }

  runSimple(stage, stdin, final, rawLine) {
    // words -> argv
    let argv = [];
    for (const w of stage.words) {
      const { text, glob } = this.expand(w);
      if (glob) {
        const hits = this.fs.glob(text, this.cwd);
        if (hits.length) argv.push(...hits.map((h) => (text.startsWith('/') ? h : h.replace(`${this.cwd === '/' ? '' : this.cwd}/`, ''))));
        else argv.push(text);
      } else argv.push(text);
    }
    // VAR=value prefix / pure assignments
    while (argv.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(argv[0])) {
      const [k, ...v] = argv.shift().split('=');
      this.vars[k] = v.join('=');
    }
    // redirects
    let toFile = null;
    let appendFile = false;
    let errDiscard = false;
    let errToOut = false;
    for (const r of stage.redirs) {
      if (r.type === '2>&1') {
        errToOut = true;
        continue;
      }
      const target = this.expand(r.target).text;
      if (r.type === '<') {
        const rd = this.fs.read(this.fs.resolve(target, this.cwd));
        if (!rd.ok) {
          this.term += `claura-shell: ${target}: ${rd.err}\n`;
          return { out: '', code: 1 };
        }
        stdin = rd.data;
      } else if (target === '/dev/null') {
        if (r.type.startsWith('2')) errDiscard = true;
        else toFile = '/dev/null';
      } else if (this.mode === 'forensic') {
        const msg = `claura-shell: redirect to '${target}': ${DENY_RO}`;
        this.term += `${msg}\n`;
        this.audit(rawLine, 'denied', `redirect ${r.type} ${target}`);
        return { out: '', code: 1 };
      } else if (r.type.startsWith('2')) {
        errDiscard = true;
      } else {
        toFile = this.fs.resolve(target, this.cwd);
        appendFile = r.type === '>>' || r.type === '&>';
        if (!this.fs.canWrite(toFile)) {
          this.term += `claura-shell: ${target}: ${DENY_OPS}\n`;
          this.audit(rawLine, 'denied', `redirect ${r.type} ${target}`);
          return { out: '', code: 1 };
        }
      }
    }
    if (!argv.length) return { out: '', code: 0 };

    const res = this.dispatch(argv, stdin, final && !toFile, rawLine);
    let out = res.out ?? '';
    let err = res.err ?? '';
    if (errToOut) {
      out += err;
      err = '';
    }
    if (errDiscard) err = '';
    if (err) this.term += err;
    if (toFile === '/dev/null') out = '';
    else if (toFile) {
      const e = this.fs.write(toFile, out, appendFile);
      if (e) this.term += `claura-shell: ${toFile}: ${e}\n`;
      out = '';
    }
    if (final) this.term += out;
    return { out, code: res.code ?? 0 };
  }

  dispatch(argv, stdin, finalToTerminal, rawLine) {
    let name = argv[0];
    const args = argv.slice(1);
    if (name.includes('/')) {
      const base = path.posix.basename(name);
      if (name.startsWith('./') || name.startsWith('../') || !(COMMANDS[base] || MUTATING.has(base))) {
        this.audit(rawLine, 'error', `exec ${name}`);
        return { err: `claura-shell: ${name}: ${this.fs.exists(this.fs.resolve(name, this.cwd)) ? 'Permission denied' : 'No such file or directory'}\n`, code: this.fs.exists(this.fs.resolve(name, this.cwd)) ? 126 : 127 };
      }
      name = base;
    }

    // shell builtins
    switch (name) {
      case 'exit':
      case 'logout':
        this.exit = true;
        this.term += 'logout\n';
        this.audit(rawLine, 'allowed', 'logout');
        return { code: 0 };
      case 'cd': {
        const target = args[0] ?? this.fs.home;
        const p = this.fs.resolve(target === '-' ? (this.env.OLDPWD ?? this.cwd) : target, this.cwd);
        const n = this.fs.stat(p);
        if (!n) return { err: `claura-shell: cd: ${target}: No such file or directory\n`, code: 1 };
        if (n.type !== 'd') return { err: `claura-shell: cd: ${target}: Not a directory\n`, code: 1 };
        this.env.OLDPWD = this.cwd;
        this.cwd = p;
        this.env.PWD = p;
        return { code: 0 };
      }
      case 'pwd':
        return { out: `${this.cwd}\n`, code: 0 };
      case 'export': {
        for (const a of args) {
          const [k, ...v] = a.split('=');
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) && v.length) this.env[k] = v.join('=');
        }
        return { code: 0 };
      }
      case 'unset':
        args.forEach((k) => { delete this.vars[k]; });
        return { code: 0 };
      case 'alias':
      case 'set':
      case 'umask':
      case 'ulimit':
        return { code: 0 };
      case 'command':
        if (args[0] === '-v') return { out: args[1] && (COMMANDS[args[1]] || BUILTIN_NAMES.has(args[1])) ? `${args[1]}\n` : '', code: COMMANDS[args[1]] ? 0 : 1 };
        return this.dispatch(args, stdin, finalToTerminal, rawLine);
      case 'test':
      case '[': {
        const a = args.filter((x) => x !== ']');
        let r = false;
        if (a[0] === '-e' || a[0] === '-f' || a[0] === '-d') {
          const n = this.fs.stat(this.fs.resolve(a[1] ?? '', this.cwd));
          r = !!n && (a[0] === '-e' || (a[0] === '-f' && n.type === 'f') || (a[0] === '-d' && n.type === 'd'));
        } else if (a.length === 3 && a[1] === '=') r = a[0] === a[2];
        else if (a.length === 3 && a[1] === '!=') r = a[0] !== a[2];
        return { code: r ? 0 : 1 };
      }
      default:
    }

    // policy gate
    const ops = this.mode === 'ops';
    if (MUTATING.has(name)) {
      if (ops && ['touch', 'mkdir', 'rm'].includes(name)) return this.opsFileOp(name, args, rawLine);
      this.audit(rawLine, 'denied', `${name}: mutating command`);
      return { err: `${denial(this, name)}\n`, code: 126 };
    }
    const fn = COMMANDS[name];
    if (!fn) {
      this.audit(rawLine, 'error', `not found: ${name}`);
      return { err: `claura-shell: ${name}: command not found\n`, code: 127 };
    }
    const ctx = { w: this.w, fs: this.fs, sh: this, mode: this.mode, cols: this.colsFn(), tty: finalToTerminal, now: this.nowFn() };
    let res;
    try {
      res = fn(ctx, args, stdin);
    } catch (e) {
      res = { err: `${name}: internal error: ${e.message}\n`, code: 70 };
    }
    const denied = typeof res.err === 'string' && (res.err.includes(DENY_RO) || res.err.includes(DENY_OPS));
    this.audit(rawLine, denied ? 'denied' : 'allowed', denied ? res.err.trim().slice(0, 160) : undefined);
    return res;
  }

  /** Operator mode: touch/mkdir/rm only inside the scratch areas. */
  opsFileOp(name, args, rawLine) {
    const targets = args.filter((a) => !a.startsWith('-'));
    let err = '';
    for (const t of targets) {
      const p = this.fs.resolve(t, this.cwd);
      if (!this.fs.canWrite(p)) {
        err += `${name}: cannot ${name === 'rm' ? 'remove' : name === 'mkdir' ? 'create directory' : 'touch'} '${t}': ${DENY_OPS}\n`;
        continue;
      }
      const e = name === 'touch' ? (this.fs.exists(p) ? null : this.fs.write(p, '')) : name === 'mkdir' ? this.fs.mkdir(p) : this.fs.remove(p);
      if (e) err += `${name}: cannot ${name === 'rm' ? 'remove' : name === 'mkdir' ? 'create directory' : 'touch'} '${t}': ${e}\n`;
    }
    this.audit(rawLine, err.includes('Claura policy') ? 'denied' : 'allowed', err.trim().slice(0, 160) || undefined);
    return { err, code: err ? 1 : 0 };
  }
}
