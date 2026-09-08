import { describe, expect, it, vi } from "vitest";
import { CapabilityRegistry } from "../capabilities";

type Cap = "preview" | "canvas" | "observatory";

describe("CapabilityRegistry — basic state + snapshot", () => {
  it("snapshot reflects added capabilities and is read-only at runtime", () => {
    const r = new CapabilityRegistry<Cap>();
    r.add("preview");
    r.add("canvas");

    const snap = r.snapshot();
    expect(snap.has("preview")).toBe(true);
    expect(snap.has("canvas")).toBe(true);
    expect(snap.size).toBe(2);

    expect(() =>
      (snap as unknown as Set<Cap>).add("observatory"),
    ).toThrowError(TypeError);
  });

  it("has(c) returns true iff currently present", () => {
    const r = new CapabilityRegistry<Cap>();
    expect(r.has("preview")).toBe(false);
    r.add("preview");
    expect(r.has("preview")).toBe(true);
    r.remove("preview");
    expect(r.has("preview")).toBe(false);
  });
});

describe("CapabilityRegistry — events are idempotent and order-correct", () => {
  it("emits 'added' only on the absent→present transition", () => {
    const r = new CapabilityRegistry<Cap>();
    const spy = vi.fn();
    r.on("added", spy);

    r.add("preview");
    r.add("preview");
    r.add("preview");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("preview");
  });

  it("emits 'removed' only on the present→absent transition", () => {
    const r = new CapabilityRegistry<Cap>();
    const spy = vi.fn();
    r.on("removed", spy);

    r.remove("preview");
    expect(spy).not.toHaveBeenCalled();

    r.add("preview");
    r.remove("preview");
    r.remove("preview");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("preview");
  });

  it("add then remove emits both events in order", () => {
    const r = new CapabilityRegistry<Cap>();
    const trace: string[] = [];
    r.on("added", (c) => trace.push(`+${c}`));
    r.on("removed", (c) => trace.push(`-${c}`));

    r.add("canvas");
    r.remove("canvas");

    expect(trace).toEqual(["+canvas", "-canvas"]);
  });
});

describe("CapabilityRegistry — subscriptions", () => {
  it("returns an unsubscribe function from on()", () => {
    const r = new CapabilityRegistry<Cap>();
    const spy = vi.fn();
    const off = r.on("added", spy);

    r.add("preview");
    off();
    r.add("canvas");

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("invokes multiple listeners in subscription order", () => {
    const r = new CapabilityRegistry<Cap>();
    const trace: string[] = [];
    r.on("added", (c) => trace.push(`L1:${c}`));
    r.on("added", (c) => trace.push(`L2:${c}`));

    r.add("preview");
    expect(trace).toEqual(["L1:preview", "L2:preview"]);
  });

  it("listener errors don't break sibling listeners (isolated via internal bus)", () => {
    const r = new CapabilityRegistry<Cap>();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const spyB = vi.fn();

    r.on("added", () => {
      throw new Error("nope");
    });
    r.on("added", spyB);

    r.add("preview");
    expect(spyB).toHaveBeenCalledWith("preview");
    expect(consoleSpy).toHaveBeenCalled();
  });
});
