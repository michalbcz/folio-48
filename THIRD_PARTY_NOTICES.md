# License scope and third-party notices

The root [LICENSE](LICENSE) (The Unlicense) applies to the original folio-48 code and documentation, including the original FOLIO, DRIFT, and PIPS programs and the small ROM written for them. It does not relicense the third-party material listed below, including data embedded in otherwise original source files.

## Z80 interpreter

`vendor/Z80.js` is Molly Howell's Z80 interpreter, distributed under the MIT license in [vendor/LICENSE](vendor/LICENSE). Local changes are noted at the top of the source file. Preserve its copyright and permission notice when redistributing it.

## Castaway

Castaway is Copyright © 2016 Juan J. Martínez. The tape from [the author's game page](https://www.usebox.net/jjm/castaway/) is embedded in `src/castaway.js`. Its accompanying MIT-style permission and warranty notice is preserved in that source file and in [vendor/castaway/README.txt](vendor/castaway/README.txt). Preserve that notice when redistributing the tape.

The author's [separate source repository](https://github.com/reidrac/castaway-zx) uses GPL-3.0 for its source and CC-BY-SA for its assets. This project bundles the published tape under its accompanying notice, not that separate source tree.

## Sinclair ZX Spectrum 48K ROM

The Sinclair ROM bytes embedded in `src/rom.js` are Copyright 1982 Sinclair Research Ltd., later held by Amstrad. They are not covered by The Unlicense.

The existing source notice records permission given by Cliff Lawson of Amstrad on 31 August 1999 for emulator authors to redistribute the ROM provided its internal copyright messages remain unchanged and the ROM itself is not sold. The copyright is retained by its owner; this is redistribution permission, not a public-domain dedication. See the header of `src/rom.js` for the bundled notice.

ROM SHA-1: `5ea7c2b824672e914525d1d5c419d71b84a426a2`.

## Exported PDFs

An exported PDF embeds the Z80 interpreter and a machine snapshot. It can therefore contain third-party code and ROM or game data as well as original folio-48 code. The root Unlicense does not override the terms for those components or for games you import yourself. Keep applicable notices with redistributed exports.
