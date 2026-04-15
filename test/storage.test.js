const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Storage } = require("../lib/storage");

describe("Storage", () => {
  let dir, storage;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "nrafb-"));
    storage = new Storage(dir);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates, lists and loads a conversation", async () => {
    const c = await storage.createConversation({ title: "Hello" });
    assert.ok(c.id);
    const list = await storage.listConversations();
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].title, "Hello");
    const loaded = await storage.getConversation(c.id);
    assert.strictEqual(loaded.id, c.id);
  });

  it("appends messages and derives title from first user message", async () => {
    const c = await storage.createConversation();
    await storage.appendMessage(c.id, { role: "user", content: "Describe my flow please" });
    const loaded = await storage.getConversation(c.id);
    assert.strictEqual(loaded.messages.length, 1);
    assert.match(loaded.title, /Describe my flow/);
  });

  it("deletes conversation and attachments together", async () => {
    const c = await storage.createConversation();
    const att = await storage.saveAttachment(c.id, {
      buffer: Buffer.from("hello"),
      originalName: "a.txt",
      mimeType: "text/plain"
    });
    const attPath = storage.attachmentPath(c.id, att.storedName);
    assert.ok(fs.existsSync(attPath));
    await storage.deleteConversation(c.id);
    assert.ok(!fs.existsSync(attPath));
    assert.strictEqual((await storage.listConversations()).length, 0);
  });
});
