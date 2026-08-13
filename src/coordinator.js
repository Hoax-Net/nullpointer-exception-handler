import {
  APP_NAME,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
} from "./constants.js";
import {
  editChannelMessage,
  editInteractionResponse,
  sendChannelMessage,
} from "./discord.js";
import {
  buildClosedQuizPayload,
  buildOpenQuizPayload,
  buildStaffLogPayload,
} from "./presentation.js";
import { chooseQuestion } from "./questions.js";
import {
  clampInteger,
  createId,
  escapeDiscordMarkdown,
  getIdentity,
  hasManageGuild,
  interactionMessage,
  jsonResponse,
  randomInt,
  safeErrorMessage,
  truncate,
  unixTimestamp,
} from "./util.js";

const STATE_KEY = "state";
const HISTORY_KEY = "history";
const QUIZ_PREFIX = "quiz:";
const ANSWER_PREFIX = "answer:";
const LEADER_PREFIX = "leader:";
const DELETE_PREFIX = "delete-request:";

function defaultState() {
  return {
    activeQuizId: null,
    nextQuizAt: null,
    lastCleanupAt: 0,
    totalQuizzes: 0,
    lastError: null,
  };
}

function ephemeralData(content, extra = {}) {
  return {
    content,
    flags: MessageFlags.EPHEMERAL,
    allowed_mentions: { parse: [] },
    ...extra,
  };
}

function deferredEphemeral() {
  return {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: { flags: MessageFlags.EPHEMERAL },
  };
}

