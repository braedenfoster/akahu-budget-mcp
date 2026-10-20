# Contracts

Example responses from `GET /api/spending-allowance`, one per state: `ok`, `over`, `no_budget`, `stale`, and `no_bills_today`.
Each response also has a `bills` block (the Bills view). In `no_bills_today`, no Bill occurrence is due today and `next_upcoming` is set.
The server test `test/20-contract-fixtures.test.ts` generates each file from the real route, with a fixed clock and seeded data.
The Android unit tests parse the same files.

- `pnpm test` compares each generated response with the committed file. A difference fails the test.
- `UPDATE_CONTRACTS=1 pnpm test` writes the files. Run it after you change the response shape, then commit the files with the change.

Do not edit these files by hand.
