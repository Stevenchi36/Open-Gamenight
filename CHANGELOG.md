# Changelog

Each release is tagged `v<version>` and published on GitHub with its section below as the notes. Versions follow [semver](https://semver.org/); while they start with `0.`, any minor release may include breaking changes. Changes that affect self-hosters (new required settings, removed options) are listed under **Hosting**, and changes to what a game module supplies under **Game API**.

## [Unreleased]

### Game API

- The game boundary is enforced: lint fails on imports of other `@ogn/*` packages or paths into `apps/`/`packages/`, and a test fails on relative imports that leave the game's folder.
- A test checks every game ships `DESIGN.md` (with a Watch page section), `RULES.md`, `rules`, `needsAction`, a `SpectatorView` and `useAnnounce` in its `PlayView`, `WinCelebration` (and `LoseReveal` for a game about a loser) on both views unless it has no game winner, and is registered under its folder name.

## [0.1.0] - 2026-10-30

The first release.

- **Games:** Word Imposter, Flock, Ballpark, Color Mix and In Order (party games); Liar's Dice, Cheat, Last Card, Gone Fishin' and Old Maid (cards and dice); Tic-Tac-Toe, Drop Line and Dots and Boxes (board games).
- **Rooms:** 4-letter codes, guests join with a name, reconnect into the same seat, host handover, kicks, a How to play dialog per game, and a watch page for a TV.
- **Secrecy:** each phone receives only its own view of the game, checked by a leak test for every game with hidden information.
- **Admin panel:** accounts (no public sign-up), turning games off and on, per-game categories and the word, question and theme libraries, optional Claude-powered generation under a daily token cap, open rooms, and an update notice.
- **Accounts:** passwords and passkeys, admin password resets, and recovery codes from a server command.
- **MCP server** for managing the libraries from Claude Code or Claude Desktop.
- **Hosting:** Docker image for amd64 and arm64, or Node 26 with `npm run deploy`; guide in `docs/self-hosting.md`.
- **Releases:** Docker images are tagged per release (`latest`, `0.1.0`, `0.1`), with `main` for the newest commit on `main`. The admin Overview now compares with the latest release instead of `main`'s newest commit.
