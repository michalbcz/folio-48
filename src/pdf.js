// Build a PDF whose document script is this same Spectrum, opened on a snapshot.
function pdfAscii(text) {
  var out = "";
  var i, c;
  for (i = 0; i < text.length; i++) {
    c = text.charCodeAt(i);
    out += c >= 32 && c < 127 || c === 10 || c === 13 ? text.charAt(i) : " ";
  }
  return out;
}

function pdfPad(n) {
  var s = String(n);
  while (s.length < 10) s = "0" + s;
  return s;
}

function pdfLiteral(text) {
  return "(" + String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)") + ")";
}

function folioRuntime(snapshot) {
  var state = JSON.stringify(snapshot.state);
  return [
    "var FOLIO_MEM = \"" + snapshot.mem + "\";",
    "var FOLIO_STATE = " + state + ";",
    "var FOLIO_BORDER = " + (snapshot.border & 7) + ";",
    "var FOLIO_SPEAKER = " + (snapshot.speaker & 1) + ";",
    "var FOLIO_FRAME = " + (snapshot.frame || 0) + ";",
    "var folioMachine = null;",
    "var folioTimer = null;",
    "var folioPrev = [];",
    "var folioBorderPrev = -1;",
    "var folioHold = \"\";",
    "var folioHoldN = 0;",
    "var folioFailed = false;",
    "function folioApply(dir, down) {",
    "  if (!folioMachine) return;",
    "  if (dir === \"L\") folioMachine.setKey(5, 1, down);",
    "  else if (dir === \"R\") folioMachine.setKey(5, 0, down);",
    "  else if (dir === \"U\") folioMachine.setKey(2, 0, down);",
    "  else if (dir === \"D\") folioMachine.setKey(1, 0, down);",
    "  else if (dir === \"S\") folioMachine.setKey(7, 0, down);",
    "}",
    "function folioRelease() {",
    "  if (folioHold) folioApply(folioHold, false);",
    "  folioHold = \"\";",
    "  folioHoldN = 0;",
    "}",
    "function folioHoldDir(dir) {",
    "  folioRelease();",
    "  folioHold = dir;",
    "  folioHoldN = 6;",
    "  folioApply(dir, true);",
    "}",
    "function folioType(ev) {",
    "  var c = ev.change;",
    "  var dir = \"\";",
    "  if (c === \"q\" || c === \"Q\") dir = \"U\";",
    "  else if (c === \"a\" || c === \"A\") dir = \"D\";",
    "  else if (c === \"o\" || c === \"O\") dir = \"L\";",
    "  else if (c === \"p\" || c === \"P\") dir = \"R\";",
    "  else if (c === \" \") dir = \"S\";",
    "  if (dir) folioHoldDir(dir);",
    "  ev.rc = false;",
    "}",
    "function folioPaint() {",
    "  var mem = folioMachine.mem;",
    "  var frame = folioMachine.frame;",
    "  var border = folioMachine.border & 7;",
    "  var x, y, idx, color, field, rgb, name;",
    "  if (border !== folioBorderPrev) {",
    "    folioBorderPrev = border;",
    "    field = folioDoc.getField(\"border\");",
    "    rgb = spectrumPalette[border];",
    "    if (field) field.fillColor = [\"RGB\", rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];",
    "  }",
    "  for (y = 0; y < 24; y++) {",
    "    for (x = 0; x < 32; x++) {",
    "      idx = y * 32 + x;",
    "      color = spectrumCellColor(mem, x, y, frame);",
    "      if (folioPrev[idx] === color) continue;",
    "      folioPrev[idx] = color;",
    "      name = \"c_\" + y + \"_\" + x;",
    "      field = folioDoc.getField(name);",
    "      if (!field) continue;",
    "      rgb = spectrumPalette[color];",
    "      field.fillColor = [\"RGB\", rgb[0] / 255, rgb[1] / 255, rgb[2] / 255];",
    "    }",
    "  }",
    "}",
    "function folioFrame() {",
    "  if (folioFailed || !folioMachine) return;",
    "  try {",
    "    if (folioHoldN > 0) {",
    "      folioHoldN--;",
    "      if (folioHoldN === 0) folioRelease();",
    "    }",
    "    folioMachine.runFrame();",
    "    folioPaint();",
    "  } catch (err) {",
    "    folioFailed = true;",
    "    try { app.alert(\"folio-48 stopped: \" + err); } catch (ignore) {}",
    "  }",
    "}",
    "function folioStop() {",
    "  if (folioTimer) {",
    "    app.clearInterval(folioTimer);",
    "    folioTimer = null;",
    "  }",
    "}",
    "function folioBoot() {",
    "  if (folioTimer) return;",
    "  if (!folioDoc || typeof folioDoc.getField !== \"function\") folioDoc = this;",
    "  folioMachine = new Spectrum(null);",
    "  folioMachine.restore({",
    "    mem: FOLIO_MEM,",
    "    state: FOLIO_STATE,",
    "    border: FOLIO_BORDER,",
    "    speaker: FOLIO_SPEAKER,",
    "    frame: FOLIO_FRAME",
    "  });",
    "  folioMachine.releaseKeys();",
    "  try { folioPaint(); } catch (ignorePaint) {}",
    "  folioTimer = app.setInterval(\"folioFrame()\", 50);",
    "  try { folioDoc.setAction(\"WillClose\", \"folioStop();\"); } catch (ignore) {}",
    "  try { folioDoc.getField(\"keys\").setFocus(); } catch (ignore2) {}",
    "}",
    "folioBoot();",
    ""
  ].join("\n");
}

