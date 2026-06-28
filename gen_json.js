const fs = require("fs");
const path = require("path");

const text = fs.readFileSync(path.join(__dirname, "build_data.py"), "utf8");
const block = text.match(/RADICALS = \[([\s\S]*?)\n\]/)[1];
const re = /\("([^"]*)", "([^"]*)", (\d+), "([^"]*)", "([^"]*)", "((?:[^"\\]|\\.)*)"\)/g;

const out = [];
let m;
while ((m = re.exec(block)) !== null) {
  out.push({
    id: out.length + 1,
    char: m[1],
    variants: m[2],
    strokes: Number(m[3]),
    cn: m[4],
    jp: m[5],
    ru: m[6],
  });
}

if (out.length !== 214) throw new Error(`Expected 214, got ${out.length}`);

fs.mkdirSync(path.join(__dirname, "data"), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, "data", "radicals.json"),
  JSON.stringify(out, null, 2),
  "utf8"
);
fs.writeFileSync(
  path.join(__dirname, "js", "radicals.js"),
  `export default ${JSON.stringify(out, null, 2)};\n`,
  "utf8"
);
console.log(`Wrote ${out.length} radicals`);