export class QuizCoordinator {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/tick") {
      const supplied = await request.json().catch(() => ({}));
      const result = await this.tick(Number(supplied.now) || Date.now());
      return jsonResponse(result);
    }

    if (request.method === "POST" && url.pathname === "/interaction") {
      const interaction = await request.json();
      const response = await this.handleInteraction(interaction);
      return jsonResponse(response);
    }

    if (request.method === "GET" && url.pathname === "/status") {
      return jsonResponse(await this.publicStatus());
    }

    return jsonResponse({ error: "not_found" }, 404);
  }

  async getState() {
    return (await this.ctx.storage.get(STATE_KEY)) ?? defaultState();
  }

  async putState(state) {
    await this.ctx.storage.put(STATE_KEY, state);
  }

  async deleteKeys(keys) {
    for (let index = 0; index < keys.length; index += 128) {
      await this.ctx.storage.delete(keys.slice(index, index + 128));
    }
  }

  getDurationMinutes() {
    return clampInteger(this.env.QUIZ_DURATION_MINUTES, 10, 2, 60);
  }

  getIntervalMinutes() {
    const min = clampInteger(this.env.QUIZ_MIN_INTERVAL_MINUTES, 240, 60, 1_440);
    const max = clampInteger(this.env.QUIZ_MAX_INTERVAL_MINUTES, 480, min, 2_880);
    return { min, max };
  }

  scheduleNext(now) {
    const { min, max } = this.getIntervalMinutes();
    return now + randomInt(min, max) * 60_000;
  }

  async tick(now = Date.now()) {
    let state = await this.getState();

    if (state.activeQuizId) {
      const active = await this.ctx.storage.get(`${QUIZ_PREFIX}${state.activeQuizId}`);
      if (!active) {
        state.activeQuizId = null;
        await this.putState(state);
      } else if (active.closesAt <= now) {
        await this.closeQuiz(active, now);
        state = await this.getState();
      }
    }

    if (!state.nextQuizAt) {
      const initialMax = clampInteger(this.env.INITIAL_QUIZ_DELAY_MINUTES, 30, 5, 240);
      state.nextQuizAt = now + randomInt(5, initialMax) * 60_000;
      await this.putState(state);
    }

    if (!state.activeQuizId && state.nextQuizAt <= now) {
      try {
        await this.startQuiz(now, "scheduled");
      } catch (error) {
        state = await this.getState();
        state.lastError = safeErrorMessage(error);
        state.nextQuizAt = now + 15 * 60_000;
        await this.putState(state);
      }
    }

    state = await this.getState();
    if (now - state.lastCleanupAt >= 24 * 60 * 60_000) {
      await this.cleanup(now);
      state = await this.getState();
    }

    return {
      ok: !state.lastError,
      activeQuizId: state.activeQuizId,
      nextQuizAt: state.nextQuizAt,
      totalQuizzes: state.totalQuizzes,
    };
  }

  async startQuiz(now = Date.now(), source = "manual") {
    const state = await this.getState();
    if (state.activeQuizId) {
      return { started: false, reason: "active_quiz", quizId: state.activeQuizId };
    }

    const history = (await this.ctx.storage.get(HISTORY_KEY)) ?? [];
    const question = chooseQuestion(history);
    const quiz = {
      id: createId(),
      questionId: question.id,
      category: question.category,
      difficulty: question.difficulty,
      prompt: question.prompt,
      choices: question.choices,
      answer: question.answer,
      explanation: question.explanation,
      aiResistant: Boolean(question.aiResistant),
      source,
      status: "open",
      openedAt: now,
      closesAt: now + this.getDurationMinutes() * 60_000,
      messageId: null,
    };

    const message = await sendChannelMessage(
      this.env,
      this.env.GENERAL_CHANNEL_ID,
      buildOpenQuizPayload(quiz),
    );
    if (!message?.id) throw new Error("Discord did not return a quiz message ID");

    quiz.messageId = message.id;
    state.activeQuizId = quiz.id;
    state.nextQuizAt = this.scheduleNext(now);
    state.totalQuizzes += 1;
    state.lastError = null;

    await this.ctx.storage.put({
      [`${QUIZ_PREFIX}${quiz.id}`]: quiz,
      [HISTORY_KEY]: [question.id, ...history.filter((id) => id !== question.id)].slice(0, 12),
      [STATE_KEY]: state,
    });

    return { started: true, quiz };
  }

  async closeQuiz(quiz, now = Date.now()) {
    if (!quiz || quiz.status !== "open") return { closed: false, reason: "not_open" };

    const answerMap = await this.ctx.storage.list({
      prefix: `${ANSWER_PREFIX}${quiz.id}:`,
    });
    const answers = [...answerMap.values()];
    const correctCount = answers.filter((answer) => answer.isCorrect).length;
    const summary = {
      totalCount: answers.length,
      correctCount,
      closedAt: now,
    };

    const outcomes = await Promise.allSettled([
      editChannelMessage(
        this.env,
        this.env.GENERAL_CHANNEL_ID,
        quiz.messageId,
        buildClosedQuizPayload(quiz, summary),
      ),
      sendChannelMessage(
        this.env,
        this.env.STAFF_LOG_CHANNEL_ID,
        buildStaffLogPayload(quiz, answers, now),
      ),
    ]);

    const failed = outcomes.find((outcome) => outcome.status === "rejected");
    const state = await this.getState();
    if (state.activeQuizId === quiz.id) state.activeQuizId = null;
    state.lastError = failed ? safeErrorMessage(failed.reason) : null;

    const closedQuiz = { ...quiz, ...summary, status: "closed" };
    await this.ctx.storage.put({
      [`${QUIZ_PREFIX}${quiz.id}`]: closedQuiz,
      [STATE_KEY]: state,
    });

    return { closed: true, ...summary, deliveryError: state.lastError };
  }

  async handleInteraction(interaction) {
    if (interaction.type === InteractionType.APPLICATION_COMMAND) {
      return this.handleCommand(interaction);
    }
    if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
      return this.handleComponent(interaction);
    }
    return interactionMessage("Unsupported interaction type.");
  }

  async handleCommand(interaction) {
    if (interaction.guild_id !== this.env.GUILD_ID) {
      return interactionMessage("This bot is configured only for the Hack Theory server.");
    }

    const command = interaction.data?.name;
    if (command === "quiz-start" || command === "quiz-close") {
      if (!hasManageGuild(interaction, this.env.ADMIN_USER_IDS)) {
        return interactionMessage("Manage Server permission is required for that command.");
      }
      this.ctx.waitUntil(this.completeAdminCommand(interaction, command));
      return deferredEphemeral();
    }

    if (command === "quiz-status") return this.quizStatusResponse();
    if (command === "leaderboard") return this.leaderboardResponse();
    if (command === "profile") return this.profileResponse(interaction);
    if (command === "help") return this.helpResponse();
    if (command === "delete-my-data") return this.deleteDataPrompt(interaction);
    return interactionMessage("Unknown command. Try `/help`.");
  }

  async completeAdminCommand(interaction, command) {
    try {
      let content;
      if (command === "quiz-start") {
        const result = await this.startQuiz(Date.now(), "manual");
        content = result.started
          ? `Quiz posted in <#${this.env.GENERAL_CHANNEL_ID}> and closes <t:${unixTimestamp(result.quiz.closesAt)}:R>.`
          : "A quiz is already active. Use `/quiz-status` for details.";
      } else {
        const state = await this.getState();
        const quiz = state.activeQuizId
          ? await this.ctx.storage.get(`${QUIZ_PREFIX}${state.activeQuizId}`)
          : null;
        if (!quiz) {
          content = "There is no active quiz to close.";
        } else {
          const result = await this.closeQuiz(quiz, Date.now());
          content = `Quiz closed with ${result.correctCount}/${result.totalCount} correct participant${result.totalCount === 1 ? "" : "s"}.`;
        }
      }
      await editInteractionResponse(this.env, interaction.token, ephemeralData(content));
    } catch (error) {
      await editInteractionResponse(
        this.env,
        interaction.token,
        ephemeralData(`The action failed safely: ${safeErrorMessage(error)}`),
      ).catch(() => undefined);
    }
  }

  async handleComponent(interaction) {
    const customId = interaction.data?.custom_id ?? "";
    if (customId.startsWith("answer:")) return this.recordAnswer(interaction, customId);
    if (customId.startsWith("delete-data:")) return this.confirmDataDeletion(interaction, customId);
    if (customId.startsWith("cancel-delete:")) {
      return {
        type: InteractionResponseType.UPDATE_MESSAGE,
        data: ephemeralData("Data deletion canceled.", { components: [] }),
      };
    }
    return interactionMessage("That control is no longer recognized.");
  }

  async recordAnswer(interaction, customId) {
    const [, quizId, rawIndex] = customId.split(":");
    const answerIndex = Number.parseInt(rawIndex, 10);
    const state = await this.getState();
    const quiz = await this.ctx.storage.get(`${QUIZ_PREFIX}${quizId}`);
    const now = Date.now();

    if (!quiz || state.activeQuizId !== quizId || quiz.status !== "open" || now >= quiz.closesAt) {
      return interactionMessage("That quiz is closed. Watch for the next randomized challenge.");
    }
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= quiz.choices.length) {
      return interactionMessage("That answer option is invalid.");
    }

    const identity = getIdentity(interaction);
    if (!identity || interaction.member?.user?.bot) {
      return interactionMessage("Only human server members can enter the quiz.");
    }

    const answerKey = `${ANSWER_PREFIX}${quizId}:${identity.userId}`;
    if (await this.ctx.storage.get(answerKey)) {
      return interactionMessage("Your first answer is already locked in; answers cannot be changed.");
    }

    const isCorrect = answerIndex === quiz.answer;
    const answer = {
      ...identity,
      answerIndex,
      isCorrect,
      answeredAt: now,
    };
    const leaderKey = `${LEADER_PREFIX}${identity.userId}`;
    const leader = (await this.ctx.storage.get(leaderKey)) ?? {
      ...identity,
      correct: 0,
      total: 0,
      streak: 0,
      bestStreak: 0,
    };
    leader.username = identity.username;
    leader.displayName = identity.displayName;
    leader.total += 1;
    leader.correct += isCorrect ? 1 : 0;
    leader.streak = isCorrect ? leader.streak + 1 : 0;
    leader.bestStreak = Math.max(leader.bestStreak, leader.streak);
    leader.lastAnswerAt = now;

    await this.ctx.storage.put({ [answerKey]: answer, [leaderKey]: leader });
    return interactionMessage(
      `Answer **${String.fromCharCode(65 + answerIndex)}** locked in. Your result stays private until the quiz closes <t:${unixTimestamp(quiz.closesAt)}:R>.`,
    );
  }

  async quizStatusResponse() {
    const state = await this.getState();
    const active = state.activeQuizId
      ? await this.ctx.storage.get(`${QUIZ_PREFIX}${state.activeQuizId}`)
      : null;
    const activeLine = active
      ? `Active: **${active.category}**; closes <t:${unixTimestamp(active.closesAt)}:R>.`
      : "No quiz is active.";
    const nextLine = state.nextQuizAt
      ? `Next randomized launch: <t:${unixTimestamp(state.nextQuizAt)}:R>.`
      : "The first randomized launch is being scheduled.";
    return interactionMessage(`${activeLine}\n${nextLine}`, { ephemeral: false });
  }

  async leaderboardResponse() {
    const values = [...(await this.ctx.storage.list({ prefix: LEADER_PREFIX })).values()];
    const leaders = values
      .filter((entry) => entry.total > 0)
      .sort((left, right) =>
        right.correct - left.correct ||
        right.bestStreak - left.bestStreak ||
        left.total - right.total,
      )
      .slice(0, 10);
    const lines = leaders.map((entry, index) => {
      const accuracy = Math.round((entry.correct / entry.total) * 100);
      return `**${index + 1}.** ${escapeDiscordMarkdown(entry.displayName)} — ${entry.correct}/${entry.total} (${accuracy}%) • best streak ${entry.bestStreak}`;
    });
    return interactionMessage(
      lines.length ? `🏆 **Hack Theory leaderboard**\n${lines.join("\n")}` : "No leaderboard entries yet. The first correct answer could be yours.",
      { ephemeral: false },
    );
  }

  async profileResponse(interaction) {
    const identity = getIdentity(interaction);
    const profile = identity
      ? await this.ctx.storage.get(`${LEADER_PREFIX}${identity.userId}`)
      : null;
    if (!profile) return interactionMessage("You have not answered a quiz yet.");
    const accuracy = Math.round((profile.correct / profile.total) * 100);
    return interactionMessage(
      `**Your quiz profile**\nCorrect: ${profile.correct}/${profile.total} (${accuracy}%)\nCurrent streak: ${profile.streak}\nBest streak: ${profile.bestStreak}`,
    );
  }

  helpResponse() {
    const site = this.env.SITE_URL || "the bot website";
    return interactionMessage(
      [
        `**${APP_NAME}** posts randomized cybersecurity quizzes about four times per day.`,
        "• Choose one button; your selection and correctness remain private until close.",
        "• Options are shuffled, some scenarios are generated, and answers cannot be changed.",
        "• Use `/profile`, `/leaderboard`, or `/quiz-status` at any time.",
        `• Privacy policy and terms: ${site}`,
      ].join("\n"),
    );
  }

  async deleteDataPrompt(interaction) {
    const identity = getIdentity(interaction);
    if (!identity) return interactionMessage("Your Discord identity was not available.");
    const nonce = createId("delete");
    await this.ctx.storage.put(`${DELETE_PREFIX}${nonce}`, {
      userId: identity.userId,
      expiresAt: Date.now() + 10 * 60_000,
    });
    return interactionMessage("This permanently removes your retained quiz answers and leaderboard profile. This cannot be undone.", {
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 4,
              label: "Delete my data",
              custom_id: `delete-data:${identity.userId}:${nonce}`,
            },
            {
              type: 2,
              style: 2,
              label: "Cancel",
              custom_id: `cancel-delete:${identity.userId}:${nonce}`,
            },
          ],
        },
      ],
    });
  }

  async confirmDataDeletion(interaction, customId) {
    const [, requestedUserId, nonce] = customId.split(":");
    const identity = getIdentity(interaction);
    const request = await this.ctx.storage.get(`${DELETE_PREFIX}${nonce}`);
    if (
      !identity ||
      identity.userId !== requestedUserId ||
      request?.userId !== identity.userId ||
      request.expiresAt < Date.now()
    ) {
      return interactionMessage("That deletion confirmation is invalid or expired.");
    }

    const answers = await this.ctx.storage.list({ prefix: ANSWER_PREFIX });
    const keys = [];
    for (const [key, answer] of answers) {
      if (answer.userId === identity.userId) keys.push(key);
    }
    keys.push(`${LEADER_PREFIX}${identity.userId}`, `${DELETE_PREFIX}${nonce}`);
    await this.deleteKeys(keys);

    return {
      type: InteractionResponseType.UPDATE_MESSAGE,
      data: ephemeralData(
        `Deleted your leaderboard profile and ${keys.length - 2} retained quiz answer record${keys.length - 2 === 1 ? "" : "s"}.`,
        { components: [] },
      ),
    };
  }

  async cleanup(now = Date.now()) {
    const retentionDays = clampInteger(this.env.ANSWER_RETENTION_DAYS, 30, 1, 365);
    const cutoff = now - retentionDays * 24 * 60 * 60_000;
    const quizzes = await this.ctx.storage.list({ prefix: QUIZ_PREFIX });
    const keysToDelete = [];

    for (const [quizKey, quiz] of quizzes) {
      if (quiz.status !== "closed" || (quiz.closedAt ?? quiz.closesAt) >= cutoff) continue;
      keysToDelete.push(quizKey);
      const answers = await this.ctx.storage.list({ prefix: `${ANSWER_PREFIX}${quiz.id}:` });
      keysToDelete.push(...answers.keys());
    }

    const pendingDeletes = await this.ctx.storage.list({ prefix: DELETE_PREFIX });
    for (const [key, request] of pendingDeletes) {
      if (request.expiresAt < now) keysToDelete.push(key);
    }

    if (keysToDelete.length) await this.deleteKeys(keysToDelete);
    const state = await this.getState();
    state.lastCleanupAt = now;
    await this.putState(state);
    return keysToDelete.length;
  }

  async publicStatus() {
    const state = await this.getState();
    const active = state.activeQuizId
      ? await this.ctx.storage.get(`${QUIZ_PREFIX}${state.activeQuizId}`)
      : null;
    return {
      status: state.lastError ? "degraded" : "ok",
      bot: APP_NAME,
      activeQuiz: active
        ? {
            category: active.category,
            closesAt: new Date(active.closesAt).toISOString(),
          }
        : null,
      nextQuizAt: state.nextQuizAt ? new Date(state.nextQuizAt).toISOString() : null,
      totalQuizzes: state.totalQuizzes,
      checkedAt: new Date().toISOString(),
    };
  }
}
