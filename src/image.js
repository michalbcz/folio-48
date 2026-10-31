// Load a ZX Spectrum image from a local file.
// .sna .z80 .tap .tzx .scr .rom, and a raw 16K, 48K or 64K dump.
// A snapshot is mounted on the 48K Sinclair ROM. A tape with CLEAR and
// RANDOMIZE USR is started there after that ROM has set the machine up.
// Blocks that were not placed stay on the tape. A later call to the ROM
// loader copies the next block with a matching flag.
// FOLIO, DRIFT and PIPS do not use this path. A .scr file is only the picture.

function spectrumTapeName(text) {
  var out = "";
  var i, c;
  text = String(text || "");
  for (i = 0; i < text.length && out.length < 10; i++) {
    c = text.charCodeAt(i);
    if (c >= 32 && c < 127) out += text.charAt(i);
    else out += ".";
  }
  while (out.length < 10) out += " ";
  return out;
}

function spectrumStubRom() {
  var rom = [];
  var i;
  for (i = 0; i < 16384; i++) rom.push(0xc9);
  rom[0x38] = 0xfb;
  rom[0x39] = 0xed;
  rom[0x3a] = 0x4d;
  rom[0x66] = 0xc9;
  return rom;
}

function spectrumImageFail(note) {
  return { ok: false, note: note };
}

function asImageBytes(bytes) {
  var out = [];
  var i;
  if (!bytes) return out;
  for (i = 0; i < bytes.length; i++) out.push(bytes[i] & 255);
  return out;
}

function imageWord(bytes, i) {
  return (bytes[i] & 255) | ((bytes[i + 1] & 255) << 8);
}

function imageExt(filename) {
  var name = String(filename || "").toLowerCase();
  var dot = name.lastIndexOf(".");
  if (dot < 0) return "";
  return name.slice(dot);
}

function imageBaseName(filename) {
  var name = String(filename || "IMAGE");
  var slash = name.lastIndexOf("/");
  var back = name.lastIndexOf("\\");
  var cut = slash > back ? slash : back;
  var dot;
  if (cut >= 0) name = name.slice(cut + 1);
  dot = name.lastIndexOf(".");
  if (dot > 0) name = name.slice(0, dot);
  return name || "IMAGE";
}

function blankRam() {
  var ram = [];
  var i;
  for (i = 0; i < 49152; i++) ram.push(0);
  return ram;
}

function flagByte(n) {
  n = n & 255;
  return {
    S: (n >> 7) & 1,
    Z: (n >> 6) & 1,
    Y: (n >> 5) & 1,
    H: (n >> 4) & 1,
    X: (n >> 3) & 1,
    P: (n >> 2) & 1,
    N: (n >> 1) & 1,
    C: n & 1
  };
}

function z80Regs(o) {
  function b(v) { return (v || 0) & 255; }
  function w(v) { return (v || 0) & 65535; }
  return {
    a: b(o.a), b: b(o.b), c: b(o.c), d: b(o.d), e: b(o.e), h: b(o.h), l: b(o.l),
    a_prime: b(o.ap), b_prime: b(o.bp), c_prime: b(o.cp),
    d_prime: b(o.dp), e_prime: b(o.ep), h_prime: b(o.hp), l_prime: b(o.lp),
    ix: w(o.ix), iy: w(o.iy), i: b(o.i), r: b(o.r), sp: w(o.sp), pc: w(o.pc),
    flags: flagByte(o.f || 0),
    flags_prime: flagByte(o.fp || 0),
    imode: o.im === undefined ? 1 : (o.im & 3),
    iff1: o.iff ? 1 : 0,
    iff2: o.iff ? 1 : 0,
    halted: o.halted ? true : false,
    do_delayed_di: false,
    do_delayed_ei: false,
    cycle_counter: 0
  };
}

function callsRom(ram, pc) {
  var addr, i, op, target, len;
  if (pc < 0x4000 || pc > 0xffff) return false;
  addr = pc - 0x4000;
  len = ram.length;
  for (i = 0; i < 48 && addr + i < len; i++) {
    op = ram[addr + i];
    if (op === 0xc7 || op === 0xcf || op === 0xd7 || op === 0xdf ||
        op === 0xe7 || op === 0xef || op === 0xf7 || op === 0xff) return true;
    if ((op === 0xcd || op === 0xc3) && addr + i + 2 < len) {
      target = ram[addr + i + 1] | (ram[addr + i + 2] << 8);
      if (target < 0x4000) return true;
    }
  }
  return false;
}

