import { describe, expect, it } from "vitest";
import { Registry } from "../registry";
import { ExtensionConflictError } from "../errors";

interface Entry {
  id: string;
  label?: string;
}

const make = () => new Registry<string, Entry>("messagePart");

describe("Registry — basic ops + insertion order", () => {
  it("registers, lists in insertion order, and counts", () => {
    const r = make();
    r.register({ id: "a" }, "owner-1");
    r.register({ id: "b", label: "B" }, "owner-1");
    r.register({ id: "c" }, "owner-2");

    expect(r.count()).toBe(3);
    expect(r.list().map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(r.get("b")).toEqual({ id: "b", label: "B" });
    expect(r.get("missing")).toBeUndefined();
  });

  it("filters via list(filter) preserving insertion order", () => {
    const r = make();
    r.register({ id: "a" }, "o");
    r.register({ id: "b" }, "o");
    r.register({ id: "c" }, "o");

    expect(r.list((e) => e.id !== "b").map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("snapshot is a structural copy, immune to subsequent mutations", () => {
    const r = make();
    r.register({ id: "a" }, "o1");
    r.register({ id: "b" }, "o2");

    const snap = r.snapshot();
    expect(snap).toEqual([
      { id: "a", owner: "o1" },
      { id: "b", owner: "o2" },
    ]);

    r.unregister("a", "o1");
    expect(snap).toEqual([
      { id: "a", owner: "o1" },
      { id: "b", owner: "o2" },
    ]);
    expect(r.snapshot()).toEqual([{ id: "b", owner: "o2" }]);
  });
});

describe("Registry — owner enforcement", () => {
  it("rejects empty-string owner at runtime", () => {
    const r = make();
    expect(() => r.register({ id: "a" }, "")).toThrowError(TypeError);
    expect(() => r.register({ id: "a" }, "")).toThrow(/non-empty string/);
  });

  it("rejects non-string owner at runtime (defensive against compile bypass)", () => {
    const r = make();
    expect(() =>
      r.register({ id: "a" }, undefined as unknown as string),
    ).toThrowError(TypeError);
  });

  it("throws ExtensionConflictError on duplicate id without mutating existing entry", () => {
    const r = make();
    r.register({ id: "text", label: "original" }, "core-text-plugin");

    expect(() =>
      r.register({ id: "text", label: "ghost" }, "experimental-text"),
    ).toThrowError(ExtensionConflictError);
    try {
      r.register({ id: "text", label: "ghost" }, "experimental-text");
    } catch (e) {
      expect(e).toBeInstanceOf(ExtensionConflictError);
      const err = e as ExtensionConflictError;
      expect(err.id).toBe("text");
      expect(err.subRegistryName).toBe("messagePart");
      expect(err.existingOwner).toBe("core-text-plugin");
      expect(err.newOwner).toBe("experimental-text");
    }

    expect(r.get("text")?.label).toBe("original");
  });

  it("unregister with mismatched owner throws ExtensionConflictError and preserves entry", () => {
    const r = make();
    r.register({ id: "foo" }, "A");

    expect(() => r.unregister("foo", "B")).toThrowError(ExtensionConflictError);
    expect(r.get("foo")).toBeDefined();
  });

  it("unregister with matching owner removes the entry", () => {
    const r = make();
    r.register({ id: "foo" }, "A");

    r.unregister("foo", "A");
    expect(r.get("foo")).toBeUndefined();
    expect(r.count()).toBe(0);
  });

  it("unregister of unknown id is a silent no-op", () => {
    const r = make();
    expect(() => r.unregister("ghost", "anyone")).not.toThrow();
    expect(r.count()).toBe(0);
  });
});

describe("Registry — unregisterByOwner", () => {
  it("removes only that owner's entries and returns ids in registration order", () => {
    const r = make();
    r.register({ id: "foo" }, "A");
    r.register({ id: "bar" }, "A");
    r.register({ id: "baz" }, "B");

    const removed = r.unregisterByOwner("A");
    expect(removed).toEqual(["foo", "bar"]);
    expect(r.snapshot()).toEqual([{ id: "baz", owner: "B" }]);
  });

  it("returns [] when the owner has nothing registered", () => {
    const r = make();
    r.register({ id: "x" }, "A");
    expect(r.unregisterByOwner("nobody")).toEqual([]);
    expect(r.count()).toBe(1);
  });
});
