import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_CATEGORIES,
  STATIC_QUESTIONS,
  buildQuestionPool,
  chooseQuestion,
} from "../src/questions.js";
import { shuffleQuestion } from "../src/util.js";

test("question bank has valid unique questions and full topic coverage", () => {
  const pool = buildQuestionPool(() => 0.42);
  const ids = new Set();
  const categories = new Set();

  for (const question of pool) {
    assert.ok(question.id);
    assert.equal(ids.has(question.id), false, `duplicate ID: ${question.id}`);
    ids.add(question.id);
    categories.add(question.category);
    assert.ok(question.prompt.length >= 20);
    assert.ok(question.choices.length >= 2 && question.choices.length <= 5);
    assert.equal(new Set(question.choices).size, question.choices.length);
    assert.ok(question.answer >= 0 && question.answer < question.choices.length);
    assert.ok(question.explanation.length >= 20);
  }

  for (const category of REQUIRED_CATEGORIES) assert.ok(categories.has(category), category);
  assert.ok(STATIC_QUESTIONS.length >= 40);
});

test("shuffling preserves the correct answer text", () => {
  const question = STATIC_QUESTIONS[0];
  const correct = question.choices[question.answer];
  const shuffled = shuffleQuestion(question, () => 0);
  assert.equal(shuffled.choices[shuffled.answer], correct);
});

test("recent questions are avoided when another question is available", () => {
  const recent = STATIC_QUESTIONS.slice(0, 12).map((question) => question.id);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    assert.equal(recent.includes(chooseQuestion(recent).id), false);
  }
});

