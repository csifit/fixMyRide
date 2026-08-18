import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const styles = [
  await read("app/globals.css"),
  await read("app/workshops/[workshopId]/WorkshopLocationMap.module.css"),
].join("\n");

test("visible interface text is never styled below 10px", () => {
  const sizes = [...styles.matchAll(/font-size\s*:\s*([0-9.]+)px/g)]
    .map((match) => Number(match[1]));
  assert.equal(sizes.some((size) => size > 0 && size < 10), false);
});

test("interface typography uses normal font weight", () => {
  const declaredWeights = [...styles.matchAll(/font-weight\s*:\s*([0-9]+|bold|bolder)/g)]
    .map((match) => match[1]);
  const shorthandWeights = [...styles.matchAll(/font\s*:\s*([0-9]+|bold|bolder)\b/g)]
    .map((match) => match[1]);
  assert.equal([...declaredWeights, ...shorthandWeights].some((weight) =>
    weight === "bold" || weight === "bolder" || Number(weight) > 400
  ), false);
  assert.match(styles, /:where\(h1,h2,h3,h4,h5,h6,strong,b,th,dt,legend,summary,optgroup\) \{ font-weight:400; \}/);
});