function z80Unpack(src, start, end, outLen, marker) {
  var out = [];
  var i = start;
  var count, value, k;
  if (end > src.length) end = src.length;
  while (i < end && out.length < outLen) {
    if (marker && src[i] === 0x00 && i + 3 < end &&
        src[i + 1] === 0xed && src[i + 2] === 0xed && src[i + 3] === 0x00) break;
    if (src[i] === 0xed && i + 1 < end && src[i + 1] === 0xed) {
      if (i + 3 >= end) break;
      count = src[i + 2];
      value = src[i + 3];
      for (k = 0; k < count && out.length < outLen; k++) out.push(value);
      i += 4;
    } else {
      out.push(src[i]);
      i++;
    }
  }
  while (out.length < outLen) out.push(0);
  return out;
}

function finishSnapshot(spec) {
  var program = spectrumTapeName(spec.program);
  var pc = spec.state.pc & 65535;
  var note = "Loaded " + program + " from " + spec.filename + ".";
  if (spec.extra) note += " " + spec.extra;
  if (pc < 0x4000 && !spec.realRom) {
    return spectrumImageFail(note + " It starts at " + pc + ", in the ROM. This load has no Sinclair ROM, so that file cannot start.");
  }
  note += " Started at " + pc + ".";
  if (callsRom(spec.ram, pc)) {
    if (spec.realRom) note += " It calls the Sinclair ROM, which is included.";
    else note += " The code there calls the Sinclair ROM, which this load does not include, so it will not get far.";
  } else {
    note += " It runs here while its code stays in RAM and does not call the Sinclair ROM.";
  }
  return {
    ok: true,
    program: program,
    blurb: spec.blurb || "Loaded from a file on this computer.",
    note: note,
    rom: null,
    ram: spec.ram,
    useRom: false,
    realRom: spec.realRom ? true : false,
    state: spec.state,
    border: spec.border & 7
  };
}

function parseSna(bytes, filename) {
  var ram, sp, pc, i, iff, border;
  if (bytes.length === 131103 || bytes.length === 147487) {
    throw new Error("This is a 128K .sna snapshot. folio-48 is a 48K machine and does not load that format. A .z80 of the paged 48K can still load.");
  }
  if (bytes.length !== 49179) {
    throw new Error("A 48K .sna file is 49179 bytes. This one is " + bytes.length + " bytes.");
  }
  ram = bytes.slice(27);
  sp = imageWord(bytes, 23);
  if (sp < 0x4000 || sp > 0xfffe) {
    throw new Error("This .sna snapshot keeps its return address at " + sp + ", in the ROM, so that address is not stored in the file.");
  }
  pc = ram[sp - 0x4000] | (ram[sp - 0x4000 + 1] << 8);
  iff = (bytes[19] & 4) ? 1 : 0;
  border = bytes[26] & 7;
  return finishSnapshot({
    program: imageBaseName(filename),
    filename: filename || "a .sna file",
    ram: ram,
    border: border,
    realRom: true,
    state: z80Regs({
      i: bytes[0],
      lp: bytes[1], hp: bytes[2],
      ep: bytes[3], dp: bytes[4],
      cp: bytes[5], bp: bytes[6],
      fp: bytes[7], ap: bytes[8],
      l: bytes[9], h: bytes[10],
      e: bytes[11], d: bytes[12],
      c: bytes[13], b: bytes[14],
      iy: imageWord(bytes, 15),
      ix: imageWord(bytes, 17),
      r: bytes[20],
      f: bytes[21], a: bytes[22],
      sp: (sp + 2) & 65535,
      pc: pc,
      im: bytes[25] & 3,
      iff: iff
    })
  });
}

function z80Is128(version, mode) {
  if (version === 2) return mode === 3 || mode === 4 || mode === 5 || mode === 6;
  return mode === 4 || mode === 5 || mode === 6 || mode >= 7;
}

function zeros(n) {
  var out = [];
  var i;
  for (i = 0; i < n; i++) out.push(0);
  return out;
}

function concatPages(a, b, c) {
  return a.concat(b, c);
}

