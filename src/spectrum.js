// ZX Spectrum 48K: 16K ROM, 48K RAM, screen, border, keyboard matrix, beeper.
// One frame is 69888 T-states. Contention is not modelled.
var spectrumPalette = [
  [0, 0, 0],
  [0, 0, 215],
  [215, 0, 0],
  [215, 0, 215],
  [0, 215, 0],
  [0, 215, 215],
  [215, 215, 0],
  [215, 215, 215],
  [0, 0, 0],
  [0, 0, 255],
  [255, 0, 0],
  [255, 0, 255],
  [0, 255, 0],
  [0, 255, 255],
  [255, 255, 0],
  [255, 255, 255]
];

var SPECTRUM_FRAME = 69888;

function spectrumPixAddr(x, y) {
  return 0x4000 | ((y & 0xc0) << 5) | ((y & 7) << 8) | ((y & 0x38) << 2) | (x >> 3);
}

function spectrumCellColor(mem, x, y, frame) {
  var attr = mem[0x5800 + y * 32 + x] & 255;
  var ink = attr & 7;
  var paper = (attr >> 3) & 7;
  var bright = (attr & 0x40) ? 8 : 0;
  var bits = 0;
  var row, yy, addr, b;
  ink += bright;
  paper += bright;
  if ((attr & 0x80) && (frame & 16)) {
    var swap = ink;
    ink = paper;
    paper = swap;
  }
  for (row = 0; row < 8; row++) {
    yy = y * 8 + row;
    addr = 0x4000 | ((yy & 0xc0) << 5) | ((yy & 7) << 8) | ((yy & 0x38) << 2) | x;
    b = mem[addr] & 255;
    while (b) {
      bits += b & 1;
      b >>= 1;
    }
  }
  return bits >= 32 ? ink : paper;
}

function spectrumEncode(bytes) {
  var T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = "";
  var i = 0;
  var len = bytes.length;
  var n, a, b;
  while (i + 2 < len) {
    n = ((bytes[i] & 255) << 16) | ((bytes[i + 1] & 255) << 8) | (bytes[i + 2] & 255);
    out += T.charAt((n >> 18) & 63);
    out += T.charAt((n >> 12) & 63);
    out += T.charAt((n >> 6) & 63);
    out += T.charAt(n & 63);
    i += 3;
  }
  if (i < len) {
    a = bytes[i] & 255;
    b = (i + 1 < len) ? (bytes[i + 1] & 255) : 0;
    n = (a << 16) | (b << 8);
    out += T.charAt((n >> 18) & 63);
    out += T.charAt((n >> 12) & 63);
    out += (i + 1 < len) ? T.charAt((n >> 6) & 63) : "=";
    out += "=";
  }
  return out;
}

function spectrumDecode(s) {
  var T = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var out = [];
  var i, c, v = 0, n = 0;
  for (i = 0; i < s.length; i++) {
    c = T.indexOf(s.charAt(i));
    if (c < 0) continue;
    v = (v << 6) | c;
    n += 6;
    if (n >= 8) {
      n -= 8;
      out.push((v >> n) & 255);
      v &= (1 << n) - 1;
      if (n === 0) v = 0;
    }
  }
  return out;
}

function Spectrum(rom) {
  var self = this;
  var i;
  this.mem = new Array(65536);
  for (i = 0; i < 65536; i++) this.mem[i] = 0;
  if (rom) {
    for (i = 0; i < rom.length && i < 65536; i++) this.mem[i] = rom[i] & 255;
  }
  this.border = 7;
  this.speaker = 0;
  this.keys = [0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f, 0x1f];
  this.frame = 0;
  this.edges = [];
  this.frameCycles = 0;
  this.ear = 1;
  this.tape = null;
  this.tapePos = 0;
  this.cpu = Z80({
    mem_read: function (addr) { return self.mem[addr & 65535] & 255; },
    mem_write: function (addr, value) {
      addr &= 65535;
      if (addr >= 0x4000) self.mem[addr] = value & 255;
    },
    io_read: function (port) { return self.ioRead(port); },
    io_write: function (port, value) { self.ioWrite(port, value); }
  });
  this.cpu.reset();
}

// Rows, bit 0 first: shift/z, a, q, 1, 0, p, enter, space.
Spectrum.prototype.setKey = function (row, bit, down) {
  if (down) this.keys[row] &= ~(1 << bit) & 0x1f;
  else this.keys[row] = (this.keys[row] | (1 << bit)) & 0x1f;
  this.keys[row] |= 0;
  if ((this.keys[row] & ~0x1f) !== 0) this.keys[row] &= 0x1f;
};

