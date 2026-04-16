# Quoth

For project orientation (stack, build/test commands, architecture, entry
points), see [ONBOARDING.md](./ONBOARDING.md).

## Conventions

- Hexagonal architecture: `src/core/` stays pure -- no browser API imports.
  Browser and YouTube side effects live in `src/adapters/` behind the
  interfaces in `src/ports/`. Adding a browser API call to `core/` is a
  structural regression.
- Red/green testing: write a failing test before implementing, then make it pass.
- All commits must pass `just check`.
- After refactoring browser integration code, also run `just smoke-test` --
  unit tests can miss cross-browser bugs (e.g., fetch binding issues caught
  only by the Chromium smoke test).