function pdfColor(index) {
  var rgb = spectrumPalette[index];
  return (rgb[0] / 255).toFixed(4) + " " + (rgb[1] / 255).toFixed(4) + " " + (rgb[2] / 255).toFixed(4);
}

function buildFolioPdf(options) {
  var snap = options.snapshot;
  var mem = spectrumDecode(snap.mem);
  var cell = 12;
  var screenW = 32 * cell;
  var screenH = 24 * cell;
  var pad = 16;
  var pageW = 560;
  var pageH = 760;
  var ox = (pageW - screenW) / 2;
  var oy = 214;
  var z80 = pdfAscii(options.z80Source);
  var spectrum = pdfAscii(options.spectrumSource);
  var runtime = pdfAscii(folioRuntime(snap));
  var js = "var folioDoc = this;\n" + z80 + "\n" + spectrum + "\n" + runtime;
  js = js.replace(/"use strict";/g, "");
  if (js.indexOf("\nendstream") !== -1 || js.indexOf("\rendstream") !== -1) {
    throw new Error("runtime collides with a PDF stream marker");
  }

  var borderIndex = snap.border & 7;
  var borderRgb = pdfColor(borderIndex);
  var ids = {
    border: 9,
    keys: 10,
    button0: 11
  };
  var cell0 = 16;
  var x, y, id, refs, fields;

  function cellId(cx, cy) { return cell0 + cy * 32 + cx; }

  refs = [ids.border + " 0 R", ids.keys + " 0 R"];
  for (id = 0; id < 5; id++) refs.push((ids.button0 + id) + " 0 R");
  for (y = 0; y < 24; y++) {
    for (x = 0; x < 32; x++) refs.push(cellId(x, y) + " 0 R");
  }
  fields = refs.join(" ");

  var rainbowY = oy - pad - 18;
  var rainbowW = (screenW + pad * 2) / 8;
  var rainbowX = ox - pad;
  var bands = ["0 0 0", "0 0 1", "1 0 0", "1 0 1", "0 1 0", "0 1 1", "1 1 0", "1 1 1"];
  var tapeName = (typeof spectrumTapeName === "function") ? spectrumTapeName(options.tape || "FOLIO") : "FOLIO     ";
  var tapeSafe = "";
  var tapeI, tapeC;
  for (tapeI = 0; tapeI < tapeName.length; tapeI++) {
    tapeC = tapeName.charAt(tapeI);
    tapeSafe += (tapeC === "(" || tapeC === ")" || tapeC === "\\") ? "." : tapeC;
  }
  var content = "";
  content += "0.773 0.816 0.863 rg\n0 0 " + pageW + " " + pageH + " re f\n";
  content += "BT\n/F1 42 Tf\n0.106 0.114 0.133 rg\n48 700 Td\n(folio-48) Tj\n";
  content += "/F1 13 Tf\n0 -24 Td\n(Tape name " + tapeSafe + ", ten characters, padded with spaces.) Tj\n";
  content += "0 -18 Td\n(Q up, A down, O left, P right. Space starts again.) Tj\n";
  content += "/F1 10 Tf\n0 -22 Td\n(Desktop Adobe Acrobat, or free Acrobat Reader 7.0 or later, through 2026.) Tj\n";
  content += "0 -13 Td\n(Allow JavaScript, then press Space. Web and mobile Acrobat do not run it.) Tj\n";
  content += "0 -13 Td\n(https://get.adobe.com/reader/) Tj\n";
  content += "0 -16 Td\n(The game is document JavaScript. A timer repaints the screen each frame.) Tj\n";
  content += "0 -13 Td\n(PDFium, in Chrome, Edge, and other Chromium apps, is built without that) Tj\n";
  content += "0 -13 Td\n(JavaScript engine. It draws this page and ignores the program, so Space) Tj\n";
  content += "0 -13 Td\n(does nothing. macOS Preview and Safari do the same. Firefox runs only a) Tj\n";
  content += "0 -13 Td\n(small safe piece of Acrobat JavaScript, not this timer.) Tj\nET\n";
  for (id = 0; id < 8; id++) {
    content += bands[id] + " rg\n" + (rainbowX + id * rainbowW).toFixed(2) + " " + rainbowY + " " + rainbowW.toFixed(2) + " 8 re f\n";
  }
  content += "BT\n/F1 11 Tf\n0.106 0.114 0.133 rg\n48 168 Td\n(Q, A, O, P, Space in the keys field, or the buttons.) Tj\nET\n";

  var bodies = [];
  function add(body) {
    bodies.push(body);
    return bodies.length;
  }
  function stream(dict, data) {
    return add("<< " + dict + " /Length " + data.length + " >>\nstream\n" + data + "\nendstream");
  }

  var openJs = pdfLiteral("try { folioBoot(); } catch (e) {}");
  var focusJs = pdfLiteral("try { this.getField(\"keys\").setFocus(); } catch (e) {}");
  var linkId = cell0 + 768;
  var page = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pageW + " " + pageH + "]"
    + " /Resources << /Font << /F1 5 0 R >> >>"
    + " /AA << /O << /S /JavaScript /JS " + focusJs + " >> >>"
    + " /Contents 4 0 R /Annots [" + fields + " " + linkId + " 0 R] >>";
  var acro = "<< /Fields [" + fields + "] /NeedAppearances true /DA (/F1 10 Tf 0 g)"
    + " /DR << /Font << /F1 5 0 R >> >> >>";

  add("<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /JavaScript /JS " + openJs + " >> /Names << /JavaScript << /Names [(folio) 7 0 R] >> >> >>");
  add("<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
  add(page);
  stream("", content);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  add(acro);
  add("<< /S /JavaScript /JS 8 0 R >>");
  stream("", js);

  function widget(name, rect, extra) {
    return add("<< /Type /Annot /Subtype /Widget /F 4 /Rect [" + rect.join(" ") + "] /T " + pdfLiteral(name) + " " + extra + " >>");
  }

  var bezel = [ox - pad, oy - pad, ox + screenW + pad, oy + screenH + pad];
  widget("border", bezel, "/FT /Btn /Ff 65537 /BS << /W 0 >> /MK << /BG [" + borderRgb + "] /BC [" + borderRgb + "] >>");

  var keysW = 220;
  var keysX = (pageW - keysW) / 2;
  widget("keys", [keysX, 132, keysX + keysW, 156],
    "/FT /Tx /DA (/F1 12 Tf 0 0 0 rg) /MK << /BG [1 1 1] >> /AA << /K << /S /JavaScript /JS " + pdfLiteral("folioType(event);") + " >> >>");

  var labels = [
    ["Left", "L"],
    ["Right", "R"],
    ["Up", "U"],
    ["Down", "D"],
    ["Space", "S"]
  ];
  var bw = 72;
  var bgap = 8;
  var brow = labels.length * bw + (labels.length - 1) * bgap;
  var bx = (pageW - brow) / 2;
  for (id = 0; id < labels.length; id++) {
    var rect = [bx + id * (bw + bgap), 78, bx + id * (bw + bgap) + bw, 112];
    widget(labels[id][0], rect,
      "/FT /Btn /Ff 65536 /DA (/F1 11 Tf 1 1 1 rg) /MK << /BG [0.078 0.086 0.110] /CA " + pdfLiteral(labels[id][0]) + " >>"
      + " /AA << /U << /S /JavaScript /JS " + pdfLiteral("folioHoldDir(\"" + labels[id][1] + "\");") + " >> >>");
  }

  for (y = 0; y < 24; y++) {
    for (x = 0; x < 32; x++) {
      var color = spectrumCellColor(mem, x, y, snap.frame || 0);
      var rgb = pdfColor(color);
      var left = ox + x * cell;
      var bottom = oy + (23 - y) * cell;
      widget("c_" + y + "_" + x, [left, bottom, left + cell, bottom + cell],
        "/FT /Btn /Ff 65537 /BS << /W 0 >> /MK << /BG [" + rgb + "] /BC [" + rgb + "] >>");
    }
  }

  var link = add("<< /Type /Annot /Subtype /Link /Rect [48 604 230 620] /Border [0 0 0] /A << /S /URI /URI (https://get.adobe.com/reader/) >> >>");
  if (link !== linkId) throw new Error("reader link object drifted");
  var info = add("<< /Title (folio-48) /Producer (folio-48) >>");
  if (bodies.length !== info) throw new Error("object count drifted");
  if (bodies[7].indexOf("folioBoot") < 0 && bodies[7].indexOf("folioFrame") < 0) {
    // stream object is index 7 (object 8)
  }

  var out = "%PDF-1.4\n%folio-48\n";
  var offsets = [0];
  var i;
  for (i = 0; i < bodies.length; i++) {
    offsets.push(out.length);
    out += (i + 1) + " 0 obj\n" + bodies[i] + "\nendobj\n";
  }
  var startxref = out.length;
  out += "xref\n0 " + (bodies.length + 1) + "\n";
  out += "0000000000 65535 f \n";
  for (i = 1; i < offsets.length; i++) out += pdfPad(offsets[i]) + " 00000 n \n";
  out += "trailer\n<< /Size " + (bodies.length + 1) + " /Root 1 0 R /Info " + info + " 0 R >>\n";
  out += "startxref\n" + startxref + "\n%%EOF\n";
  return out;
}

function folioShell() {
  return [
    "<!DOCTYPE html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    "<title>folio-48</title>",
    "<style>",
    ":root { color-scheme: light; --paper: #c5d0dc; --ink: #1b1d22; --bezel: #14161c; --ghost: #3c4654; }",
    "* { box-sizing: border-box; }",
    "body { margin: 0; background: var(--paper); color: var(--ink); font-family: Barlow, \"Avenir Next\", \"Trebuchet MS\", sans-serif; font-size: 18px; line-height: 1.45; }",
    "main { width: min(720px, calc(100% - 32px)); margin: 32px auto 64px; }",
    "h1 { margin: 0 0 8px; font-family: Fraunces, Palatino, \"Palatino Linotype\", serif; font-weight: 560; font-size: clamp(48px, 10vw, 72px); line-height: 0.9; letter-spacing: -0.035em; }",
    "p { margin: 0 0 14px; max-width: 38em; }",
    ".help { color: var(--ghost); }",
    ".plate { width: min(676px, 100%); background: var(--bezel); padding: 16px 16px 0; margin: 8px 0 16px; }",
    "canvas { display: block; width: 100%; height: auto; background: #000; image-rendering: pixelated; image-rendering: crisp-edges; }",
    ".rainbow { height: 8px; margin-top: 12px; background: linear-gradient(90deg, #000 0 12.5%, #00f 0 25%, #f00 0 37.5%, #f0f 0 50%, #0f0 0 62.5%, #0ff 0 75%, #ff0 0 87.5%, #fff 0 100%); }",
    ".row { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }",
    "button { font: 600 16px/1 Barlow, \"Avenir Next\", \"Trebuchet MS\", sans-serif; color: #f4f7fa; background: var(--bezel); border: 0; padding: 12px 14px; cursor: pointer; }",
    "button:focus-visible, canvas:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }",
    "#status { min-height: 1.45em; }",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    "<h1>folio-48</h1>",
    "<p>Collect the yellow leaves. Avoid the red hunter.</p>",
    "<div class=\"plate\">",
    "<canvas id=\"screen\" width=\"320\" height=\"256\" tabindex=\"0\" aria-label=\"Folio, running on a ZX Spectrum 48K\"></canvas>",
    "<div class=\"rainbow\"></div>",
    "</div>",
    "<p class=\"help\">Q up, A down, O left, P right. Space starts again.</p>",
    "<div class=\"row\">",
    "<button type=\"button\" data-key=\"5,1\">Left</button>",
    "<button type=\"button\" data-key=\"5,0\">Right</button>",
    "<button type=\"button\" data-key=\"2,0\">Up</button>",
    "<button type=\"button\" data-key=\"1,0\">Down</button>",
    "<button type=\"button\" data-key=\"7,0\">Space</button>",
    "</div>",
    "<button type=\"button\" id=\"savepdf\">Save Acrobat PDF</button>",
    "<p id=\"status\">This machine is running. Space starts the game.</p>",
    "</main>",
    "<script>",
    "FOLIO_SCRIPT",
    "</script>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

function buildFolioHtml(options) {
  var script = [
    options.z80Source,
    options.spectrumSource,
    options.playSource,
    "var FOLIO_SNAPSHOT = " + JSON.stringify(options.snapshot) + ";",
    "var FOLIO_PDF = " + JSON.stringify(options.pdf) + ";",
    "machine = new Spectrum(null);",
    "machine.restore(FOLIO_SNAPSHOT);",
    "machine.releaseKeys();",
    "folioPlay(machine);",
    "var savePdf = document.getElementById(\"savepdf\");",
    "if (savePdf) {",
    "  savePdf.addEventListener(\"click\", function () {",
    "    var blob = new Blob([FOLIO_PDF], { type: \"application/pdf\" });",
    "    var link = document.createElement(\"a\");",
    "    link.href = URL.createObjectURL(blob);",
    "    link.download = \"folio-48.pdf\";",
    "    document.body.appendChild(link);",
    "    link.click();",
    "    link.remove();",
    "  });",
    "}"
  ].join("\n");
  script = script.replace(/<\/script/gi, "<\\/script");
  if (/<\/script/i.test(script)) throw new Error("pressed page would close its own script");
  var page = folioShell().replace("FOLIO_SCRIPT", script);
  if (page.indexOf("FOLIO_SCRIPT") !== -1) throw new Error("pressed page lost its script");
  return page;
}
