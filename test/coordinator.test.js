import assert from "node:assert/strict";
import test from "node:test";

import { QuizCoordinator } from "../src/coordinator.js";
import { baseEnv, createContext } from "./helpers.js";

function discordMock() {
  const calls = [];
  let messageSequence = 0;
  const fetchMock = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method: init.method, body });
    if (init.method === "POST" && /\/channels\/\d+\/messages$/.test(String(url))) {
      messageSequence += 1;
      return Response.json({ id: `message-${messageSequence}` });
    }
    return Response.json({ id: "updated" });
  };
  return { calls, fetchMock };
}

test("quiz lifecycle records one answer, updates stats, and sends staff results", async (t) => {
  const originalFetch = globalThis.fetch;
  const mock = discordMock();
  globalThis.fetch = mock.fetchMock;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const ctx = createContext();
  const coordinator = new QuizCoordinator(ctx, baseEnv());
  const now = Date.now();
  const started = await coordinator.startQuiz(now, "test");
  assert.equal(started.started, true);
  assert.equal(started.quiz.messageId, "message-1");

  const quiz = started.quiz;
  const interaction = {
    type: 3,
    guild_id: baseEnv().GUILD_ID,
    data: { custom_id: `answer:${quiz.id}:${quiz.answer}` },
    member: {
      permissions: "0",
      nick: "Analyst",
      user: { id: "user-1", username: "analyst", global_name: "Analyst" },
    },
  };

  const first = await coordinator.handleInteraction(interaction);
  assert.equal(first.type, 4);
  assert.match(first.data.content, /locked in/i);

  const duplicate = await coordinator.handleInteraction(interaction);
  assert.match(duplicate.data.content, /already locked/i);

  const profile = await coordinator.profileResponse(interaction);
  assert.match(profile.data.content, /Correct: 1\/1/);

  const closed = await coordinator.closeQuiz(quiz, now + 11 * 60_000);
  assert.equal(closed.correctCount, 1);
  assert.equal(closed.totalCount, 1);
  assert.equal((await coordinator.getState()).activeQuizId, null);

  const staffCall = mock.calls.find(
    (call) => call.url.includes(baseEnv().STAFF_LOG_CHANNEL_ID) && call.method === "POST",
  );
  assert.ok(staffCall);
  assert.match(staffCall.body.embeds[0].description, /Analyst/);
});

test("scheduler creates an initial randomized deadline before launching", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = discordMock().fetchMock;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const coordinator = new QuizCoordinator(createContext(), baseEnv());
  const now = Date.now();
  const firstTick = await coordinator.tick(now);
  assert.equal(firstTick.activeQuizId, null);
  assert.ok(firstTick.nextQuizAt >= now + 5 * 60_000);
  assert.ok(firstTick.nextQuizAt <= now + 30 * 60_000);

  const dueTick = await coordinator.tick(firstTick.nextQuizAt + 1);
  assert.ok(dueTick.activeQuizId);
  assert.ok(dueTick.nextQuizAt >= firstTick.nextQuizAt + 240 * 60_000);
  assert.ok(dueTick.nextQuizAt <= firstTick.nextQuizAt + 480 * 60_000 + 1);
});

test("data deletion removes a member's answer and leaderboard record", async (t) => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = discordMock().fetchMock;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const ctx = createContext();
  const coordinator = new QuizCoordinator(ctx, baseEnv());
  const started = await coordinator.startQuiz();
  const interaction = {
    type: 3,
    guild_id: baseEnv().GUILD_ID,
    data: { custom_id: `answer:${started.quiz.id}:${started.quiz.answer}` },
    member: {
      permissions: "0",
      user: { id: "erase-me", username: "erase", global_name: "Erase Me" },
    },
  };
  await coordinator.handleInteraction(interaction);

  const prompt = await coordinator.deleteDataPrompt(interaction);
  const customId = prompt.data.components[0].components[0].custom_id;
  const deleted = await coordinator.confirmDataDeletion(interaction, customId);
  assert.equal(deleted.type, 7);
  assert.equal(await ctx.storage.get("leader:erase-me"), undefined);
  const answers = await ctx.storage.list({ prefix: "answer:" });
  assert.equal(answers.size, 0);
});

