import assert from "node:assert/strict";
import test from "node:test";
import { escapeCsvCell, serializeContactCsvRow } from "../../src/lib/contact-export.mjs";

test("CSV cells quote delimiters, quotes, and line breaks safely", () => {
  assert.equal(escapeCsvCell('Acme, "North"'), '"Acme, ""North"""');
  assert.equal(escapeCsvCell("line one\nline two"), '"line one\nline two"');
});

test("CSV cells neutralize spreadsheet formulas", () => {
  for (const value of ["=1+1", "+cmd", "-1+2", "@SUM(A1:A2)", "  =1+1"]) {
    assert.equal(escapeCsvCell(value), `"${"'" + value}"`);
  }
});

test("contact rows include consent, tags, and an ISO timestamp", () => {
  const row = serializeContactCsvRow({
    name: "Customer",
    phone: "8801712345678",
    tags: ["vip", "new"],
    optIn: {
      status: true,
      consentSource: "website_form",
      evidence: "Consent form #123",
      date: new Date("2026-11-06T05:00:00.000Z"),
      revokedAt: null,
      revocationSource: "",
    },
    createdAt: new Date("2026-11-07T05:00:00.000Z"),
  });
  assert.equal(row, '"Customer","8801712345678","vip; new","Yes","website_form","Consent form #123","2026-11-06T05:00:00.000Z","","","2026-11-07T05:00:00.000Z"');
});
