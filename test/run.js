var assert = require("assert");
var fs = require("fs");
var path = require("path");
var vm = require("vm");

var root = path.join(__dirname, "..");
var context = {
  console: console,
  assert: assert
};
vm.createContext(context);
["vendor/Z80.js", "src/assemble.js", "src/game.js", "src/examples.js", "src/spectrum.js", "src/rom.js", "src/castaway.js", "src/image.js", "src/pdf.js"].forEach(function (file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
});

function attr(machine, x, y) {
  return machine.mem[0x5800 + y * 32 + x];
}

function dump(machine) {
  var hex = "0123456789abcdef";
  var y, x, row, lines = [];
  for (y = 0; y < 24; y++) {
    row = "";
    for (x = 0; x < 32; x++) row += hex[attr(machine, x, y) & 15];
    lines.push(row);
  }
  var a = context.GAME_ADDR;
  lines.push(
    "state=" + machine.mem[a.state] +
    " tick=" + machine.mem[a.tick] +
    " px=" + machine.mem[a.px] +
    " py=" + machine.mem[a.py] +
    " lives=" + machine.mem[a.lives] +
    " score=" + machine.mem[a.score] +
    " pc=" + machine.cpu.getState().pc.toString(16)
  );
  return lines.join("\n");
}

function run(machine, n) {
  var i;
  for (i = 0; i < n; i++) machine.runFrame();
}

var pix = context.spectrumPixAddr;
assert.strictEqual(pix(0, 0), 0x4000);
assert.strictEqual(pix(0, 1), 0x4100);
assert.strictEqual(pix(0, 8), 0x4020);
assert.strictEqual(pix(8, 0), 0x4001);

var bytes = [];
var i;
for (i = 0; i < 300; i++) bytes.push(i & 255);
var encoded = context.spectrumEncode(bytes);
var decoded = context.spectrumDecode(encoded);
assert.strictEqual(decoded.length, bytes.length);
for (i = 0; i < bytes.length; i++) assert.strictEqual(decoded[i], bytes[i]);

var mem = new Array(65536);
for (i = 0; i < 65536; i++) mem[i] = 0;
mem[0] = 0x3e;
mem[1] = 0x42;
mem[2] = 0x76;
var cpu = context.Z80({
  mem_read: function (a) { return mem[a & 65535]; },
  mem_write: function (a, v) { mem[a & 65535] = v & 255; },
  io_read: function () { return 0xff; },
  io_write: function () {}
});
cpu.reset();
cpu.run_instruction();
assert.strictEqual(cpu.getState().a, 0x42);
cpu.run_instruction();
assert.strictEqual(cpu.is_halted(), true);

var rom = context.buildGameRom();
assert.strictEqual(rom.length, 16384);
assert.strictEqual(rom[0], 0xf3); // di
assert.strictEqual(rom[0x38], 0xfb); // ei
assert.strictEqual(rom[0x39], 0xed);
assert.strictEqual(rom[0x3a], 0x4d); // reti

var machine = new context.Spectrum(rom);
run(machine, 8);
if (attr(machine, 6, 4) !== 0x47) {
  console.error(dump(machine));
  assert.fail("FOLIO is not on the title screen");
}
assert.strictEqual(attr(machine, 7, 4), 0x47);
assert.strictEqual(attr(machine, 8, 4), 0x47);
assert.strictEqual(context.spectrumCellColor(machine.mem, 0, 0, machine.frame), 13);

machine.setKey(7, 0, true);
run(machine, 6);
machine.setKey(7, 0, false);
var addr = context.GAME_ADDR;
if (machine.mem[addr.state] !== 1) {
  console.error(dump(machine));
  assert.fail("space did not start the game");
}
var px = machine.mem[addr.px];
var py = machine.mem[addr.py];
assert.ok(px > 0 && px < 31 && py > 1 && py < 23);
assert.strictEqual(attr(machine, px, py), 0x47);
assert.strictEqual(attr(machine, 2, 1), 0x44);
assert.strictEqual(attr(machine, 4, 1), 0x44);
assert.strictEqual(attr(machine, 6, 1), 0x44);
assert.strictEqual(attr(machine, 3, 1), 0);
assert.strictEqual(attr(machine, 5, 1), 0);
assert.strictEqual(machine.mem[addr.lives], 3);