function parseZ80(bytes, filename) {
  var pc, flags, border, r, compressed, extra, version, hw, blocksAt, i, len, page, data;
  var pages, ram, bank, extraNote, iff, im;
  if (bytes.length < 30) throw new Error("This .z80 file is too short to be a snapshot.");
  pc = imageWord(bytes, 6);
  flags = bytes[12];
  border = (flags >> 1) & 7;
  r = (bytes[11] & 0x7f) | ((flags & 1) ? 0x80 : 0);
  iff = bytes[27] ? 1 : 0;
  im = bytes[29] & 3;
  compressed = (flags & 0x20) !== 0;
  function regs(pcValue, spValue) {
    return z80Regs({
      a: bytes[0], f: bytes[1],
      c: bytes[2], b: bytes[3],
      l: bytes[4], h: bytes[5],
      pc: pcValue,
      sp: spValue,
      i: bytes[10], r: r,
      e: bytes[13], d: bytes[14],
      cp: bytes[15], bp: bytes[16],
      ep: bytes[17], dp: bytes[18],
      lp: bytes[19], hp: bytes[20],
      ap: bytes[21], fp: bytes[22],
      iy: imageWord(bytes, 23),
      ix: imageWord(bytes, 25),
      im: im,
      iff: iff
    });
  }
  if (pc !== 0) {
    if (compressed) ram = z80Unpack(bytes, 30, bytes.length, 49152, true);
    else if (bytes.length >= 30 + 49152) ram = bytes.slice(30, 30 + 49152);
    else throw new Error("This .z80 snapshot is missing its 48K of RAM.");
    return finishSnapshot({
      program: imageBaseName(filename),
      filename: filename || "a .z80 file",
      ram: ram,
      border: border,
      realRom: true,
      state: regs(pc, imageWord(bytes, 8))
    });
  }
  if (bytes.length < 34) throw new Error("This .z80 file is too short to be a version 2 snapshot.");
  extra = imageWord(bytes, 30);
  if (extra < 23 || 32 + extra > bytes.length) {
    throw new Error("This .z80 file has a header this loader cannot read.");
  }
  version = extra >= 54 ? 3 : 2;
  pc = imageWord(bytes, 32);
  hw = bytes[34];
  bank = bytes[35] & 7;
  blocksAt = 32 + extra;
  pages = {};
  i = blocksAt;
  while (i + 3 <= bytes.length) {
    len = imageWord(bytes, i);
    page = bytes[i + 2];
    if (len === 0xffff) {
      if (i + 3 + 16384 > bytes.length) throw new Error("This .z80 file is cut off.");
      data = bytes.slice(i + 3, i + 3 + 16384);
      i += 3 + 16384;
    } else {
      if (i + 3 + len > bytes.length) throw new Error("This .z80 file is cut off.");
      data = z80Unpack(bytes, i + 3, i + 3 + len, 16384, false);
      i += 3 + len;
    }
    pages[page] = data;
  }
  extraNote = "";
  if (z80Is128(version, hw)) {
    if (!pages[8] || !pages[5] || !pages[3 + bank]) {
      throw new Error("This 128K .z80 snapshot is missing a bank this 48K machine needs.");
    }
    ram = concatPages(pages[8], pages[5], pages[3 + bank]);
    extraNote = "It is a 128K snapshot, loaded as the 48K that was paged in. Other banks are not in this machine.";
  } else if (pages[8] && pages[4] && pages[5]) {
    ram = concatPages(pages[8], pages[4], pages[5]);
    if (hw === 2) extraNote = "SamRam snapshot. Loaded the normal 48K banks.";
  } else if (pages[8]) {
    ram = pages[8].concat(zeros(32768));
    extraNote = "Loaded the 16K of RAM at 16384. The rest of the 48K is empty.";
  } else {
    throw new Error("This .z80 snapshot has no 48K memory this machine can map.");
  }
  return finishSnapshot({
    program: imageBaseName(filename),
    filename: filename || "a .z80 file",
    ram: ram,
    border: border,
    extra: extraNote,
    realRom: true,
    state: regs(pc, imageWord(bytes, 8))
  });
}

