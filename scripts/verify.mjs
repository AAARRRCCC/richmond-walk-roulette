// The gate. One command that answers "is this repo healthy".
//
//   npm run verify [-- --json]
//
// Runs in this order and stops at the first failure, because a later stage's
// output is noise once an earlier one is red - and because the order is
// cheapest-first, so the fastest signal arrives soonest.
//
// `npm run build` is in the list even though typecheck already ran: tsc
// --noEmit misses bundler-only failures, and a repo that typechecks and does
// not build is a repo nobody can ship.
//
// verify-places needs a reachable Valhalla instance, so this whole command
// does. That is deliberate. The alternative is a gate that passes on a machine
// which cannot route, which is the machine most likely to be lying to you.
import { spawn } from "node:child_process";

const asJson = process.argv.includes("--json");

const STEPS = [
  { name: "typecheck", command: "npm", args: ["run", "typecheck"] },
  { name: "lint", command: "npm", args: ["run", "lint"] },
  { name: "test", command: "npm", args: ["test"] },
  { name: "build", command: "npm", args: ["run", "build"] },
  { name: "bundle", command: process.execPath, args: ["scripts/verify-bundle.mjs"] },
  { name: "places", command: process.execPath, args: ["scripts/verify-places.mjs"] },
];

function run(step) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(step.command, step.args, {
      // npm resolves through a shell script on Windows, so it needs one; node
      // must not get one, because its own path contains a space and a shell
      // splits on it. Two spawn shapes rather than one that is wrong half the
      // time.
      shell: step.command === "npm" && process.platform === "win32",
      stdio: asJson ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolve({ ...step, code, ms: Date.now() - started, output }));
  });
}

const results = [];
let ok = true;

for (const step of STEPS) {
  if (!asJson) console.log(`\n=== ${step.name} ===`);
  const result = await run(step);
  results.push({ name: result.name, code: result.code, ms: result.ms });
  if (result.code !== 0) {
    ok = false;
    if (asJson) results[results.length - 1].output = result.output;
    else console.error(`\nverify: ${step.name} failed with exit code ${result.code}`);
    break;
  }
}

if (asJson) {
  console.log(JSON.stringify({ ok, steps: results }, null, 2));
} else if (ok) {
  const total = results.reduce((sum, result) => sum + result.ms, 0);
  console.log(`\nverify: all ${results.length} steps clean in ${(total / 1000).toFixed(1)}s`);
}

process.exitCode = ok ? 0 : 1;