var before = px;
machine.setKey(5, 1, true);
run(machine, 8);
machine.setKey(5, 1, false);
if (machine.mem[addr.px] >= before) {
  console.error(dump(machine));
  assert.fail("left did not move the player");
}

var snap = machine.snapshot();
var copy = new context.Spectrum(null);
copy.restore(snap);
assert.strictEqual(copy.cpu.getState().pc, machine.cpu.getState().pc);
assert.strictEqual(copy.mem[0x5800 + py * 32 + machine.mem[addr.px]], attr(machine, machine.mem[addr.px], py));
run(copy, 3);
assert.ok(copy.frame > snap.frame);

var round = context.spectrumDecode(context.spectrumEncode(machine.mem));
assert.strictEqual(round.length, 65536);
assert.strictEqual(round[0x4000], machine.mem[0x4000]);
assert.strictEqual(round[0xffff], machine.mem[0xffff]);

var z80Source = fs.readFileSync(path.join(root, "vendor/Z80.js"), "utf8");
var spectrumSource = fs.readFileSync(path.join(root, "src/spectrum.js"), "utf8");
var pdf = context.buildFolioPdf({
  z80Source: z80Source,
  spectrumSource: spectrumSource,
  snapshot: snap
});
assert.ok(pdf.indexOf("%PDF-1.4") === 0);
assert.ok(pdf.indexOf("/JavaScript") > 0);
assert.ok(pdf.indexOf("folioFrame") > 0);
assert.ok(pdf.indexOf("folioBoot") > 0);
assert.strictEqual((pdf.match(/\/T \(c_/g) || []).length, 768);
assert.ok(pdf.indexOf("/T (c_0_0)") > 0);
assert.ok(pdf.indexOf("/T (c_23_31)") > 0);
assert.ok(pdf.indexOf("\nendstream\nendstream") < 0);
var marker = pdf.lastIndexOf("startxref\n");
var xrefAt = parseInt(pdf.slice(marker + "startxref\n".length), 10);
assert.strictEqual(pdf.slice(xrefAt, xrefAt + 4), "xref");
assert.ok(pdf.indexOf("0000000000 65535 f \n") > 0);
assert.ok(pdf.indexOf("/OpenAction") > 0);
assert.ok(pdf.indexOf("this.getField") > 0);
assert.ok(pdf.indexOf("\"use strict\"") < 0);
assert.ok(pdf.indexOf("https://get.adobe.com/reader/") > 0);
assert.ok(pdf.indexOf("PDFium") > 0);
assert.ok(pdf.indexOf("/Subtype /Link") > 0);
assert.ok(pdf.indexOf("Tape name " + context.spectrumTapeName("FOLIO") + ", ten characters, padded with spaces.") > 0);

var title = new context.Spectrum(rom);
run(title, 8);
assert.strictEqual(title.mem[addr.state], 0);
var playSource = fs.readFileSync(path.join(root, "src/play.js"), "utf8");
var html = context.buildFolioHtml({
  z80Source: z80Source,
  spectrumSource: spectrumSource,
  playSource: playSource,
  snapshot: title.snapshot(),
  pdf: pdf
});
assert.strictEqual(html.indexOf("<!DOCTYPE html>"), 0);
assert.ok(html.indexOf("<script src") < 0);
assert.ok(html.indexOf(title.snapshot().mem) > 0);
assert.ok(html.indexOf("Save Acrobat PDF") > 0);
assert.ok(html.indexOf("folioPlay(machine)") > 0);

var scriptAt = html.indexOf("<script>");
var scriptEnd = html.lastIndexOf("</script>");
var page = {
  console: console,
  _raf: null,
  _on: {},
  requestAnimationFrame: function (fn) { page._raf = fn; },
  document: {
    addEventListener: function (type, fn) { page._on[type] = fn; },
    getElementById: function (id) {
      if (id === "screen") {
        return {
          focus: function () {},
          getContext: function () {
            return {
              createImageData: function (w, h) {
                return { data: new Uint8ClampedArray(w * h * 4) };
              },
              putImageData: function () {}
            };
          }
        };
      }
      return { textContent: "", addEventListener: function () {} };
    },
    querySelectorAll: function () { return []; },
    createElement: function () {
      return { href: "", download: "", click: function () {}, remove: function () {} };
    },
    body: { appendChild: function () {} }
  },
  window: { addEventListener: function () {} }
};
vm.createContext(page);
vm.runInContext(html.slice(scriptAt + "<script>".length, scriptEnd), page, { filename: "folio-48.html" });
function pump(ts) {
  var fn = page._raf;
  assert.strictEqual(typeof fn, "function");
  page._raf = null;
  fn(ts);
}
pump(1000);
var frame0 = page.machine.frame;
pump(1160);
assert.ok(page.machine.frame > frame0, "pressed page did not run");
assert.strictEqual(page.machine.mem[addr.state], 0);
page._on.keydown({ key: " ", preventDefault: function () {} });
pump(1320);
pump(1480);
if (page.machine.mem[addr.state] !== 1) {
  assert.fail("space did not start the pressed page");
}

var titlePdf = context.buildFolioPdf({
  z80Source: z80Source,
  spectrumSource: spectrumSource,
  snapshot: title.snapshot()
});
var jsAt = titlePdf.indexOf("var folioDoc = this;");
var jsEnd = titlePdf.indexOf("\nendstream", jsAt);
var pdfJs = titlePdf.slice(jsAt, jsEnd);
var doc = {
  _fields: {},
  getField: function (name) {
    if (!doc._fields[name]) {
      doc._fields[name] = { fillColor: null, setFocus: function () { doc.focused = name; } };
    }
    return doc._fields[name];
  },
  setAction: function () {},
  focused: ""
};
var acro = {
  app: {
    setInterval: function () { return 1; },
    clearInterval: function () {},
    alert: function (msg) { throw new Error(String(msg)); }
  },
  console: console,
  doc: doc
};
vm.createContext(acro);
vm.runInContext("(function(){\n" + pdfJs + "\ndoc.timer = folioTimer;\ndoc.machine = folioMachine;\ndoc.type = folioType;\ndoc.frame = folioFrame;\n}).call(doc);", acro, { filename: "folio.pdf.js" });
assert.ok(doc.timer, "pdf timer did not start");
assert.strictEqual(doc.machine.mem[addr.state], 0);
doc.type({ change: " ", rc: true, willCommit: false });
var step;
for (step = 0; step < 8; step++) doc.frame();
if (doc.machine.mem[addr.state] !== 1) {
  assert.fail("space did not start the game inside the pdf script");
}

var cells = context.folioCells("FOLIO", 6, 4);
assert.strictEqual(cells[0][0], 6);
assert.strictEqual(cells[0][1], 4);
assert.strictEqual(cells[1][0], 7);
assert.strictEqual(cells[2][0], 8);

var demo = new context.Spectrum(rom);
run(demo, 140);
assert.strictEqual(demo.mem[addr.state], 1, "title did not start the game\n" + dump(demo));
run(demo, 300);
assert.strictEqual(demo.mem[addr.state], 1);
assert.ok(demo.mem[addr.px] >= 1 && demo.mem[addr.px] <= 30);
assert.ok(demo.mem[addr.py] >= 2 && demo.mem[addr.py] <= 22);
assert.ok(demo.mem[addr.score] > 0, "demo collected no leaves\n" + dump(demo));

assert.strictEqual(context.spectrumTapeName("FOLIO"), "FOLIO     ");
assert.strictEqual(context.spectrumTapeName("PIPS"), "PIPS      ");
assert.strictEqual(context.spectrumTapeName("FOLIO").length, 10);
assert.strictEqual(context.SPECTRUM_PROGRAMS.length, 4);
assert.strictEqual(context.spectrumProgram("DRIFT").tape, "DRIFT     ");
assert.strictEqual(context.spectrumProgram("PIPS").tape, "PIPS      ");

function cellsOn(machine, word, col, row) {
  var cells = context.folioCells(word, col, row);
  var i;
  for (i = 0; i < cells.length; i++) {
    if (attr(machine, cells[i][0], cells[i][1]) !== 0x47) return false;
  }
  return cells.length > 0;
}

function playExample(id) {
  var prog = context.spectrumProgram(id);
  var box = new context.Spectrum(prog.build());
  run(box, 8);
  return box;
}

var drift = playExample("DRIFT");
if (!cellsOn(drift, "DRIFT", 6, 4) || drift.mem[context.EXAMPLE_ADDR.state] !== 0) {
  console.error(dump(drift));
  assert.fail("DRIFT is not on the title screen");
}
drift.setKey(7, 0, true);
run(drift, 6);
drift.setKey(7, 0, false);
if (drift.mem[context.EXAMPLE_ADDR.state] !== 1) {
  console.error(dump(drift));
  assert.fail("space did not start DRIFT");
}
assert.strictEqual(attr(drift, drift.mem[context.EXAMPLE_ADDR.px], drift.mem[context.EXAMPLE_ADDR.py]), 0x47);
var driftBefore = drift.mem[context.EXAMPLE_ADDR.px];
drift.setKey(5, 1, true);
run(drift, 6);
drift.setKey(5, 1, false);
assert.ok(drift.mem[context.EXAMPLE_ADDR.px] < driftBefore, "left did not move DRIFT");
run(drift, 40);
assert.strictEqual(drift.mem[context.EXAMPLE_ADDR.state], 1, "DRIFT demo died\n" + dump(drift));
assert.ok(drift.mem[context.EXAMPLE_ADDR.score] > 0, "DRIFT scored nothing");

var pips = playExample("PIPS");
if (!cellsOn(pips, "PIPS", 8, 4) || pips.mem[context.EXAMPLE_ADDR.state] !== 0) {
  console.error(dump(pips));
  assert.fail("PIPS is not on the title screen");
}
pips.setKey(7, 0, true);
run(pips, 6);
pips.setKey(7, 0, false);
if (pips.mem[context.EXAMPLE_ADDR.state] !== 1) {
  console.error(dump(pips));
  assert.fail("space did not start PIPS");
}
run(pips, 50);
assert.strictEqual(pips.mem[context.EXAMPLE_ADDR.state], 1, "PIPS demo died\n" + dump(pips));
assert.ok(pips.mem[context.EXAMPLE_ADDR.score] > 0, "PIPS collected nothing\n" + dump(pips));

function blankRam() {
  var ram = [];
  var i;
  for (i = 0; i < 49152; i++) ram.push(0);
  return ram;
}

function writeRam(ram, addr, bytes) {
  var i;
  for (i = 0; i < bytes.length; i++) ram[addr - 0x4000 + i] = bytes[i];
}

var borderProgram = [0x3e, 0x04, 0xd3, 0xfe, 0x18, 0xfe];

function z80Header(pc, compressFlag) {
  var h = [];
  var i;
  for (i = 0; i < 30; i++) h.push(0);
  h[6] = pc & 255;
  h[7] = (pc >> 8) & 255;
  h[8] = 0xfe;
  h[9] = 0xff;
  h[12] = (1 << 1) | (compressFlag ? 0x20 : 0);
  h[29] = 1;
  return h;
}

function packZ80(ram) {
  var out = [];
  var i = 0;
  var b, n, k;
  while (i < ram.length) {
    b = ram[i];
    n = 1;
    while (i + n < ram.length && ram[i + n] === b && n < 255) n++;
    if (n >= 5 || (b === 0xed && n >= 2)) out.push(0xed, 0xed, n, b);
    else if (b === 0xed) { out.push(0xed); n = 1; }
    else for (k = 0; k < n; k++) out.push(b);
    i += n;
  }
  out.push(0x00, 0xed, 0xed, 0x00);
  return out;
}

var ramImage = blankRam();
writeRam(ramImage, 0x8000, borderProgram);

var plainZ80 = z80Header(0x8000, false).concat(ramImage);
var loadedZ80 = context.mountSpectrumImage(context.parseSpectrumImage(plainZ80, "border.z80"));
run(loadedZ80, 2);
assert.strictEqual(loadedZ80.border, 4, "uncompressed .z80 did not run");
assert.strictEqual(context.parseSpectrumImage(plainZ80, "border.z80").program, "border    ");

var packedZ80 = z80Header(0x8000, true).concat(packZ80(ramImage));
var loadedPacked = context.mountSpectrumImage(context.parseSpectrumImage(packedZ80, "packed.z80"));
run(loadedPacked, 2);
assert.strictEqual(loadedPacked.border, 4, "compressed .z80 did not run");

function z80Page(page, block) {
  var raw = [0xff, 0xff, page].concat(block);
  return raw;
}
var page8 = blankRam().slice(0, 16384);
var page4 = blankRam().slice(0, 16384);
var page5 = blankRam().slice(0, 16384);
var pi;
for (pi = 0; pi < borderProgram.length; pi++) page4[pi] = borderProgram[pi];
var v2 = z80Header(0, false);
v2[30] = 23;
v2[31] = 0;
v2[32] = 0x00;
v2[33] = 0x80;
v2[34] = 0;
while (v2.length < 55) v2.push(0);
v2 = v2.concat(z80Page(8, page8), z80Page(4, page4), z80Page(5, page5));
var loadedV2 = context.mountSpectrumImage(context.parseSpectrumImage(v2, "banks.z80"));
run(loadedV2, 2);
assert.strictEqual(loadedV2.border, 4, "version 2 .z80 did not run");

var pageHigh = blankRam().slice(0, 16384);
var v2x = z80Header(0, false);
v2x[30] = 23;
v2x[31] = 0;
v2x[32] = 0x00;
v2x[33] = 0x80;
v2x[34] = 3;
v2x[35] = 0;
while (v2x.length < 55) v2x.push(0);
var p128 = {};
p128[8] = page8;
p128[5] = page4;
p128[3] = pageHigh;
p128[4] = pageHigh;
p128[6] = pageHigh;
p128[7] = pageHigh;
p128[9] = pageHigh;
p128[10] = pageHigh;
[3, 4, 5, 6, 7, 8, 9, 10].forEach(function (page) {
  v2x = v2x.concat(z80Page(page, p128[page]));
});
var parsed128 = context.parseSpectrumImage(v2x, "wide.z80");
assert.ok(parsed128.ok, parsed128.note);
assert.ok(parsed128.note.indexOf("128K") > 0, parsed128.note);
var loaded128 = context.mountSpectrumImage(parsed128);
run(loaded128, 2);
assert.strictEqual(loaded128.border, 4, "128K .z80 did not run the paged banks");

var snaRam = blankRam();
writeRam(snaRam, 0x8000, borderProgram);
writeRam(snaRam, 0xfffe, [0x00, 0x80]);
var sna = [];
var si;
for (si = 0; si < 27; si++) sna.push(0);
sna[19] = 0;
sna[23] = 0xfe;
sna[24] = 0xff;
sna[25] = 1;
sna[26] = 1;
sna = sna.concat(snaRam);
var loadedSna = context.mountSpectrumImage(context.parseSpectrumImage(sna, "border.sna"));
run(loadedSna, 2);
assert.strictEqual(loadedSna.border, 4, ".sna did not run");
assert.strictEqual(loadedSna.cpu.getState().pc >= 0x8000 && loadedSna.cpu.getState().pc <= 0x8006, true);
var badSna = context.parseSpectrumImage([1, 2, 3], "short.sna");
assert.strictEqual(badSna.ok, false);
assert.ok(badSna.note.indexOf("49179") > 0);

function tapBlock(flag, data) {
  var body = [flag].concat(data);
  var sum = 0;
  var i;
  for (i = 0; i < body.length; i++) sum ^= body[i];
  body.push(sum & 255);
  return [body.length & 255, (body.length >> 8) & 255].concat(body);
}
function tapHeader(type, name, length, p1) {
  var data = [type];
  var i;
  for (i = 0; i < 10; i++) data.push(name.charCodeAt(i));
  data.push(length & 255, (length >> 8) & 255, p1 & 255, (p1 >> 8) & 255, 0x00, 0x80);
  return data;
}
var codeTap = tapBlock(0, tapHeader(3, "CODETEST  ", borderProgram.length, 0x8000)).concat(tapBlock(0xff, borderProgram));
var parsedTap = context.parseSpectrumImage(codeTap, "code.tap");
assert.strictEqual(parsedTap.program, "CODETEST  ");
var loadedTap = context.mountSpectrumImage(parsedTap);
run(loadedTap, 2);
assert.strictEqual(loadedTap.border, 4, ".tap code did not run");

var basicTap = tapBlock(0, tapHeader(0, "BASIC     ", 1, 0xffff)).concat(tapBlock(0xff, [0x00]));
var parsedBasic = context.parseSpectrumImage(basicTap, "basic.tap");
assert.strictEqual(parsedBasic.ok, false);
assert.ok(parsedBasic.note.indexOf("BASIC") > 0);
assert.ok(parsedBasic.note.indexOf("Sinclair ROM") > 0);

var tzx = [0x5a, 0x58, 0x54, 0x61, 0x70, 0x65, 0x21, 0x1a, 1, 20];
function pushTzx(body) {
  tzx.push(0x10, 0xe8, 0x03, body.length & 255, (body.length >> 8) & 255);
  tzx = tzx.concat(body);
}
var codeHeaderBody = tapBlock(0, tapHeader(3, "CODETEST  ", borderProgram.length, 0x8000)).slice(2);
var codeDataBody = tapBlock(0xff, borderProgram).slice(2);
pushTzx(codeHeaderBody);
pushTzx(codeDataBody);
var parsedTzx = context.parseSpectrumImage(tzx, "code.tzx");
assert.ok(parsedTzx.ok, parsedTzx.note);
assert.strictEqual(parsedTzx.program, "CODETEST  ");
var loadedTzx = context.mountSpectrumImage(parsedTzx);
run(loadedTzx, 2);
assert.strictEqual(loadedTzx.border, 4, ".tzx code did not run");

var scr = blankRam().slice(0, 6912);
scr[6144] = 0x47;
var parsedScr = context.parseSpectrumImage(scr, "picture.scr");
assert.ok(parsedScr.note.indexOf("picture") > 0);
var loadedScr = context.mountSpectrumImage(parsedScr);
run(loadedScr, 4);
assert.strictEqual(loadedScr.mem[0x5800], 0x47, ".scr was overwritten");

var romCalls = [0xd7].concat(borderProgram);
var callRam = blankRam();
writeRam(callRam, 0x8000, romCalls);
var callZ80 = z80Header(0x8000, false).concat(callRam);
var parsedCall = context.parseSpectrumImage(callZ80, "calls.z80");
assert.ok(parsedCall.ok);
assert.ok(parsedCall.note.indexOf("Sinclair ROM") > 0, parsedCall.note);

var driftRom = context.buildDriftRom();
var parsedRom = context.parseSpectrumImage(driftRom, "drift.rom");
assert.strictEqual(parsedRom.program, "drift     ");
var loadedRom = context.mountSpectrumImage(parsedRom);
run(loadedRom, 8);
assert.ok(cellsOn(loadedRom, "DRIFT", 6, 4), "reloaded DRIFT rom has no title");

var driftPdf = context.buildFolioPdf({
  z80Source: z80Source,
  spectrumSource: spectrumSource,
  snapshot: drift.snapshot(),
  tape: "DRIFT"
});
assert.ok(driftPdf.indexOf("Tape name " + context.spectrumTapeName("DRIFT") + ", ten characters, padded with spaces.") > 0);

var pageHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
var readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
assert.ok(pageHtml.indexOf("ten-character") < 0);
assert.ok(pageHtml.indexOf("Ten characters") > 0);
assert.ok(pageHtml.indexOf("data-program=\"DRIFT\"") > 0);
assert.ok(pageHtml.indexOf("data-program=\"PIPS\"") > 0);
assert.ok(pageHtml.indexOf("data-program=\"CASTAWAY\"") > 0);
assert.ok(pageHtml.indexOf("Load a Spectrum image") > 0);
assert.ok(pageHtml.indexOf("Sinclair ROM") > 0);
assert.ok(readme.indexOf("FOLIO and then five spaces") > 0);
assert.ok(readme.indexOf("DRIFT") > 0);
assert.ok(readme.indexOf("PIPS") > 0);
assert.ok(readme.indexOf(".z80") > 0);
assert.ok(readme.indexOf("castawy") > 0);
assert.ok(readme.indexOf("5ea7c2b824672e914525d1d5c419d71b84a426a2") > 0);

var sinclair = context.spectrumSinclairRom();
assert.strictEqual(sinclair.length, 16384);
assert.strictEqual(sinclair[0], 0xf3);
assert.strictEqual(sinclair[1], 0xaf);
assert.strictEqual(sinclair[5], 0xc3);
assert.strictEqual(sinclair[6], 0xcb);
assert.strictEqual(sinclair[7], 0x11);
var romSum = 0;
var ri;
var copyText = "";
for (ri = 0; ri < sinclair.length; ri++) romSum = (romSum + sinclair[ri]) >>> 0;
assert.strictEqual(romSum, 1926175, "Sinclair ROM bytes changed");
for (ri = 5435; ri < 5461; ri++) copyText += String.fromCharCode(sinclair[ri] & 127);
assert.ok(copyText.indexOf("1982 Sinclair Research Ltd") === 0, copyText);

var castParsed = context.parseSpectrumImage(context.castawayTap(), "castawy.tap");
assert.ok(castParsed.ok, castParsed.note);
assert.strictEqual(castParsed.program, "castawy   ");
assert.strictEqual(castParsed.entry, 24100);
assert.strictEqual(castParsed.clear, 24099);
assert.strictEqual(castParsed.state.sp, 0xd040);
assert.strictEqual(castParsed.useRom, true);
assert.ok(castParsed.note.indexOf("ear") > 0, castParsed.note);
var castGame = context.mountSpectrumImage(castParsed);
function paintSum(machine) {
  var n = 0;
  var a;
  for (a = 0x4000; a < 0x5800; a++) n = (n + machine.mem[a]) >>> 0;
  return n;
}
function holdKey(machine, frames, row) {
  var f;
  for (f = 0; f < frames; f++) {
    machine.releaseKeys();
    if (row) machine.setKey(row[0], row[1], true);
    machine.runFrame();
  }
}
holdKey(castGame, 360, null);
var castIntro = paintSum(castGame);
holdKey(castGame, 20, [7, 0]);
holdKey(castGame, 60, null);
assert.notStrictEqual(paintSum(castGame), castIntro, "Space did not leave the Castaway intro");
holdKey(castGame, 20, [3, 0]);
holdKey(castGame, 60, null);
var castSnap = castGame.snapshot();
function castBranch(row) {
  var branched = new context.Spectrum(context.spectrumSinclairRom());
  branched.restore(castSnap);
  holdKey(branched, 50, row);
  return paintSum(branched);
}
var castStill = castBranch(null);
var castLeft = castBranch([5, 1]);
var castRight = castBranch([5, 0]);
assert.notStrictEqual(castLeft, castStill, "O did not move Castaway");
assert.notStrictEqual(castRight, castStill, "P did not move Castaway");
assert.notStrictEqual(castLeft, castRight, "left and right looked the same");

console.log("ok");
