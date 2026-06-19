// One-off codemod: raise tiny font sizes to a readable floor across the app.
// Excludes PDF components (their font sizes are print points, not screen px).
import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = "src";
const EXCLUDE = /PDF\.tsx$/; // QuotationPDF, BOQTemplatePDF, ConsultancyPDF, InvoicePDF

// floor map: anything smaller becomes at least this size
const mapPx = (n) => {
  if (n <= 11) return 12;
  if (n === 12) return 13;
  return n; // 13px+ unchanged
};

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (/\.(tsx?|jsx?)$/.test(name) && !EXCLUDE.test(name)) files.push(p);
  }
  return files;
}

let totalEdits = 0;
const changed = [];

for (const file of walk(ROOT)) {
  let src = readFileSync(file, "utf8");
  let edits = 0;

  // 1. inline fontSize: "Npx" / 'Npx'
  src = src.replace(/fontSize:\s*(["'])(\d+)px\1/g, (m, q, n) => {
    const v = mapPx(+n);
    if (v === +n) return m;
    edits++;
    return `fontSize: ${q}${v}px${q}`;
  });

  // 2. Tailwind arbitrary text-[Npx]
  src = src.replace(/text-\[(\d+)px\]/g, (m, n) => {
    const v = mapPx(+n);
    if (v === +n) return m;
    edits++;
    return `text-[${v}px]`;
  });

  // 3. text-xs (0.75rem = 12px) -> readable 13px
  src = src.replace(/(^|[\s"'`])text-xs($|[\s"'`])/g, (m, a, b) => {
    edits++;
    return `${a}text-[13px]${b}`;
  });

  if (edits > 0) {
    writeFileSync(file, src);
    totalEdits += edits;
    changed.push(`${file}: ${edits}`);
  }
}

console.log(`Edited ${changed.length} files, ${totalEdits} replacements:\n` + changed.join("\n"));