Spectrum.prototype.ioRead = function (port) {
  var value = 0x1f;
  var hi, row;
  if ((port & 0xff) === 0xfe) {
    hi = (port >> 8) & 255;
    for (row = 0; row < 8; row++) {
      if ((hi & (1 << row)) === 0) value &= this.keys[row];
    }
    return (value & 0x1f) | 0xa0 | (this.ear ? 0x40 : 0);
  }
  return 0xff;
};

Spectrum.prototype.ioWrite = function (port, value) {
  var speaker;
  if ((port & 0xff) === 0xfe) {
    this.border = value & 7;
    speaker = (value >> 4) & 1;
    if (speaker !== this.speaker) {
      this.speaker = speaker;
      this.edges.push(this.frameCycles);
    }
  }
};

// Physical keys, in Spectrum matrix order. Caps Shift is Shift, Symbol Shift is Ctrl.
// Arrows follow the page's O, P, Q and A keys.
var spectrumKeyRows = {
  ShiftLeft: [0, 0], ShiftRight: [0, 0],
  KeyZ: [0, 1], KeyX: [0, 2], KeyC: [0, 3], KeyV: [0, 4],
  KeyA: [1, 0], KeyS: [1, 1], KeyD: [1, 2], KeyF: [1, 3], KeyG: [1, 4],
  KeyQ: [2, 0], KeyW: [2, 1], KeyE: [2, 2], KeyR: [2, 3], KeyT: [2, 4],
  Digit1: [3, 0], Digit2: [3, 1], Digit3: [3, 2], Digit4: [3, 3], Digit5: [3, 4],
  Numpad1: [3, 0], Numpad2: [3, 1], Numpad3: [3, 2], Numpad4: [3, 3], Numpad5: [3, 4],
  Digit0: [4, 0], Digit9: [4, 1], Digit8: [4, 2], Digit7: [4, 3], Digit6: [4, 4],
  Numpad0: [4, 0], Numpad9: [4, 1], Numpad8: [4, 2], Numpad7: [4, 3], Numpad6: [4, 4],
  KeyP: [5, 0], KeyO: [5, 1], KeyI: [5, 2], KeyU: [5, 3], KeyY: [5, 4],
  Enter: [6, 0], NumpadEnter: [6, 0], KeyL: [6, 1], KeyK: [6, 2], KeyJ: [6, 3], KeyH: [6, 4],
  Space: [7, 0], ControlLeft: [7, 1], ControlRight: [7, 1],
  KeyM: [7, 2], KeyN: [7, 3], KeyB: [7, 4],
  ArrowLeft: [5, 1], ArrowRight: [5, 0], ArrowUp: [2, 0], ArrowDown: [1, 0],
  " ": [7, 0],
  "1": [3, 0], "2": [3, 1], "3": [3, 2], "4": [3, 3], "5": [3, 4],
  "0": [4, 0], "9": [4, 1], "8": [4, 2], "7": [4, 3], "6": [4, 4],
  o: [5, 1], O: [5, 1], p: [5, 0], P: [5, 0],
  q: [2, 0], Q: [2, 0], a: [1, 0], A: [1, 0], h: [6, 4], H: [6, 4],
  z: [0, 1], Z: [0, 1], x: [0, 2], X: [0, 2], c: [0, 3], C: [0, 3], v: [0, 4], V: [0, 4],
  s: [1, 1], S: [1, 1], d: [1, 2], D: [1, 2], f: [1, 3], F: [1, 3], g: [1, 4], G: [1, 4],
  w: [2, 1], W: [2, 1], e: [2, 2], E: [2, 2], r: [2, 3], R: [2, 3], t: [2, 4], T: [2, 4],
  i: [5, 2], I: [5, 2], u: [5, 3], U: [5, 3], y: [5, 4], Y: [5, 4],
  l: [6, 1], L: [6, 1], k: [6, 2], K: [6, 2], j: [6, 3], J: [6, 3],
  m: [7, 2], M: [7, 2], n: [7, 3], N: [7, 3], b: [7, 4], B: [7, 4]
};

function spectrumKey(code) {
  var hit = spectrumKeyRows[code];
  if (!hit) return null;
  return [hit[0], hit[1]];
}

