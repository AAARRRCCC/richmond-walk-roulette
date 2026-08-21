// The memo contract, as a command.
//
//   node scripts/verify-signature.mjs
//
// The checks themselves live in `src/app/signature.test.ts`, because they are
// assertions over pure functions and that is what `node --test` is for - and
// because a check that only runs when somebody remembers to run a script is a
// check that stops running. `npm test` covers it on every gate.
//
// This exists so the thing has a name you can type at the moment you are
// suspicious, which is usually the moment spinning has stopped working and
// nothing has thrown. What it is looking for:
//
//   a rule signature that changes per render -> the memo misses -> a fresh
//   `included` array -> `candidateKey` churns -> App's spin-abort effect fires
//   mid-throw -> the Spin button does nothing, forever, silently.
//
// Every chunk from 3 onward that contributes a `PoolRule` adds its case to the
// REGISTERED table in that test file. A rule that is not in the table fails.
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--test", "src/app/signature.test.ts"], {
  stdio: "inherit",
});

child.on("close", (code) => {
  if (code !== 0) {
    console.error("\nverify-signature: the pool memo contract does not hold");
  }
  process.exitCode = code ?? 1;
});
