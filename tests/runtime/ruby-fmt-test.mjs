// Test harness for the Ruby Prettier printer (src/format/ruby-printer.ts).
// Loads @ruby/prism via the WASI shim, injects the parse fn into makeRubyPlugin, then formats a
// set of representative snippets and asserts: (1) the output re-parses with zero errors, and
// (2) formatting is idempotent (format(format(x)) === format(x)). Prints before/after samples.
//
// Run: node tests/runtime/ruby-fmt-test.mjs   (from the repo root)
//
// The TS printer is consumed directly via a tiny esbuild transform so we don't depend on the app
// build. If esbuild transform isn't desired, the printer is plain enough to import after `tsc`.

import { readFile } from "node:fs/promises";
import { WASI, OpenFile, File, ConsoleStdout } from "@bjorn3/browser_wasi_shim";
import { parsePrism } from "@ruby/prism/src/parsePrism.js";
import { writeFile, unlink } from "node:fs/promises";
import { format } from "prettier";
import { build } from "esbuild";

// --- load prism ---
const bytes = await readFile("node_modules/@ruby/prism/src/prism.wasm");
const wasi = new WASI(
  [],
  [],
  [new OpenFile(new File([])), ConsoleStdout.lineBuffered(() => {}), ConsoleStdout.lineBuffered(() => {})]
);
const instance = await WebAssembly.instantiate(await WebAssembly.compile(bytes), {
  wasi_snapshot_preview1: wasi.wasiImport,
});
wasi.initialize(instance);
const parse = (src, opts = {}) => parsePrism(instance.exports, src, opts);

// --- load the TS printer via esbuild (bundle to a data: URL ESM module) ---
const built = await build({
  entryPoints: ["src/format/ruby-printer.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  write: false,
  external: ["prettier"],
});
// Write the bundle to a temp file in-repo so node resolves the external `prettier` import from
// node_modules (a data: URL module can't resolve bare specifiers).
const tmpPath = new URL("./_ruby-printer.bundle.mjs", import.meta.url);
await writeFile(tmpPath, built.outputFiles[0].text);
let mod;
try {
  mod = await import(tmpPath.href);
} finally {
  await unlink(tmpPath).catch(() => {});
}
const { makeRubyPlugin } = mod;

const plugin = makeRubyPlugin(parse);

async function fmt(src) {
  return format(src, { parser: "ruby", plugins: [plugin] });
}

// --- snippets ---
const snippets = {
  "def with all param kinds": `def foo(a, b = 1, *rest, k:, m: 2, **kw, &blk)
  return a + b
end`,

  "class with methods + superclass": `class Animal < Base
  def initialize(name)
    @name = name
  end

  def speak
    puts @name
  end
end`,

  "module with constant + method": `module Greeter
  GREETING = "hi"

  def self.shout
    puts GREETING
  end
end`,

  "method call with block (brace)": `[1, 2, 3].each { |x| puts x }`,

  "method call with do/end block": `users.each do |user|
  puts user.name
  user.save
end`,

  "if / elsif / else": `if score > 90
  grade = "A"
elsif score > 80
  grade = "B"
else
  grade = "C"
end`,

  "unless": `unless valid?
  raise "nope"
end`,

  "while loop": `while running
  tick
end`,

  "case / when": `case status
when :ok
  proceed
when :warn, :error
  halt
else
  ignore
end`,

  "hash and array literals": `config = { host: "localhost", "port" => 8080, retries: 3 }
list = [1, 2, 3, "four"]`,

  "string interpolation": `name = "world"
puts "hello #{name}, today is #{Time.now}"`,

  "mixed real-ish code": `class Calculator
  def initialize
    @total = 0
  end

  def add(*values)
    values.each do |v|
      @total += v
    end
    @total
  end

  def describe
    "total is #{@total}" if @total > 0
  end
end`,

  "comments everywhere": `# file header comment
require "json"

# Greeter does things.
class Greeter
  # the greeting
  GREETING = "hi"

  def greet(name)
    # build message
    msg = "#{GREETING}, #{name}"
    puts msg # trailing
  end
end
# trailing file comment`,

  "comment between statements": `a = 1
# explain b
b = 2

c = 3`,

  "ternary / safe-nav / ranges": `label = ok ? "yes" : "no"
chain = obj&.foo&.bar
slice = list[1..5]
x = a && b || c`,

  "messy spacing normalizes": `def   add(a,b)
  a+b
end`,
};

// --- run ---
let failures = 0;
let shownSamples = 0;

for (const [label, src] of Object.entries(snippets)) {
  let out, out2;
  try {
    out = await fmt(src);
  } catch (e) {
    console.log(`FAIL  [${label}] format threw: ${e.message}`);
    failures++;
    continue;
  }

  const reparse = parse(out);
  const validOut = reparse.errors.length === 0;

  try {
    out2 = await fmt(out);
  } catch (e) {
    console.log(`FAIL  [${label}] reformat threw: ${e.message}`);
    failures++;
    continue;
  }
  const idempotent = out2 === out;

  // No comment may be dropped: count `# ...` comments via prism in input vs output.
  const inComments = parse(src).comments.length;
  const outComments = reparse.comments.length;
  const commentsKept = outComments >= inComments;

  const ok = validOut && idempotent && commentsKept;
  if (!ok) failures++;

  const status = ok ? "PASS" : "FAIL";
  const flags = [];
  if (!validOut) flags.push(`reparse errors=${reparse.errors.length}`);
  if (!idempotent) flags.push("NOT idempotent");
  if (!commentsKept) flags.push(`COMMENTS LOST (${inComments} -> ${outComments})`);
  console.log(`${status}  [${label}]${flags.length ? "  -> " + flags.join(", ") : ""}`);

  if (!ok) {
    console.log("  --- input ---\n" + indent(src));
    console.log("  --- output ---\n" + indent(out));
    if (!idempotent) console.log("  --- reformatted ---\n" + indent(out2));
    if (!validOut) {
      console.log("  --- reparse errors ---");
      for (const er of reparse.errors) console.log("    " + JSON.stringify(er.message || er));
    }
  } else if (shownSamples < 3) {
    shownSamples++;
    console.log("  --- input ---\n" + indent(src));
    console.log("  --- output ---\n" + indent(out));
  }
}

function indent(s) {
  return s
    .split("\n")
    .map((l) => "    | " + l)
    .join("\n");
}

console.log(`\n${Object.keys(snippets).length - failures}/${Object.keys(snippets).length} snippets passed.`);
if (failures > 0) {
  console.log(`${failures} FAILURE(S).`);
  process.exit(1);
} else {
  console.log("All snippets: valid output + idempotent.");
}
