#!/usr/bin/env node
// Turn a GitHub secret (PEM, escaped newlines, or base64 of a .p8) into a PEM file.
import { writeFileSync } from "node:fs";

const dest = process.argv[2];
if (!dest) {
  console.error("usage: write-asc-key.mjs <path>");
  process.exit(1);
}

let raw = (process.env.APPLE_API_KEY || "").trim().replace(/^['"]|['"]$/g, "").replace(/\\n/g, "\n");
if (!raw.includes("BEGIN")) {
  raw = Buffer.from(raw, "base64").toString("utf8");
}
if (!raw.includes("BEGIN")) {
  console.error("APPLE_API_KEY did not decode to a PEM. Set it with: gh secret set APPLE_API_KEY < AuthKey_….p8");
  process.exit(1);
}

const body = raw.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
if (body.length < 80) {
  console.error("APPLE_API_KEY PEM body is too short");
  process.exit(1);
}

const wrapped = body.match(/.{1,64}/g).join("\n");
writeFileSync(dest, `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`);
