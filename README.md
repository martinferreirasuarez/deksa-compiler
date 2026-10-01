# Pokémon FireRed Déksa

Create a game with your own seed at **[pokemondeksa.com](https://pokemondeksa.com)**.
The website includes the game guide, changes from FireRed and [playing instructions](https://pokemondeksa.com/play).

Bring your own unmodified English FireRed 1.0 ROM. The original file stays on
your device; your browser prepares and downloads the finished `.gba` game.
This repository contains source code and rules, **not ROMs or save files**.

## Run the builder on your own computer

1. Install and open [Docker Desktop](https://docs.docker.com/desktop/) on Windows
   or macOS. On Linux, install Docker Engine with the Compose plugin.
2. Download this repository as a ZIP and extract it.
3. Open `iniciar-windows.bat` on Windows, `iniciar-mac.command` on macOS,
   or run `bash iniciar-linux.sh` on Linux.
4. Open `http://127.0.0.1:52655`, select your original ROM and choose a seed.
   There is no login. Download the finished game and open it in a GBA emulator.

The first setup requires internet and may take several minutes. Builds then
run on your computer. The Docker service is bound to localhost; it does not
publish your computer to the internet. Stop it with `docker compose down`.
The container uses Linux x86-64, including emulation on Apple Silicon Macs.
The Docker route has been tested on Linux; real Windows/macOS testing remains
separate from browser layout checks.

## Manual setup

With Node.js 20+, Python 3, make, GCC/G++, Git, `arm-none-eabi` binutils and
the [FireRed build dependencies](https://github.com/pret/pokefirered/blob/master/INSTALL.md):

```sh
bash ./setup.sh
bash ./start.sh
```

Setup fetches fixed revisions of `pret/pokefirered` and `pret/agbcc` and applies
Déksa's source changes. It does not overwrite existing source directories.
The builder runs one job at a time with a bounded, persistent waiting list.
Repeated seeds reuse prepared results for the same game version.

## Report a problem

[Open an issue](https://github.com/martinferreirasuarez/deksa-compiler/issues/new)
with the game version, seed, emulator, device and steps to reproduce it.
Screenshots help. Do not upload original ROMs or generated ROMs.

## Credits and license

- [pret/pokefirered](https://github.com/pret/pokefirered): FireRed source foundation.
- [pret/agbcc](https://github.com/pret/agbcc): compiler.
- [ROM Patcher JS](https://github.com/marcrobledo/RomPatcher.js): browser patch processing.
- New compiler code uses [MIT](compiler/LICENSE). That license does not cover
  the original game's code or assets; their notices and provenance are separate.

Déksa is a fan-made FireRed modification, not affiliated with Nintendo,
Game Freak or The Pokémon Company. Pokémon belongs to its respective owners.
