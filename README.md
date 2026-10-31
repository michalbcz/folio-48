# folio-48

Play a ZX Spectrum 48K in the browser, then press that machine into a PDF that still runs in Adobe Acrobat.

The page is the machine: a Z80, 16K of ROM, 48K of RAM, the screen, the border, the keyboard and the beeper. folio-48 is that machine. The program it runs first is named FOLIO. On a ZX Spectrum tape, the program name is ten characters, padded with spaces, so the header reads FOLIO and then five spaces. Collect the yellow leaves. The red hunter follows. Q is up, A is down, O is left, P is right, and Space starts again. After a moment it plays itself until you touch a direction.

DRIFT and PIPS are two more original programs in the same ROM, with those ten-character tape names. Dodge the red cell, or take the yellow pip. They are not commercial games.

Castaway is a 48K game by Juan J. Martínez, 2016. The tape header spells it castawy and then three spaces, which is the filename he published. At its menu, press 1 for the keyboard. O moves left, P moves right, Q jumps, and Space fires. The playable tape is the one from [his page](https://www.usebox.net/jjm/castaway/), redistributed under the notice in `vendor/castaway/README.txt` (Copyright 2016 Juan J. Martínez). His separate source tree is GPL-3.0, with those assets under CC-BY-SA: [reidrac/castaway-zx](https://github.com/reidrac/castaway-zx). This project ships the tape, not that source tree.

The 48K Sinclair ROM is included so a tape or a snapshot can call it. Copyright 1982 Sinclair Research Ltd, later held by Amstrad. On 31 August 1999 Cliff Lawson of Amstrad wrote that emulator authors may redistribute the ROM if the copyright messages inside it are not altered, and that the ROM itself is not for sale. Amstrad have kindly given their permission for the redistribution of their copyrighted material but retain that copyright. FOLIO, DRIFT and PIPS do not use that ROM. They use the small ROM written for this project. The ROM bytes are in `src/rom.js`. SHA1 `5ea7c2b824672e914525d1d5c419d71b84a426a2`.

Load a Spectrum image reads a `.z80`, `.sna`, `.tap`, `.tzx`, `.scr` or `.rom` file from this computer. Nothing is uploaded. You can also drop the file on the screen. A tape whose BASIC loader says CLEAR and RANDOMIZE USR is started there, after the Sinclair ROM has set up the machine. If that USR routine only loads more bytes through the ear, it is skipped: this machine does not play tape tones, so the largest CODE block is started instead. That is how Castaway begins. When the running program later calls the ROM loader, the next matching block still in the file is copied into RAM. That is how a multi-part tape, such as a game that loads a scenario after its menu, continues. A snapshot runs with the Sinclair ROM. A BASIC program with no machine-code entry is refused. A `.scr` file is the picture only. A 128K `.z80` is shown as the 48K that was paged in. A 128K `.sna` is not loaded. Press still writes whatever is on the machine now, and the PDF names that ten-character program.

Press into a PDF writes the machine as it is now, mid-game if you are mid-game. The picture is the Spectrum screen. The program is document JavaScript: on open it restores that machine, focuses the keys field, and runs a frame about every 50 ms with `app.setInterval`. Space starts the game. Q, A, O, P and the buttons along the bottom are the same keys.

That script runs in desktop Adobe Acrobat and in the free desktop Acrobat Reader, version 7.0 or later, including the current continuous builds through 2026. `app.setInterval` has been in the desktop API since Acrobat 5.0, and since Reader 7.0.5 the timer ends when the document closes. Turn JavaScript on (Settings or Preferences, JavaScript, Enable Acrobat JavaScript). If a bar asks whether to trust the document, allow it, then press Space. The download is [https://get.adobe.com/reader/](https://get.adobe.com/reader/). Acrobat on the web and the mobile Reader apps do not run this script.

PDFium does not run it. Chrome, Edge, and the other Chromium browsers display a PDF with PDFium, and the copies shipped in those browsers are built without a JavaScript engine. The OpenAction, the document script, the button actions, and the keystroke script stay in the file and are never executed. PDFium still paints the page, which is why the Spectrum screen is visible and Space does nothing. macOS Preview and Safari use PDFKit and likewise only draw the page. Firefox’s viewer is PDF.js: it runs a small safe fragment of Acrobat JavaScript, such as alerts and some form calculations, and it does not implement this timer or the field repaint, so the game stays still there too.

```
python3 -m http.server 8080
```

Then open http://localhost:8080.

The Z80 interpreter in `vendor/Z80.js` is Molly Howell's, under the MIT license in `vendor/LICENSE`, with the small changes noted at the top of the file.
