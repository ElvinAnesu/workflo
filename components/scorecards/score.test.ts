import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { averageScore, kpiScore } from "./score.ts";

describe("kpiScore", () => {
  test("higher is better: actual over target", () => {
    assert.equal(kpiScore("Higher is better", 200, 150), 75);
    assert.equal(kpiScore("Higher is better", 200, 250), 125);
  });

  test("lower is better: target over actual; zero actual meets the target", () => {
    assert.equal(kpiScore("Lower is better", 5, 10), 50);
    assert.equal(kpiScore("Lower is better", 5, 4), 125);
    assert.equal(kpiScore("Lower is better", 5, 0), 100);
  });

  test("no score without a positive target or with a negative actual", () => {
    assert.equal(kpiScore("Higher is better", 0, 10), null);
    assert.equal(kpiScore("Higher is better", 10, -1), null);
    assert.equal(kpiScore("Higher is better", Number.NaN, 1), null);
  });

  test("rounds to one decimal", () => {
    assert.equal(kpiScore("Higher is better", 3, 1), 33.3);
  });
});

describe("averageScore", () => {
  test("ignores missing scores", () => {
    assert.equal(averageScore([80, null, 100]), 90);
    assert.equal(averageScore([null]), null);
  });
});