function readTapBlocks(bytes) {
  var blocks = [];
  var i = 0;
  var len, j, sum, data;
  while (i + 2 <= bytes.length) {
    len = imageWord(bytes, i);
    i += 2;
    if (len < 2 || i + len > bytes.length) throw new Error("This tape is cut off.");
    sum = 0;
    for (j = 0; j < len; j++) sum ^= bytes[i + j];
    if ((sum & 255) !== 0) throw new Error("This tape has a bad checksum.");
    data = bytes.slice(i + 1, i + len - 1);
    blocks.push({ flag: bytes[i], data: data });
    i += len;
  }
  if (!blocks.length) throw new Error("This tape has no blocks.");
  return blocks;
}

function headerName(data) {
  var chars = [];
  var i, c;
  for (i = 0; i < 10; i++) {
    c = data[i + 1];
    chars.push((c >= 32 && c < 127) ? String.fromCharCode(c) : ".");
  }
  return chars.join("");
}

function readBasicNumber(body, j) {
  var value = null;
  var n;
  while (j < body.length && body[j] === 0x20) j++;
  if (j >= body.length) return { value: null, j: j };
  if (body[j] === 0xb0) {
    j++;
    while (j < body.length && body[j] === 0x20) j++;
    if (j < body.length && body[j] === 0x22) {
      j++;
      n = 0;
      while (j < body.length && body[j] >= 0x30 && body[j] <= 0x39) {
        n = n * 10 + (body[j] - 0x30);
        j++;
      }
      value = n;
      if (j < body.length && body[j] === 0x22) j++;
    }
    return { value: value, j: j };
  }
  if (body[j] >= 0x30 && body[j] <= 0x39) {
    n = 0;
    while (j < body.length && body[j] >= 0x30 && body[j] <= 0x39) {
      n = n * 10 + (body[j] - 0x30);
      j++;
    }
    value = n;
    if (j < body.length && body[j] === 0x0e) {
      j++;
      if (j + 5 <= body.length) {
        if (body[j] === 0) {
          value = body[j + 2] | (body[j + 3] << 8);
          if (body[j + 1] === 0xff) value = -value;
        }
        j += 5;
      }
    }
    return { value: value, j: j };
  }
  return { value: null, j: j };
}

function spectrumBasicLaunch(data) {
  var i = 0;
  var len, body, j, op, num, num2;
  var clear = null;
  var usr = null;
  var pokes = [];
  while (i + 4 <= data.length) {
    len = data[i + 2] | (data[i + 3] << 8);
    if (len < 1 || i + 4 + len > data.length) break;
    body = data.slice(i + 4, i + 4 + len);
    i += 4 + len;
    j = 0;
    while (j < body.length) {
      op = body[j];
      if (op === 0x0e && j + 5 < body.length) {
        j += 6;
        continue;
      }
      if (op === 0xfd || op === 0xc0 || op === 0xf4) {
        num = readBasicNumber(body, j + 1);
        if (num.value !== null && num.value >= 0) {
          if (op === 0xfd) clear = num.value;
          else if (op === 0xc0) usr = num.value;
          else {
            j = num.j;
            while (j < body.length && (body[j] === 0x20 || body[j] === 0x2c)) j++;
            num2 = readBasicNumber(body, j);
            if (num2.value !== null && num.value >= 0x4000 && num.value <= 0xffff) {
              pokes.push({ addr: num.value, value: num2.value & 255 });
            }
            j = num2.j;
            continue;
          }
        }
        j = num.j;
        continue;
      }
      j++;
    }
  }
  if (usr === null) return null;
  return { clear: clear, usr: usr, pokes: pokes };
}

function placeCalls(bytes, target) {
  var i, dest, n;
  n = bytes.length < 180 ? bytes.length : 180;
  for (i = 0; i + 2 < n; i++) {
    if (bytes[i] === 0xcd || bytes[i] === 0xc3) {
      dest = bytes[i + 1] | (bytes[i + 2] << 8);
      if (dest === target) return true;
    }
  }
  return false;
}

function withRemainingTape(parsed, blocks, consumed) {
  var rest = [];
  var i;
  if (!parsed || !parsed.ok) return parsed;
  for (i = 0; i < blocks.length; i++) if (!consumed[i]) rest.push(blocks[i]);
  if (!rest.length) return parsed;
  parsed.tape = rest;
  if (parsed.note) parsed.note += " The blocks still on the tape are copied in when the program calls the ROM loader.";
  return parsed;
}

