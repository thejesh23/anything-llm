/* eslint-env jest, node */
jest.mock("../../../utils/chats", () => ({
  chatPrompt: jest.fn(async () => ""),
  recentChatHistory: jest.fn(),
}));
jest.mock("../../../utils/DocumentManager", () => ({
  DocumentManager: class {
    async pinnedDocs() {
      return [];
    }
  },
}));
jest.mock("../../../models/workspaceParsedFiles", () => ({
  WorkspaceParsedFiles: { getContextFiles: jest.fn(async () => []) },
}));

const { ModelRouterService } = require("../../../utils/router");

/**
 * The OpenAI-compatible endpoint hands the request's `messages` to the router
 * as `chatHistoryOverride`, so history content can be a string or an array of
 * content parts, as OpenAI clients send it.
 */
async function tokenCountFor(chatHistory) {
  const { conversationTokenCount } =
    await ModelRouterService.gatherRoutingContext({
      workspace: { id: 1, slug: "test" },
      message: "",
      chatHistoryOverride: { rawHistory: chatHistory, chatHistory },
      messageCountOverride: chatHistory.length,
    });
  return conversationTokenCount;
}

describe("ModelRouterService.gatherRoutingContext conversationTokenCount", () => {
  const longText = "The quarterly report covers revenue and costs. ".repeat(
    200
  );

  it("counts string message content", async () => {
    const count = await tokenCountFor([{ role: "user", content: longText }]);
    expect(count).toBeGreaterThan(1000);
  });

  it("counts the text of content-part arrays like the same text as a string", async () => {
    const asString = await tokenCountFor([{ role: "user", content: longText }]);
    const asParts = await tokenCountFor([
      { role: "user", content: [{ type: "text", text: longText }] },
    ]);
    expect(asParts).toBe(asString);
  });

  it("counts only the text parts of a message that also carries an image", async () => {
    const asString = await tokenCountFor([{ role: "user", content: longText }]);
    const withImage = await tokenCountFor([
      {
        role: "user",
        content: [
          { type: "text", text: longText },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,iVBORw0KGgo=" },
          },
        ],
      },
    ]);
    expect(withImage).toBe(asString);
  });

  it("adds nothing for empty or missing history content", async () => {
    const noHistory = await tokenCountFor([]);
    const emptyHistory = await tokenCountFor([
      { role: "user", content: "" },
      { role: "assistant", content: null },
      { role: "user", content: [] },
    ]);
    expect(emptyHistory).toBe(noHistory);
  });
});