// Find a block with this flag. Look ahead of the tape position first, then
// back to the start, so any part can be chosen. The position then moves past
// the match, which keeps several blocks that share a flag in order.
Spectrum.prototype.findTapeBlock = function (flag) {
  var i, n;
  if (!this.tape) return -1;
  n = this.tape.length;
  for (i = this.tapePos; i < n; i++) if (this.tape[i].flag === flag) return i;
  for (i = 0; i < this.tapePos && i < n; i++) if (this.tape[i].flag === flag) return i;
  return -1;
};

// The Sinclair loader never sees ear edges. At the two ROM entries a tape uses,
// copy the matching block and return as the ROM would.
// 0x0556 is LD-BYTES. The flag is in A, and 0x053F returns to the caller.
// 0x0562 is inside that routine, after the preamble. Laser Squad jumps here
// with the flag already in A' and its own return address already stacked.
Spectrum.prototype.serviceTape = function () {
  var st, primed, flag, load, len, index, block, i, at, same, sp, ret;
  if (!this.tape || !this.tape.length) return false;
  st = this.cpu.getState();
  primed = st.pc === 0x0562;
  if (st.pc !== 0x0556 && !primed) return false;
  flag = (primed ? st.a_prime : st.a) & 255;
  load = (primed ? st.flags_prime.C : st.flags.C) ? 1 : 0;
  len = (st.e & 255) | ((st.d & 255) << 8);
  index = this.findTapeBlock(flag);
  block = index < 0 ? null : this.tape[index];
  same = block && block.data.length === len;
  if (same && load) {
    for (i = 0; i < len; i++) {
      at = (st.ix + i) & 65535;
      if (at >= 0x4000) this.mem[at] = block.data[i] & 255;
    }
  } else if (same && !load) {
    for (i = 0; i < len; i++) {
      at = (st.ix + i) & 65535;
      if ((this.mem[at] & 255) !== (block.data[i] & 255)) same = false;
    }
  }
  if (same) {
    this.tapePos = index + 1;
    st.ix = (st.ix + len) & 65535;
    st.d = 0;
    st.e = 0;
    st.a = 0;
  }
  st.flags.C = same ? 1 : 0;
  st.flags.N = 1;
  st.flags.Z = 0;
  if (primed) {
    sp = st.sp & 65535;
    ret = this.mem[sp] | (this.mem[(sp + 1) & 65535] << 8);
    st.sp = (sp + 2) & 65535;
    st.pc = ret & 65535;
  } else {
    st.pc = 0x053f;
  }
  st.halted = false;
  this.cpu.setState(st);
  return true;
};

Spectrum.prototype.runFrame = function () {
  var done = 0;
  var guard = 0;
  var t;
  this.edges = [];
  this.frameCycles = 0;
  while (done < SPECTRUM_FRAME && guard < 200000) {
    if (this.serviceTape()) {
      done += 4;
      this.frameCycles += 4;
      guard++;
      continue;
    }
    if (this.cpu.is_halted()) {
      done = SPECTRUM_FRAME;
      break;
    }
    t = this.cpu.run_instruction();
    if (!t || t < 1) t = 4;
    done += t;
    this.frameCycles += t;
    guard++;
  }
  this.cpu.interrupt(false, 0xff);
  this.frame++;
};

Spectrum.prototype.releaseKeys = function () {
  var i;
  for (i = 0; i < 8; i++) this.keys[i] = 0x1f;
};

Spectrum.prototype.snapshot = function () {
  return {
    mem: spectrumEncode(this.mem),
    state: this.cpu.getState(),
    border: this.border,
    speaker: this.speaker,
    keys: this.keys.slice(0),
    frame: this.frame
  };
};

Spectrum.prototype.restore = function (snap) {
  var bytes = spectrumDecode(snap.mem);
  var i;
  if (bytes.length < 65536) throw new Error("snapshot is short");
  for (i = 0; i < 65536; i++) this.mem[i] = bytes[i] & 255;
  this.cpu.setState(snap.state);
  this.border = snap.border & 7;
  this.speaker = snap.speaker & 1;
  this.frame = snap.frame || 0;
  if (snap.keys && snap.keys.length === 8) {
    for (i = 0; i < 8; i++) this.keys[i] = snap.keys[i] & 0x1f;
  } else {
    this.releaseKeys();
  }
  this.tape = null;
  this.tapePos = 0;
};