function parseTapBlocks(blocks, filename) {
  var i, header, data, type, name, length, addr, placed, first, program, note, ram, at, copy, n;
  var codeName = "";
  var places = [];
  var launch = null;
  var found;
  var consumed = [];
  ram = blankRam();
  placed = 0;
  first = 0;
  program = "";
  for (i = 0; i < blocks.length; i++) {
    if (blocks[i].flag !== 0 || blocks[i].data.length < 17) continue;
    header = blocks[i].data;
    type = header[0];
    name = headerName(header);
    length = imageWord(header, 11);
    addr = imageWord(header, 13);
    if (!program) program = name;
    data = null;
    if (i + 1 < blocks.length && blocks[i + 1].flag === 0xff) data = blocks[i + 1].data;
    if (type === 0 && data) {
      found = spectrumBasicLaunch(data);
      if (found) launch = found;
      consumed[i] = 1;
      consumed[i + 1] = 1;
      i += 1;
      continue;
    }
    if (type !== 3 || !data) continue;
    consumed[i] = 1;
    consumed[i + 1] = 1;
    i += 1;
    if (!codeName) codeName = name;
    n = data.length < length ? data.length : length;
    if (addr >= 0x4000) {
      at = addr;
      copy = n;
      if (at + copy > 0x10000) copy = 0x10000 - at;
      ram.splice.apply(ram, [at - 0x4000, copy].concat(data.slice(0, copy)));
      places.push({ at: at, bytes: data.slice(0, copy) });
      if (!placed) first = addr;
      placed += copy;
    }
  }
  if (launch && launch.usr >= 0x4000 && placed) {
    var entry = launch.usr;
    var stack = launch.clear !== null ? launch.clear : 0xfffe;
    var used = places;
    var pokes = launch.pokes;
    var loader = null;
    var best = null;
    var pi;
    program = spectrumTapeName(program || imageBaseName(filename));
    for (pi = 0; pi < places.length; pi++) {
      if (places[pi].at === entry) loader = places[pi];
    }
    if (loader && placeCalls(loader.bytes, 0x0556)) {
      for (pi = 0; pi < places.length; pi++) {
        if (places[pi] === loader) continue;
        if (!best || places[pi].bytes.length > best.bytes.length) best = places[pi];
      }
      if (best) {
        entry = best.at;
        used = [best];
        pokes = [];
        if (launch.clear !== null && entry > launch.clear && entry - launch.clear < 512) stack = 0xd040;
        note = "Loaded " + program + " from " + (filename || "a tape") + ". ";
        note += "Its USR loader reads the tape from the ear, and this machine does not play tape tones, so the main block was started at " + entry + ".";
      }
    }
    if (!note) {
      note = "Loaded " + program + " from " + (filename || "a tape") + ". ";
      note += "The Sinclair ROM is booted, then the BASIC loader is followed";
      if (launch.clear !== null) note += ", CLEAR " + launch.clear;
      note += ", start at USR " + entry + ".";
    }
    return withRemainingTape({
      ok: true,
      program: program,
      blurb: "Loaded from a tape image on this computer.",
      note: note,
      rom: null,
      ram: null,
      places: used,
      useRom: true,
      entry: entry,
      clear: launch.clear,
      pokes: pokes,
      state: z80Regs({
        pc: entry,
        sp: stack,
        im: 1,
        iff: 1
      }),
      border: 7
    }, blocks, consumed);
  }
  if (!placed) {
    if (!program) program = spectrumTapeName(imageBaseName(filename));
    return spectrumImageFail("The tape program " + program + " is BASIC, and it has no CODE block to place in RAM. A Sinclair ROM is included, but there is no USR address to start.");
  }
  note = "";
  if (codeName && codeName !== program) {
    note = "The BASIC loader was not run. CODE " + codeName + " was placed at " + first + ".";
  }
  return withRemainingTape(finishSnapshot({
    program: program,
    filename: filename || "a tape",
    ram: ram,
    border: 7,
    extra: note,
    blurb: "Loaded from a tape image on this computer.",
    state: z80Regs({
      pc: first,
      sp: 0xfffe,
      im: 1,
      iff: 1
    })
  }), blocks, consumed);
}

function parseTap(bytes, filename) {
  return parseTapBlocks(readTapBlocks(bytes), filename);
}

function asciiAt(bytes, i, n) {
  var s = "";
  var k;
  for (k = 0; k < n && i + k < bytes.length; k++) s += String.fromCharCode(bytes[i + k]);
  return s;
}

