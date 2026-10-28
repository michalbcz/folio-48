function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function loadText(url, done) {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) done(null, xhr.responseText);
    else done(new Error("Could not read " + url));
  };
  xhr.onerror = function () {
    done(new Error("Open this page from a local server, then press again."));
  };
  xhr.send();
}

function downloadText(name, type, text) {
  var blob = new Blob([text], { type: type });
  var link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function pressMachine() {
  ensureAudio();
  setStatus("Pressing this machine…");
  loadText("vendor/Z80.js", function (err, z80Source) {
    if (err) { setStatus(err.message); return; }
    loadText("src/spectrum.js", function (err2, spectrumSource) {
      if (err2) { setStatus(err2.message); return; }
      var pdf, snap;
      try {
        snap = machine.snapshot();
        pdf = buildFolioPdf({
          z80Source: z80Source,
          spectrumSource: spectrumSource,
          snapshot: snap,
          tape: currentTape
        });
      } catch (fail) {
        setStatus(fail.message);
        return;
      }
      downloadText("folio-48.pdf", "application/pdf", pdf);
      setStatus("Saved folio-48.pdf. The tape name in it is " + currentTape.replace(/ +$/, "") + ". Open it in desktop Acrobat or Reader 7.0 or later and allow JavaScript. PDFium in Chrome only shows the picture.");
    });
  });
}

var currentTape = "FOLIO     ";
var currentId = "FOLIO";

function renderTape(name) {
  var tape = spectrumTapeName(name);
  var box = document.getElementById("tape");
  var label = "Spectrum tape name";
  var i, ch, cell;
  currentTape = tape;
  box.textContent = "";
  for (i = 0; i < 10; i++) {
    ch = tape.charAt(i);
    cell = document.createElement("span");
    if (ch === " ") {
      cell.className = "pad";
      cell.textContent = "\u00b7";
      label += " space";
    } else {
      cell.textContent = ch;
      label += " " + ch;
    }
    box.appendChild(cell);
  }
  box.setAttribute("aria-label", label);
}

var launchToken = 0;

function showRunning(id, blurb) {
  var buttons = document.querySelectorAll("[data-program]");
  var prog = id ? spectrumProgram(id) : null;
  var controls = (prog && prog.controls) ? prog.controls : "Q up, A down, O left, P right. Space starts again.";
  var i;
  document.getElementById("blurb").textContent = blurb;
  document.getElementById("controls").textContent = controls;
  document.getElementById("screen").setAttribute("aria-label", "Program " + currentTape + " on a ZX Spectrum 48K");
  currentId = id || "";
  for (i = 0; i < buttons.length; i++) {
    if (buttons[i].getAttribute("data-program") === currentId) buttons[i].setAttribute("aria-pressed", "true");
    else buttons[i].removeAttribute("aria-pressed");
  }
}

function startProgram(id) {
  var prog = spectrumProgram(id);
  var token, parsed;
  if (!prog) return;
  token = ++launchToken;
  try { ensureAudio(); } catch (ignore) {}
  renderTape(prog.tape);
  showRunning(prog.id, prog.blurb);
  if (prog.image) {
    setStatus("Starting Castaway…");
    setTimeout(function () {
      if (token !== launchToken) return;
      parsed = parseSpectrumImage(prog.image(), prog.filename);
      if (!parsed.ok) {
        setStatus(parsed.note);
        return;
      }
      machine = mountSpectrumImage(parsed);
      folioPlay(machine);
      setStatus(parsed.note);
    }, 30);
    return;
  }
  machine = new Spectrum(prog.build());
  folioPlay(machine);
  setStatus("");
}

function readLocalImage(file) {
  var reader = new FileReader();
  reader.onload = function () {
    var view = new Uint8Array(reader.result);
    var bytes = [];
    var i, parsed;
    for (i = 0; i < view.length; i++) bytes.push(view[i]);
    launchToken++;
    parsed = parseSpectrumImage(bytes, file.name);
    if (!parsed.ok) {
      setStatus(parsed.note);
      return;
    }
    try { ensureAudio(); } catch (ignore) {}
    renderTape(parsed.program);
    showRunning("", parsed.blurb);
    machine = mountSpectrumImage(parsed);
    folioPlay(machine);
    setStatus(parsed.note);
  };
  reader.onerror = function () {
    setStatus("Could not read that file.");
  };
  reader.readAsArrayBuffer(file);
}

document.getElementById("press").addEventListener("click", pressMachine);

document.getElementById("programs").addEventListener("click", function (event) {
  var id = event.target.getAttribute && event.target.getAttribute("data-program");
  if (id) startProgram(id);
});

document.getElementById("load").addEventListener("click", function () {
  document.getElementById("image").click();
});

document.getElementById("image").addEventListener("change", function () {
  var file = this.files && this.files[0];
  if (file) readLocalImage(file);
  this.value = "";
});

var plate = document.querySelector(".plate");
plate.addEventListener("dragover", function (event) { event.preventDefault(); });
plate.addEventListener("drop", function (event) {
  var files;
  event.preventDefault();
  files = event.dataTransfer && event.dataTransfer.files;
  if (files && files.length) readLocalImage(files[0]);
});

try {
  startProgram("FOLIO");
} catch (err) {
  setStatus(err.message);
  throw err;
}
