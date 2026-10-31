# folio-48

**A ZX Spectrum 48K you can export to a PDF—and keep playing in Adobe Acrobat.**

Play in your browser, click **Press into a PDF**, and take the running machine with you. The exported document contains the emulator and your current game state, so you can carry on inside a PDF reader. Finally, a document with a good reason to miss its deadline.

> [NSFW](https://en.wikipedia.org/wiki/Not_safe_for_work): Not Safe For Work… productivity. Just retro games and questionable uses of office software.

## Try it

From the project directory, run:

```sh
python3 -m http.server 8080
```

Open [localhost:8080](http://localhost:8080). No build step or package installation needed.

1. Play **FOLIO**, or choose another game. For **Castaway**, press Space to leave the intro, then **1** at its menu to select keyboard mode and start the game **in the browser before exporting**. The PDF cannot enter the menu's `1` key.
2. Click **Press into a PDF** to download the machine in its current state—even mid-game.
3. Open the downloaded file in **desktop Adobe Acrobat or the free desktop Acrobat Reader**.
4. Enable Acrobat JavaScript in Settings/Preferences → JavaScript → Enable Acrobat JavaScript. If Acrobat asks whether to trust this document, allow it for your generated file.
5. Use **Q / A / O / P** for up / down / left / right, and **Space** to start again in FOLIO. The PDF also has on-page control buttons. If typing does nothing, click its keys field.

Need the reader? [Download Adobe Acrobat Reader](https://get.adobe.com/reader/).

**Use desktop Acrobat for the exported game.** Browser PDF viewers, macOS Preview, and web/mobile Acrobat are not supported by this export; they may show the picture without running the game. Other PDF experiments below use different viewer features, so their compatibility can differ.

## What's on the tape?

| Program | What you're doing | Controls |
| --- | --- | --- |
| **FOLIO** | Collect yellow leaves while a red hunter follows you. It plays itself until you take over. | Q/A/O/P to move; Space to restart |
| **DRIFT** | Dodge the red cell. | Q/A/O/P; Space |
| **PIPS** | Chase the yellow pip. | Q/A/O/P; Space |
| **Castaway** | Explore an alien planet in Juan J. Martínez's 2016 Spectrum game. | At the menu press 1 for keyboard; O/P to move, Q to jump, Space to fire |

FOLIO, DRIFT, and PIPS are original programs made for this project. Castaway is bundled with its author's permission notice; see [third-party notices](THIRD_PARTY_NOTICES.md).

## How does a PDF become a game?

The browser runs a JavaScript Z80 interpreter with 48K of RAM, a screen, keyboard, border, and beeper. Export captures the memory and CPU state, then packs that snapshot and the emulator into PDF document JavaScript.

In Acrobat, a timer advances the machine roughly every 50 ms. A grid of **32 × 24 PDF form fields** acts as the display, and a text field and buttons feed in key presses. It's a deliberately chunky rendering of the Spectrum screen; the PDF isn't a full-fidelity replacement for the browser emulator. The PDF controls expose Q/A/O/P and Space rather than the full Spectrum keyboard.

Yes, the form fields have unionized into a games console.

## Bring your own Spectrum files

Click **Load a Spectrum image**, or drop a file onto the screen. Files are read locally; nothing is uploaded.

Supported formats: `.z80`, `.sna`, `.tap`, `.tzx`, `.scr`, and `.rom`.

A few limits before you dig out the whole tape collection:

- Tape loading handles supported machine-code loaders and later ROM-loader calls, rather than playing tape audio. BASIC-only programs without a machine-code entry are refused.
- A `.scr` file loads a picture, not a game.
- A 128K `.z80` uses only the currently paged-in 48K; 128K `.sna` files are not supported.
- Imported games may need keys beyond those available in the PDF. Start them in the browser before exporting when necessary.

The PDF filename follows the loaded program's Spectrum tape name. Those names have ten characters: FOLIO and then five spaces, for example. Castaway uses `castawy` followed by three spaces. The little dots in the browser are padding spaces, not a secret code.

## More documents behaving badly

There are other wonderful ways to make a PDF reader reconsider its career:

- [pdftris — Thomas Rinsma](https://github.com/ThomasRinsma/pdftris): Tetris rendered with PDF form fields and text-field input. His [write-up](https://th0mas.nl/2025/01/12/tetris-in-a-pdf/) explains the trick.
- [DoomPDF — ading2210](https://github.com/ading2210/doompdf): Doom (1993) running inside a PDF. Of course someone asked whether it runs Doom.
- [LinuxPDF — ading2210](https://github.com/ading2210/linuxpdf): Linux inside a PDF through a RISC-V emulator. For when your document needs an operating system.

These are related projects, not dependencies. folio-48's particular party trick is exporting a running Spectrum from the browser into a playable Acrobat document.

## Credits and license

Created with **Grok 4.7**, with the project author assisting it along the way. Human curiosity, AI coding, and a PDF reader caught in the middle.

The original code and documentation are released under [The Unlicense](LICENSE): use, change, share, or sell them, with no attribution requirement and no warranty. Do whatever you like with our bits.

Bundled third-party code and data retain their own terms, including the Z80 interpreter, Castaway tape, and Sinclair ROM. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the scope and existing license files. The bundled Sinclair ROM has SHA-1 `5ea7c2b824672e914525d1d5c419d71b84a426a2`.

For the automated checks, run:

```sh
node test/run.js
```