function parseTzx(bytes, filename) {
  var i, id, len, n, pause, blocks, unknown;
  if (asciiAt(bytes, 0, 7) !== "ZXTape!" || bytes[7] !== 0x1a) {
    throw new Error("This is not a .tzx tape.");
  }
  blocks = [];
  unknown = false;
  i = 10;
  while (i < bytes.length) {
    id = bytes[i];
    i += 1;
    if (id === 0x10) {
      if (i + 4 > bytes.length) throw new Error("This .tzx tape is cut off.");
      pause = imageWord(bytes, i);
      len = imageWord(bytes, i + 2);
      i += 4;
      if (i + len > bytes.length) throw new Error("This .tzx tape is cut off.");
      blocks.push(bytes.slice(i, i + len));
      i += len;
      pause = pause;
    } else if (id === 0x20) {
      i += 2;
    } else if (id === 0x21) {
      if (i >= bytes.length) break;
      n = bytes[i];
      i += 1 + n;
    } else if (id === 0x22) {
      continue;
    } else if (id === 0x30) {
      if (i >= bytes.length) break;
      n = bytes[i];
      i += 1 + n;
    } else if (id === 0x32) {
      if (i + 2 > bytes.length) break;
      n = imageWord(bytes, i);
      i += 2 + n;
    } else if (id === 0x5a) {
      i += 9;
    } else {
      unknown = true;
      break;
    }
  }
  if (!blocks.length) {
    throw new Error("This .tzx tape has no standard-speed block. Export a .tap, .z80 or .sna instead.");
  }
  var tap = [];
  var b, body;
  for (b = 0; b < blocks.length; b++) {
    body = blocks[b];
    tap.push(body.length & 255, (body.length >> 8) & 255);
    tap = tap.concat(body);
  }
  var parsed = parseTap(tap, filename);
  if (parsed.ok && unknown && parsed.note) {
    parsed.note += " Stopped at a .tzx block this loader does not read.";
  }
  return parsed;
}

function parseScr(bytes, filename) {
  var ram, program;
  if (bytes.length !== 6912) {
    throw new Error("A .scr screen is 6912 bytes. This one is " + bytes.length + " bytes.");
  }
  ram = blankRam();
  ram.splice.apply(ram, [0, 6912].concat(bytes));
  ram[0x1b00] = 0xfb;
  ram[0x1b01] = 0x76;
  ram[0x1b02] = 0x18;
  ram[0x1b03] = 0xfd;
  program = spectrumTapeName(imageBaseName(filename));
  return {
    ok: true,
    program: program,
    blurb: "A screen file. The picture is on the display.",
    note: "Loaded screen " + program + " from " + (filename || "a .scr file") + ". A .scr is the picture only, not a running program.",
    rom: null,
    ram: ram,
    border: 0,
    state: z80Regs({ pc: 0x5b00, sp: 0xfffe, im: 1, iff: 1 })
  };
}

function parseRaw(bytes, filename) {
  var program = spectrumTapeName(imageBaseName(filename));
  var file = filename || "a ROM file";
  if (bytes.length === 6912) return parseScr(bytes, filename);
  if (bytes.length === 16384) {
    return {
      ok: true,
      program: program,
      blurb: "Loaded a 16K ROM image.",
      note: "Loaded a 16K ROM, " + program + ", from " + file + ". It starts at 0.",
      rom: bytes.slice(0, 16384),
      ram: null,
      state: null,
      border: 7
    };
  }
  if (bytes.length === 65536) {
    return {
      ok: true,
      program: program,
      blurb: "Loaded a 64K memory image.",
      note: "Loaded a 64K image, " + program + ", from " + file + ". Started at 0.",
      rom: bytes.slice(0, 16384),
      ram: bytes.slice(16384, 65536),
      state: z80Regs({ pc: 0, sp: 0xfffe, im: 1, iff: 1 }),
      border: 7
    };
  }
  if (bytes.length === 49152) {
    return finishSnapshot({
      program: program,
      filename: file,
      ram: bytes.slice(0),
      border: 7,
      extra: "Raw RAM image.",
      blurb: "Loaded a 48K RAM image.",
      state: z80Regs({ pc: 0x4000, sp: 0xfffe, im: 1, iff: 1 })
    });
  }
  throw new Error("A raw image needs to be 6912, 16384, 49152 or 65536 bytes. This one is " + bytes.length + " bytes.");
}

