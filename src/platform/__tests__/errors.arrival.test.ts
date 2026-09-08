import { describe, expect, it } from "vitest";
import { ExtensionConflictError, ExtensionSetupError } from "../errors";

describe("ExtensionConflictError", () => {
  it("captures id, sub-registry name, and both owners on the instance", () => {
    const err = new ExtensionConflictError({
      id: "text",
      subRegistryName: "messagePart",
      existingOwner: "core-text-plugin",
      newOwner: "experimental-text",
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ExtensionConflictError);
    expect(err.name).toBe("ExtensionConflictError");
    expect(err.id).toBe("text");
    expect(err.subRegistryName).toBe("messagePart");
    expect(err.existingOwner).toBe("core-text-plugin");
    expect(err.newOwner).toBe("experimental-text");
  });

  it("renders a message containing every diagnostic field for grep-ability", () => {
    const err = new ExtensionConflictError({
      id: "text",
      subRegistryName: "messagePart",
      existingOwner: "core-text-plugin",
      newOwner: "experimental-text",
    });

    expect(err.message).toContain("messagePart");
    expect(err.message).toContain("text");
    expect(err.message).toContain("core-text-plugin");
    expect(err.message).toContain("experimental-text");
  });
});

describe("ExtensionSetupError", () => {
  it("wraps the plugin id and forwards the underlying cause via ES2022 Error.cause", () => {
    const cause = new Error("boom");
    const err = new ExtensionSetupError({
      extensionId: "messagepart-code-edit",
      phase: "setup",
      cause,
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ExtensionSetupError);
    expect(err.name).toBe("ExtensionSetupError");
    expect(err.extensionId).toBe("messagepart-code-edit");
    expect(err.phase).toBe("setup");
    expect(err.cause).toBe(cause);
    expect(err.message).toContain("messagepart-code-edit");
    expect(err.message).toContain("setup");
  });

  it("supports phase: 'cleanup' and accepts non-Error causes", () => {
    const err = new ExtensionSetupError({
      extensionId: "x",
      phase: "cleanup",
      cause: "stringy failure",
    });

    expect(err.phase).toBe("cleanup");
    expect(err.cause).toBe("stringy failure");
    expect(err.message).toContain("cleanup");
  });
});
