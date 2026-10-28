// A small two-pass assembler for the Folio ROM. It covers the documented
// Z80 forms that ROM uses, not the whole instruction set.
function assemble(source) {
  var lines = source.split("\n");
  var labels = {};
  var pass = 1;
  var pc = 0;
  var rom = new Array(16384);
  var i;

  for (i = 0; i < 16384; i++) rom[i] = 0x76;

  function parseTerm(term) {
    if (!term) throw new Error("empty term");
    if (term.charAt(0) === "$") return parseInt(term.slice(1), 16);
    if (term.slice(0, 2) === "0x" || term.slice(0, 2) === "0X") return parseInt(term.slice(2), 16);
    if (/^[0-9]+$/.test(term)) return parseInt(term, 10);
    if (/^[a-z_][a-z0-9_]*$/i.test(term)) {
      if (labels[term] === undefined) {
        if (pass === 1) return 0;
        throw new Error("unknown label " + term);
      }
      return labels[term];
    }
    throw new Error("bad term " + term);
  }

  function parseExpr(expr) {
    var parts = expr.split("+");
    var n = 0;
    var p, sign, t;
    for (p = 0; p < parts.length; p++) {
      t = parts[p];
      sign = 1;
      if (t.charAt(0) === "-") {
        sign = -1;
        t = t.slice(1);
      }
      n += sign * parseTerm(t);
    }
    return n & 0xffff;
  }

  function emit(b) {
    if (pc < 0 || pc >= 16384) throw new Error("outside the 16K ROM ($" + pc.toString(16) + ")");
    if (pass === 2) rom[pc] = b & 255;
    pc = (pc + 1) & 0xffff;
  }

  function emitWord(n) {
    emit(n & 255);
    emit((n >> 8) & 255);
  }

  function emitRel(target) {
    var disp = (target - (pc + 1)) | 0;
    if (pass === 2 && (disp < -128 || disp > 127)) {
      throw new Error("relative jump is " + disp + " bytes");
    }
    emit(disp & 255);
  }

  var R8 = { b: 0, c: 1, d: 2, e: 3, h: 4, l: 5, "(hl)": 6, a: 7 };
  var R16 = { bc: 0, de: 1, hl: 2, sp: 3 };
  var RP = { bc: 0, de: 1, hl: 2, af: 3 };
  var JR = { nz: 0x20, z: 0x28, nc: 0x30, c: 0x38 };
  var JP = { nz: 0xc2, z: 0xca, nc: 0xd2, c: 0xda, po: 0xe2, pe: 0xea, p: 0xf2, m: 0xfa };
  var CALL = { nz: 0xc4, z: 0xcc, nc: 0xd4, c: 0xdc, po: 0xe4, pe: 0xec, p: 0xf4, m: 0xfc };
  var RET = { nz: 0xc0, z: 0xc8, nc: 0xd0, c: 0xd8, po: 0xe0, pe: 0xe8, p: 0xf0, m: 0xf8 };
  var ALU = { add: 0, adc: 1, sub: 2, sbc: 3, and: 4, xor: 5, or: 6, cp: 7 };

  function encodeLd(rest) {
    var comma = rest.indexOf(",");
    if (comma < 0) throw new Error("ld needs two operands");
    var dst = rest.slice(0, comma);
    var src = rest.slice(comma + 1);

    if (dst === "sp" && src === "hl") { emit(0xf9); return; }
    if (dst === "a" && src === "(bc)") { emit(0x0a); return; }
    if (dst === "a" && src === "(de)") { emit(0x1a); return; }
    if (dst === "(bc)" && src === "a") { emit(0x02); return; }
    if (dst === "(de)" && src === "a") { emit(0x12); return; }
    if (dst === "hl" && src.charAt(0) === "(") {
      emit(0x2a);
      emitWord(parseExpr(src.slice(1, -1)));
      return;
    }
    if (src === "hl" && dst.charAt(0) === "(" && dst !== "(hl)") {
      emit(0x22);
      emitWord(parseExpr(dst.slice(1, -1)));
      return;
    }
    if (R8[dst] !== undefined && R8[src] !== undefined) {
      if (dst === "(hl)" && src === "(hl)") throw new Error("that encoding is HALT");
      emit(0x40 | (R8[dst] << 3) | R8[src]);
      return;
    }
    if (dst === "a" && src.charAt(0) === "(") {
      emit(0x3a);
      emitWord(parseExpr(src.slice(1, -1)));
      return;
    }
    if (src === "a" && dst.charAt(0) === "(") {
      emit(0x32);
      emitWord(parseExpr(dst.slice(1, -1)));
      return;
    }
    if (R16[dst] !== undefined && src.charAt(0) !== "(") {
      emit([0x01, 0x11, 0x21, 0x31][R16[dst]]);
      emitWord(parseExpr(src));
      return;
    }
    if (R8[dst] !== undefined) {
      emit(0x06 | (R8[dst] << 3));
      emit(parseExpr(src) & 255);
      return;
    }
    throw new Error("unsupported ld");
  }

  function encodeAlu(op, rest) {
    var operand = rest;
    var which = ALU[op];
    if (op === "add" && rest.slice(0, 3) === "hl,") {
      var rr = rest.slice(3);
      if (R16[rr] === undefined) throw new Error("add hl needs bc, de, hl or sp");
      emit(0x09 | (R16[rr] << 4));
      return;
    }
    if (operand.slice(0, 2) === "a,") operand = operand.slice(2);
    if (R8[operand] !== undefined) {
      emit(0x80 | (which << 3) | R8[operand]);
      return;
    }
    emit(0xc6 | (which << 3));
    emit(parseExpr(operand) & 255);
  }

  function encodeLine(line) {
    var eq = line.match(/^([a-z_][a-z0-9_]*) equ (.+)$/);
    if (eq) {
      if (pass === 1) labels[eq[1]] = parseExpr(eq[2]);
      return;
    }
    if (line.slice(0, 4) === "org ") {
      pc = parseExpr(line.slice(4).replace(/ /g, ""));
      return;
    }

    var sp = line.indexOf(" ");
    var op = sp < 0 ? line : line.slice(0, sp);
    var rest = sp < 0 ? "" : line.slice(sp + 1).replace(/ /g, "");

    if (op === "db") {
      var parts = rest.split(",");
      var p;
      for (p = 0; p < parts.length; p++) emit(parseExpr(parts[p]) & 255);
      return;
    }
    if (op === "dw") {
      emitWord(parseExpr(rest));
      return;
    }
    if (op === "ld") { encodeLd(rest); return; }
    if (ALU[op] !== undefined) { encodeAlu(op, rest); return; }

    if (op === "inc" || op === "dec") {
      if (R16[rest] !== undefined) {
        emit((R16[rest] << 4) | (op === "inc" ? 0x03 : 0x0b));
        return;
      }
      if (R8[rest] === undefined) throw new Error("bad " + op);
      emit((R8[rest] << 3) | (op === "inc" ? 0x04 : 0x05));
      return;
    }
    if (op === "push" || op === "pop") {
      if (RP[rest] === undefined) throw new Error("bad " + op);
      emit((op === "push" ? 0xc5 : 0xc1) | (RP[rest] << 4));
      return;
    }
    if (op === "jr") {
      var jc = rest.indexOf(",");
      if (jc < 0) { emit(0x18); emitRel(parseExpr(rest)); }
      else {
        if (JR[rest.slice(0, jc)] === undefined) throw new Error("bad jr");
        emit(JR[rest.slice(0, jc)]);
        emitRel(parseExpr(rest.slice(jc + 1)));
      }
      return;
    }
    if (op === "jp") {
      if (rest === "(hl)") { emit(0xe9); return; }
      var pcj = rest.indexOf(",");
      if (pcj < 0) { emit(0xc3); emitWord(parseExpr(rest)); }
      else {
        if (JP[rest.slice(0, pcj)] === undefined) throw new Error("bad jp");
        emit(JP[rest.slice(0, pcj)]);
        emitWord(parseExpr(rest.slice(pcj + 1)));
      }
      return;
    }
    if (op === "call") {
      var cc = rest.indexOf(",");
      if (cc < 0) { emit(0xcd); emitWord(parseExpr(rest)); }
      else {
        if (CALL[rest.slice(0, cc)] === undefined) throw new Error("bad call");
        emit(CALL[rest.slice(0, cc)]);
        emitWord(parseExpr(rest.slice(cc + 1)));
      }
      return;
    }
    if (op === "ret") {
      if (!rest) emit(0xc9);
      else if (RET[rest] === undefined) throw new Error("bad ret");
      else emit(RET[rest]);
      return;
    }
    if (op === "djnz") { emit(0x10); emitRel(parseExpr(rest)); return; }
    if (op === "im") {
      emit(0xed);
      if (rest === "0") emit(0x46);
      else if (rest === "1") emit(0x56);
      else if (rest === "2") emit(0x5e);
      else throw new Error("bad im");
      return;
    }
    if (op === "in") {
      var inn = rest.match(/^a,\((.+)\)$/);
      if (!inn) throw new Error("only in a,(n)");
      emit(0xdb);
      emit(parseExpr(inn[1]) & 255);
      return;
    }
    if (op === "out") {
      var outn = rest.match(/^\((.+)\),a$/);
      if (!outn) throw new Error("only out (n),a");
      emit(0xd3);
      emit(parseExpr(outn[1]) & 255);
      return;
    }
    if (op === "ex") {
      if (rest === "af,af'") { emit(0x08); return; }
      if (rest === "de,hl") { emit(0xeb); return; }
      throw new Error("bad ex");
    }

    var one = {
      nop: [0x00], rlca: [0x07], rrca: [0x0f], rla: [0x17], rra: [0x1f],
      halt: [0x76], di: [0xf3], ei: [0xfb], exx: [0xd9], cpl: [0x2f],
      scf: [0x37], ccf: [0x3f], reti: [0xed, 0x4d]
    };
    if (one[op] && !rest) {
      var b;
      for (b = 0; b < one[op].length; b++) emit(one[op][b]);
      return;
    }
    throw new Error("unknown instruction");
  }

  for (pass = 1; pass <= 2; pass++) {
    pc = 0;
    for (i = 0; i < lines.length; i++) {
      var line = lines[i].split(";")[0].replace(/\s+/g, " ").trim().toLowerCase();
      if (!line) continue;
      var lab = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/);
      if (lab) {
        if (pass === 1) {
          if (labels[lab[1]] !== undefined) throw new Error("line " + (i + 1) + ": duplicate " + lab[1]);
          labels[lab[1]] = pc;
        }
        line = lab[2];
        if (!line) continue;
      }
      try {
        encodeLine(line);
      } catch (err) {
        throw new Error("line " + (i + 1) + " (" + line + "): " + err.message);
      }
    }
  }
  return rom;
}
