# Contract provenance

`jellyfin-openapi-stable.json` is the executable API contract for deadfin-web.

- **Source**: the Jellyfin **v12.0.0** stable OpenAPI document (294 paths /
  364 operations / 357 schemas).
- **Copied**: 2026-07-29, unmodified.
- **SHA-256**: `897c42a2c5a9ba227467e8804f3042be7d1979db8dcae50060059379c7838003`
- Pinned upstream trees this corresponds to:
  - `jellyfin/jellyfin` @ `b04614e18d2aeed8d3d3de920c381c6bd5b97bdb`
  - `jellyfin/jellyfin-web` @ `f6ed7e61647569ff4098dc22a67953a10d32b2a4` (v12.0.0)

Rules:

1. This file changes **only** when the project deliberately re-pins the contract, in
   its own reviewed PR, updating the hash above.
2. `src/api/schema.d.ts` is generated from this spec via `npm run gen:api` and is
   committed for reproducible builds; regenerate after any re-pin and commit the diff.
3. The spec constrains shapes, not behaviour. Where behaviour is ambiguous, upstream
   jellyfin-web at the pinned tree is the behavioral reference, and divergences worth
   recording go to the Deadfin server's `docs/divergences.md`.
