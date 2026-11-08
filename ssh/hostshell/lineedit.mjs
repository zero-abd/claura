// Line editor for the host shell simulator: runs on a raw-mode terminal, so it has to do its own
// echo, backspace, cursor movement, history and Tab completion (what readline does in real shells).
const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const visibleLen = (s) => s.replace(ANSI, '').length;

export class LineEditor {
  /**
   * @param {object} o
   * @param {(s: string) => void} o.write
   * @param {() => number} o.cols
   * @param {() => string} o.prompt
   * @param {() => string[]} o.history
   * @param {(line: string) => void} o.onLine
   * @param {() => void} o.onEof
   * @param {(line: string, pos: number) => {start:number,end:number,matches:string[]}} o.complete
   */
  constructor(o) {
    Object.assign(this, o);
    this.buf = '';
    this.pos = 0;
    this.histIdx = -1;
    this.saved = '';
    this.promptStr = '';
    this.row = 0; // rows below the first prompt row where the cursor sits
    this.lastWasTab = false;
    this.pending = '';
  }

  start() {
    this.buf = '';
    this.pos = 0;
    this.histIdx = -1;
    this.row = 0;
    this.promptStr = this.prompt();
    this.write(this.promptStr);
  }

  /** Print a message above the prompt and redraw the line being edited. */
  notify(text) {
    this.write(`\r${this.row ? `\x1b[${this.row}A` : ''}\x1b[J${text}\r\n`);
    this.row = 0;
    this.write(this.promptStr);
    this.render(true);
  }

  render(skipClear = false) {
    const cols = Math.max(20, this.cols());
    const plen = visibleLen(this.promptStr);
    let s = '';
    if (!skipClear) s += `\r${this.row ? `\x1b[${this.row}A` : ''}`;
    else s += '\r';
    s += `\x1b[J${this.promptStr}${this.buf}`;
    const endAbs = plen + this.buf.length;
    if (endAbs > 0 && endAbs % cols === 0) s += ' \r'; // force the pending wrap so row maths stay exact
    const endRow = Math.floor(endAbs / cols);
    const tgtAbs = plen + this.pos;
    const tgtRow = Math.floor(tgtAbs / cols);
    const tgtCol = tgtAbs % cols;
    if (endRow > tgtRow) s += `\x1b[${endRow - tgtRow}A`;
    s += `\r${tgtCol ? `\x1b[${tgtCol}C` : ''}`;
    this.row = tgtRow;
    this.write(s);
  }

  insert(text) {
    const cols = Math.max(20, this.cols());
    const plen = visibleLen(this.promptStr);
    const atEnd = this.pos === this.buf.length;
    this.buf = this.buf.slice(0, this.pos) + text + this.buf.slice(this.pos);
    this.pos += text.length;
    if (atEnd && (plen + this.buf.length) % cols !== 0 && !/[^\x20-\x7e]/.test(text)) this.write(text);
    else this.render();
  }

  feed(chunk) {
    const data = this.pending + chunk;
    this.pending = '';
    for (let i = 0; i < data.length; ) {
      const ch = data[i];
      if (ch === '\x1b') {
        const rest = data.slice(i);
        let m = /^\x1b\[[0-9;?]*[ -/]*[@-~]/.exec(rest) ?? /^\x1bO[A-Za-z]/.exec(rest);
        if (!m && /^\x1b(\[[0-9;?]*)?$/.test(rest)) {
          this.pending = rest; // incomplete sequence: wait for the next chunk
          return;
        }
        if (!m) m = [ch];
        this.key(m[0]);
        i += m[0].length;
      } else {
        this.key(ch);
        i += 1;
      }
    }
  }

  key(k) {
    const wasTab = this.lastWasTab;
    this.lastWasTab = k === '\t';
    switch (k) {
      case '\r':
      case '\n': {
        this.pos = this.buf.length;
        this.render();
        this.write('\r\n');
        const line = this.buf;
        this.buf = '';
        this.pos = 0;
        this.row = 0;
        this.histIdx = -1;
        this.onLine(line);
        return;
      }
      case '\x7f':
      case '\b':
        if (this.pos > 0) {
          this.buf = this.buf.slice(0, this.pos - 1) + this.buf.slice(this.pos);
          this.pos--;
          if (this.pos === this.buf.length && this.row === 0) this.write('\b \b');
          else this.render();
        }
        return;
      case '\x1b[3~':
        if (this.pos < this.buf.length) {
          this.buf = this.buf.slice(0, this.pos) + this.buf.slice(this.pos + 1);
          this.render();
        }
        return;
      case '\x03':
        this.write('^C\r\n');
        this.buf = '';
        this.pos = 0;
        this.row = 0;
        this.start();
        return;
      case '\x04':
        if (!this.buf.length) this.onEof();
        else if (this.pos < this.buf.length) {
          this.buf = this.buf.slice(0, this.pos) + this.buf.slice(this.pos + 1);
          this.render();
        }
        return;
      case '\x0c':
        this.write('\x1b[H\x1b[2J');
        this.row = 0;
        this.write(this.promptStr);
        this.render(true);
        return;
      case '\x01':
      case '\x1b[H':
      case '\x1bOH':
      case '\x1b[1~':
        this.pos = 0;
        this.render();
        return;
      case '\x05':
      case '\x1b[F':
      case '\x1bOF':
      case '\x1b[4~':
        this.pos = this.buf.length;
        this.render();
        return;
      case '\x02':
      case '\x1b[D':
      case '\x1bOD':
        if (this.pos > 0) {
          this.pos--;
          this.render();
        }
        return;
      case '\x06':
      case '\x1b[C':
      case '\x1bOC':
        if (this.pos < this.buf.length) {
          this.pos++;
          this.render();
        }
        return;
      case '\x1b[1;5D':
      case '\x1bb': {
        let p = this.pos;
        while (p > 0 && this.buf[p - 1] === ' ') p--;
        while (p > 0 && this.buf[p - 1] !== ' ') p--;
        this.pos = p;
        this.render();
        return;
      }
      case '\x1b[1;5C':
      case '\x1bf': {
        let p = this.pos;
        while (p < this.buf.length && this.buf[p] === ' ') p++;
        while (p < this.buf.length && this.buf[p] !== ' ') p++;
        this.pos = p;
        this.render();
        return;
      }
      case '\x0b':
        this.buf = this.buf.slice(0, this.pos);
        this.render();
        return;
      case '\x15':
        this.buf = this.buf.slice(this.pos);
        this.pos = 0;
        this.render();
        return;
      case '\x17': {
        let p = this.pos;
        while (p > 0 && this.buf[p - 1] === ' ') p--;
        while (p > 0 && this.buf[p - 1] !== ' ') p--;
        this.buf = this.buf.slice(0, p) + this.buf.slice(this.pos);
        this.pos = p;
        this.render();
        return;
      }
      case '\x10':
      case '\x1b[A':
      case '\x1bOA':
        this.history_(-1);
        return;
      case '\x0e':
      case '\x1b[B':
      case '\x1bOB':
        this.history_(1);
        return;
      case '\t':
        this.tab(wasTab);
        return;
      default:
        if (k.startsWith('\x1b')) return; // unknown escape sequence: ignore
        if (k < ' ') return; // other control characters
        this.insert(k);
    }
  }

  history_(dir) {
    const h = this.history();
    if (!h.length) return;
    if (this.histIdx === -1) {
      if (dir > 0) return;
      this.saved = this.buf;
      this.histIdx = h.length;
    }
    const next = this.histIdx + dir;
    if (next < 0) return;
    if (next >= h.length) {
      this.histIdx = -1;
      this.buf = this.saved;
    } else {
      this.histIdx = next;
      this.buf = h[next];
    }
    this.pos = this.buf.length;
    this.render();
  }

  tab(second) {
    const { start, end, matches } = this.complete(this.buf, this.pos);
    if (!matches.length) {
      this.write('\x07');
      return;
    }
    const word = this.buf.slice(start, end);
    let common = matches[0];
    for (const m of matches) {
      let i = 0;
      while (i < common.length && i < m.length && common[i] === m[i]) i++;
      common = common.slice(0, i);
    }
    if (matches.length === 1) {
      const m = matches[0];
      const add = m.endsWith('/') ? m : `${m} `;
      this.buf = this.buf.slice(0, start) + add + this.buf.slice(end);
      this.pos = start + add.length;
      this.render();
    } else if (common.length > word.length) {
      this.buf = this.buf.slice(0, start) + common + this.buf.slice(end);
      this.pos = start + common.length;
      this.render();
    } else if (second) {
      const width = Math.max(...matches.map((m) => m.length)) + 2;
      const per = Math.max(1, Math.floor(Math.max(20, this.cols()) / width));
      let list = '';
      matches.forEach((m, i) => {
        list += m.padEnd(width);
        if ((i + 1) % per === 0) list += '\r\n';
      });
      this.pos = this.buf.length;
      this.render();
      this.write(`\r\n${list.trimEnd()}\r\n`);
      this.row = 0;
      this.write(this.promptStr);
      this.render(true);
    } else this.write('\x07');
  }
}