function parseSpectrumImage(bytes, filename) {
  var data, ext;
  try {
    data = asImageBytes(bytes);
    ext = imageExt(filename);
    if (!data.length) return spectrumImageFail("This file is empty.");
    if (ext === ".tzx" || (data.length >= 8 && asciiAt(data, 0, 7) === "ZXTape!")) return parseTzx(data, filename);
    if (ext === ".tap") return parseTap(data, filename);
    if (ext === ".sna") return parseSna(data, filename);
    if (ext === ".z80") return parseZ80(data, filename);
    if (ext === ".scr") return parseScr(data, filename);
    if (ext === ".rom" || ext === ".bin" || ext === ".raw") return parseRaw(data, filename);
    if (data.length === 49179) return parseSna(data, filename);
    if (data.length === 6912) return parseScr(data, filename);
    if (data.length === 16384 || data.length === 49152 || data.length === 65536) return parseRaw(data, filename);
    if (data.length >= 30) return parseZ80(data, filename);
    return spectrumImageFail("folio-48 reads .z80, .sna, .tap, .tzx, .scr and .rom files.");
  } catch (err) {
    return spectrumImageFail(err.message || "Could not read that file.");
  }
}

var sinclairReady = null;

function spectrumBootedMachine() {
  var fresh, i;
  if (!sinclairReady) {
    fresh = new Spectrum(spectrumSinclairRom());
    for (i = 0; i < 120; i++) fresh.runFrame();
    sinclairReady = { mem: fresh.mem.slice(0), state: fresh.cpu.getState() };
  }
  fresh = new Spectrum(spectrumSinclairRom());
  for (i = 0; i < 65536; i++) fresh.mem[i] = sinclairReady.mem[i];
  fresh.cpu.setState(sinclairReady.state);
  fresh.border = 7;
  fresh.speaker = 0;
  fresh.frame = 0;
  fresh.releaseKeys();
  return fresh;
}

function mountTapeOnRom(parsed) {
  var machine = spectrumBootedMachine();
  var p, i, block, st;
  if (parsed.pokes) {
    for (p = 0; p < parsed.pokes.length; p++) {
      machine.mem[parsed.pokes[p].addr & 65535] = parsed.pokes[p].value & 255;
    }
  }
  if (parsed.places) {
    for (p = 0; p < parsed.places.length; p++) {
      block = parsed.places[p];
      for (i = 0; i < block.bytes.length; i++) {
        if (block.at + i >= 0x4000 && block.at + i <= 0xffff) machine.mem[block.at + i] = block.bytes[i] & 255;
      }
    }
  }
  if (parsed.clear !== null && parsed.clear !== undefined) {
    machine.mem[0x5cb2] = parsed.clear & 255;
    machine.mem[0x5cb3] = (parsed.clear >> 8) & 255;
  }
  st = machine.cpu.getState();
  st.pc = parsed.entry & 65535;
  st.sp = parsed.state.sp & 65535;
  st.imode = 1;
  st.iff1 = 1;
  st.iff2 = 1;
  st.halted = false;
  st.do_delayed_ei = false;
  st.do_delayed_di = false;
  machine.cpu.setState(st);
  machine.releaseKeys();
  machine.frame = 0;
  machine.speaker = 0;
  if (parsed.border !== undefined && parsed.border !== null) machine.border = parsed.border & 7;
  return machine;
}

function mountSpectrumImage(parsed) {
  var rom = parsed.rom || (parsed.realRom ? spectrumSinclairRom() : spectrumStubRom());
  var machine, i;
  if (parsed.useRom) {
    machine = mountTapeOnRom(parsed);
  } else {
    machine = new Spectrum(rom);
    if (parsed.ram) {
      for (i = 0; i < parsed.ram.length && i < 49152; i++) machine.mem[0x4000 + i] = parsed.ram[i] & 255;
    }
    if (parsed.state) machine.cpu.setState(parsed.state);
    if (parsed.border !== undefined && parsed.border !== null) machine.border = parsed.border & 7;
    machine.releaseKeys();
    machine.frame = 0;
    machine.speaker = 0;
  }
  machine.tape = parsed.tape || null;
  machine.tapePos = 0;
  return machine;
}
