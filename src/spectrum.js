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

Spectrum.prototype.runFrame = function () {
  var done = 0;
  var guard = 0;
  var t;
  this.edges = [];
  this.frameCycles = 0;
  while (done < SPECTRUM_FRAME && guard < 200000) {
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
};
