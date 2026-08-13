import { APP_NAME } from "./constants.js";
import { escapeDiscordMarkdown, truncate, unixTimestamp } from "./util.js";

const LETTERS = Object.freeze(["A", "B", "C", "D", "E"]);
const COLOR = Object.freeze({
  OPEN: 0x8b5cf6,
  CLOSED: 0x22c55e,
  STAFF: 0xef4444,
});

function answerRows(quiz, disabled) {
  return [
    {
      type: 1,
      components: quiz.choices.map((_, index) => ({
        type: 2,
        style: index === quiz.answer && disabled ? 3 : 2,
        label: LETTERS[index],
        custom_id: `answer:${quiz.id}:${index}`,
        disabled,
      })),
    },
  ];
}

function choiceText(quiz) {
  return quiz.choices
    .map((choice, index) => `**${LETTERS[index]}.** ${truncate(choice, 350)}`)
    .join("\n");
}

export function buildOpenQuizPayload(quiz) {
  const aiResistant = quiz.aiResistant
    ? " • Scenario/randomized challenge"
    : "";
  return {
    content: "🧠 **Hack Theory challenge deployed.** Choose one answer before time expires.",
    embeds: [
      {
        title: `${quiz.category} • ${quiz.difficulty}`,
        description: `${truncate(quiz.prompt, 1_900)}\n\n${choiceText(quiz)}`,
        color: COLOR.OPEN,
        fields: [
          {
            name: "Closes",
            value: `<t:${unixTimestamp(quiz.closesAt)}:R>`,
            inline: true,
          },
          {
            name: "Answer policy",
            value: "One private selection per member",
            inline: true,
          },
        ],
        footer: {
          text: `${APP_NAME}${aiResistant} • Results appear after close`,
        },
        timestamp: new Date(quiz.openedAt).toISOString(),
      },
    ],
    components: answerRows(quiz, false),
    allowed_mentions: { parse: [] },
  };
}

export function buildClosedQuizPayload(quiz, summary) {
  const correctLetter = LETTERS[quiz.answer];
  return {
    content: `✅ **Quiz closed.** ${summary.correctCount}/${summary.totalCount} participant${summary.totalCount === 1 ? "" : "s"} answered correctly.`,
    embeds: [
      {
        title: `${quiz.category} • Answer: ${correctLetter}`,
        description: `${truncate(quiz.prompt, 1_500)}\n\n${choiceText(quiz)}\n\n**Explanation**\n${truncate(quiz.explanation, 900)}`,
        color: COLOR.CLOSED,
        fields: [
          {
            name: "Correct answer",
            value: `${correctLetter}. ${truncate(quiz.choices[quiz.answer], 500)}`,
          },
        ],
        footer: { text: `${APP_NAME} • Next challenge is randomized` },
        timestamp: new Date(summary.closedAt).toISOString(),
      },
    ],
    components: answerRows(quiz, true),
    allowed_mentions: { parse: [] },
  };
}

export function buildStaffLogPayload(quiz, answers, closedAt) {
  const correct = answers.filter((answer) => answer.isCorrect);
  const incorrect = answers.length - correct.length;
  const names = correct.length
    ? correct
        .slice(0, 40)
        .map(
          (answer) =>
            `• ${escapeDiscordMarkdown(answer.displayName)} (@${escapeDiscordMarkdown(answer.username)}) — \`${answer.userId}\``,
        )
        .join("\n")
    : "No member submitted the correct answer.";

  return {
    embeds: [
      {
        title: "Quiz results • correct participants",
        description: truncate(names, 3_900),
        color: COLOR.STAFF,
        fields: [
          { name: "Category", value: quiz.category, inline: true },
          { name: "Correct", value: String(correct.length), inline: true },
          { name: "Incorrect", value: String(incorrect), inline: true },
          {
            name: "Question ID",
            value: `\`${quiz.questionId}\``,
            inline: false,
          },
        ],
        footer: { text: `${APP_NAME} • Audit log` },
        timestamp: new Date(closedAt).toISOString(),
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

