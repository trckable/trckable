import { describe, expect, it } from "vitest";
import { qr, qrPath } from "./qr";

// The two symbols below were produced by this encoder and then read back by an
// independent decoder (jsQR), character for character, together with every
// byte length from 1 to 213. They are kept here so a change that quietly
// breaks a real scanner fails the build instead.
const GOLDEN: [string, number, string][] = [
  [
    "hi",
    21,
    "fe7bfc13506eb6bb7595dba9aec16507faafe01700be0be3a9484cd53dd0834ea14a804f27f8ac505fc9ba8925d7492ea53904c34feb4f0",
  ],
  [
    // A two-factor setup link, the kind the dashboard shows.
    "otpauth://totp/trckable:me@site.com?secret=JBSWY3DPEHPK3PXP&issuer=trckable",
    37,
    "fe89eb3bfc16c1dc106e822a32bb751ba7d5dba61509aec1270c2107faaaaaafe0138f0700b70f95925f4c8e3cdab2ded8d8a86b6e729ec6348e6729bea8d81b499e49dab6cf267f82d02a90ffc9bac7265e01e3b871170e8038c32790b56e424fc4dc4ba627bbb1149b1010f71c3e139f23fe318ab7868edb9af5a1352b152c44203e5af5fd8072a7ec7ffa07032a305da0431aba2834afd5d6d9c9776ea8386ff1041162d24fedb4ae338",
  ],
];

const hex = (grid: boolean[][]) => {
  const bits = grid
    .flat()
    .map((b) => (b ? "1" : "0"))
    .join("");
  let out = "";
  for (let i = 0; i < bits.length; i += 4)
    out += parseInt(bits.slice(i, i + 4).padEnd(4, "0"), 2).toString(16);
  return out;
};

describe("qr", () => {
  it.each(GOLDEN)(
    "encodes %j the same way it always has",
    (text, size, golden) => {
      const grid = qr(text);
      expect(grid.length).toBe(size);
      expect(hex(grid)).toBe(golden);
    },
  );

  it("grows one version at a time and never beyond version 10", () => {
    const sizes = [
      1, 14, 15, 26, 27, 42, 43, 62, 63, 84, 85, 106, 107, 122, 123, 152, 153,
      180, 181, 213,
    ].map((n) => qr("x".repeat(n)).length);
    expect(sizes).toEqual([
      21, 21, 25, 25, 29, 29, 33, 33, 37, 37, 41, 41, 45, 45, 49, 49, 53, 53,
      57, 57,
    ]);
    expect(() => qr("x".repeat(214))).toThrow();
  });

  it("always places the three finders and the timing patterns", () => {
    const g = qr(
      "otpauth://totp/trckable:me@site.com?secret=JBSWY3DPEHPK3PXP&issuer=trckable",
    );
    const n = g.length;
    for (const [top, left] of [
      [0, 0],
      [0, n - 7],
      [n - 7, 0],
    ]) {
      expect(g[top][left]).toBe(true);
      expect(g[top + 1][left + 1]).toBe(false); // the ring around the middle square
      expect(g[top + 3][left + 3]).toBe(true);
    }
    for (let i = 8; i < n - 8; i++) expect(g[6][i]).toBe(i % 2 === 0);
    expect(g[n - 8][8]).toBe(true); // the module that is dark in every symbol
  });

  it("draws one square per dark module", () => {
    const g = qr("hi");
    expect(qrPath(g).match(/M/g)?.length).toBe(g.flat().filter(Boolean).length);
  });
});
