var machine = null;
var canvas = null;
var lastTick = 0;
var bucket = 0;
var audioCtx = null;
var audioTime = 0;
var keysBound = false;
var loopStarted = false;

var KEYMAP = {
  o: [5, 1], O: [5, 1], ArrowLeft: [5, 1],
  p: [5, 0], P: [5, 0], ArrowRight: [5, 0],
  q: [2, 0], Q: [2, 0], ArrowUp: [2, 0],
  a: [1, 0], A: [1, 0], ArrowDown: [1, 0],
  h: [6, 4], H: [6, 4],
  "1": [3, 0],
  "2": [3, 1],
  "3": [3, 2],
  "4": [3, 3],
  " ": [7, 0]
};

function ensureAudio() {
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playEdges(level, edges) {
  var ctx = audioCtx;
  var rate, samples, buf, data, src, when, i, cyc, bit, at;
  if (!ctx || !edges.length) return;
  rate = 44100;
  samples = Math.round(rate * 0.02);
  buf = ctx.createBuffer(1, samples, rate);
  data = buf.getChannelData(0);
  bit = level ? 1 : 0;
  at = 0;
  for (i = 0; i < samples; i++) {
    cyc = i * (3500000 / rate);
    while (at < edges.length && edges[at] <= cyc) {
      bit ^= 1;
      at++;
    }
    data[i] = bit ? 0.14 : -0.14;
  }
  src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  when = Math.max(ctx.currentTime + 0.01, audioTime);
  src.start(when);
  audioTime = when + buf.duration;
}

function draw() {
  var ctx = canvas.getContext("2d");
  var img = ctx.createImageData(320, 256);
  var data = img.data;
  var border = spectrumPalette[machine.border & 7];
  var i, sx, sy, addr, byte, bit, attr, ink, paper, color, o, swap;
  for (i = 0; i < data.length; i += 4) {
    data[i] = border[0];
    data[i + 1] = border[1];
    data[i + 2] = border[2];
    data[i + 3] = 255;
  }
  for (sy = 0; sy < 192; sy++) {
    for (sx = 0; sx < 256; sx++) {
      addr = spectrumPixAddr(sx, sy);
      byte = machine.mem[addr];
      bit = (byte >> (7 - (sx & 7))) & 1;
      attr = machine.mem[0x5800 + (sy >> 3) * 32 + (sx >> 3)];
      ink = attr & 7;
      paper = (attr >> 3) & 7;
      if (attr & 64) {
        ink += 8;
        paper += 8;
      }
      if ((attr & 128) && (machine.frame & 16)) {
        swap = ink;
        ink = paper;
        paper = swap;
      }
      color = spectrumPalette[bit ? ink : paper];
      o = ((sy + 32) * 320 + (sx + 32)) * 4;
      data[o] = color[0];
      data[o + 1] = color[1];
      data[o + 2] = color[2];
      data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function onFrame(ts) {
  var delta, steps, level;
  if (!lastTick) lastTick = ts;
  delta = ts - lastTick;
  lastTick = ts;
  if (delta > 80) delta = 80;
  bucket += delta;
  steps = 0;
  while (bucket >= 20 && steps < 4) {
    level = machine.speaker;
    machine.runFrame();
    playEdges(level, machine.edges);
    bucket -= 20;
    steps++;
  }
  draw();
  requestAnimationFrame(onFrame);
}

function bindKeys() {
  document.addEventListener("keydown", function (event) {
    var mapped = KEYMAP[event.key];
    if (!mapped) return;
    ensureAudio();
    machine.setKey(mapped[0], mapped[1], true);
    if (event.key === " " || event.key.indexOf("Arrow") === 0) event.preventDefault();
  });
  document.addEventListener("keyup", function (event) {
    var mapped = KEYMAP[event.key];
    if (!mapped) return;
    machine.setKey(mapped[0], mapped[1], false);
  });
  window.addEventListener("blur", function () { machine.releaseKeys(); });

  var pads = document.querySelectorAll("[data-key]");
  var i;
  for (i = 0; i < pads.length; i++) {
    (function (button) {
      var parts = button.getAttribute("data-key").split(",");
      var row = Number(parts[0]);
      var bit = Number(parts[1]);
      function down(event) {
        event.preventDefault();
        ensureAudio();
        machine.setKey(row, bit, true);
      }
      function up() { machine.setKey(row, bit, false); }
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointerleave", up);
      button.addEventListener("pointercancel", up);
    })(pads[i]);
  }
}

function folioPlay(next) {
  machine = next;
  canvas = document.getElementById("screen");
  if (!keysBound) {
    bindKeys();
    keysBound = true;
  }
  try { canvas.focus(); } catch (ignore) {}
  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(onFrame);
  }
}
