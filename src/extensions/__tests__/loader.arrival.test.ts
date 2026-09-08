import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapabilityRegistry } from "../../platform/capabilities";
import { ExtensionLoader } from "../loader";
import { ExtensionSetupError } from "../../platform/errors";
import type { ExtensionManifest } from "../manifest";

type Cap = "preview" | "canvas" | "observatory";

interface Ctx {
  readonly hostId: string;
  readonly trace: string[];
  /** Owner-bound register helper injected by loader. Asserted in scenarios. */
  readonly register: (entry: { id: string }) => string;
}

interface Harness {
  caps: CapabilityRegistry<Cap>;
  trace: string[];
  loader: ExtensionLoader<Ctx, Cap>;
  onError: ReturnType<typeof vi.fn>;
}

const setup = (
  overrides: Partial<{ hostId: string; devMode: boolean }> = {},
): Harness => {
  const caps = new CapabilityRegistry<Cap>();
  const trace: string[] = [];
  const onError = vi.fn();
  const loader = new ExtensionLoader<Ctx, Cap>({
    capabilities: caps,
    contextFactory: (manifest) => ({
      hostId: overrides.hostId ?? "test-host",
      trace,
      register: (entry) => `${manifest.id}:${entry.id}`,
    }),
    onError,
    devMode: overrides.devMode ?? false,
  });
  return { caps, trace, loader, onError };
};

const manifest = (
  id: string,
  opts: Partial<{
    requires: readonly Cap[];
    provides: readonly Cap[];
    setupFn: (ctx: Ctx) => ReturnType<ExtensionManifest<Cap, Ctx>["setup"]>;
  }> = {},
): ExtensionManifest<Cap, Ctx> => ({
  id,
  version: "1.0.0",
  requires: opts.requires,
  provides: opts.provides,
  setup:
    opts.setupFn ??
    ((ctx) => {
      ctx.trace.push(`setup:${id}`);
      return () => {
        ctx.trace.push(`cleanup:${id}`);
      };
    }),
});

describe("ExtensionLoader — declared-order activation with isolation", () => {
  it("runs setup in declared order for plugins without requires", async () => {
    const h = setup();
    await h.loader.load([manifest("A"), manifest("B"), manifest("C")]);

    expect(h.trace).toEqual(["setup:A", "setup:B", "setup:C"]);
    expect(h.loader.getActive().map((m) => m.id)).toEqual(["A", "B", "C"]);
    expect(h.loader.getPending()).toEqual([]);
  });

  it("setup errors are isolated, forwarded as ExtensionSetupError, and siblings still load", async () => {
    const h = setup();
    await h.loader.load([
      manifest("A"),
      manifest("B", {
        setupFn: () => {
          throw new Error("boom");
        },
      }),
      manifest("C"),
    ]);

    expect(h.trace).toEqual(["setup:A", "setup:C"]);
    expect(h.loader.getActive().map((m) => m.id)).toEqual(["A", "C"]);
    expect(h.onError).toHaveBeenCalledTimes(1);
    const [err, mf, phase] = h.onError.mock.calls[0];
    expect(err).toBeInstanceOf(ExtensionSetupError);
    expect((err as ExtensionSetupError).extensionId).toBe("B");
    expect((err as ExtensionSetupError).cause).toBeInstanceOf(Error);
    expect((err as ExtensionSetupError).cause as Error).toHaveProperty(
      "message",
      "boom",
    );
    expect(mf.id).toBe("B");
    expect(phase).toBe("setup");
  });

  it("async setup is awaited before next plugin loads; provides visible to next", async () => {
    const h = setup();
    const observed: boolean[] = [];

    await h.loader.load([
      manifest("A", {
        provides: ["canvas"],
        setupFn: async (ctx) => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          ctx.trace.push("setup:A");
        },
      }),
      manifest("B", {
        setupFn: (ctx) => {
          observed.push(h.caps.has("canvas"));
          ctx.trace.push("setup:B");
        },
      }),
    ]);

    expect(h.trace).toEqual(["setup:A", "setup:B"]);
    expect(observed).toEqual([true]);
  });
});

describe("ExtensionLoader — requires gating + dynamic capability handling", () => {
  it("plugin with unmet requires goes pending (no error, no setup)", async () => {
    const h = setup();
    await h.loader.load([manifest("P", { requires: ["canvas"] })]);

    expect(h.trace).toEqual([]);
    expect(h.loader.getPending().map((m) => m.id)).toEqual(["P"]);
    expect(h.loader.getActive()).toEqual([]);
    expect(h.onError).not.toHaveBeenCalled();
  });

  it("late capability via another plugin's provides activates pending plugins, in declared order", async () => {
    const h = setup();

    await h.loader.load([
      // Two pending consumers of canvas, declared before the provider.
      manifest("consumer-1", { requires: ["canvas"] }),
      manifest("consumer-2", { requires: ["canvas"] }),
      // Provider sits last and adds canvas in setup.
      manifest("provider", { provides: ["canvas"] }),
    ]);

    expect(h.trace).toEqual([
      "setup:provider",
      "setup:consumer-1",
      "setup:consumer-2",
    ]);
    expect(h.caps.has("canvas")).toBe(true);
    expect(h.loader.getActive().map((m) => m.id)).toEqual([
      "provider",
      "consumer-1",
      "consumer-2",
    ]);
    expect(h.loader.getPending()).toEqual([]);
  });

  it("external capabilities.add(...) after load activates pending plugin asynchronously", async () => {
    const h = setup();
    await h.loader.load([manifest("P", { requires: ["canvas"] })]);

    expect(h.loader.getPending().map((m) => m.id)).toEqual(["P"]);

    h.caps.add("canvas");
    await h.loader.flush();

    expect(h.trace).toEqual(["setup:P"]);
    expect(h.loader.getActive().map((m) => m.id)).toEqual(["P"]);
  });

  it("removing a required capability cleans up the plugin and pushes it back to pending", async () => {
    const h = setup();
    h.caps.add("canvas");
    await h.loader.load([manifest("P", { requires: ["canvas"] })]);

    expect(h.loader.getActive().map((m) => m.id)).toEqual(["P"]);

    h.caps.remove("canvas");
    await h.loader.flush();

    expect(h.trace).toEqual(["setup:P", "cleanup:P"]);
    expect(h.loader.getActive()).toEqual([]);
    expect(h.loader.getPending().map((m) => m.id)).toEqual(["P"]);

    h.caps.add("canvas");
    await h.loader.flush();
    expect(h.trace).toEqual(["setup:P", "cleanup:P", "setup:P"]);
    expect(h.loader.getActive().map((m) => m.id)).toEqual(["P"]);
  });

  it("capability flapping yields paired setup/cleanup invocations in order", async () => {
    const h = setup();
    await h.loader.load([manifest("P", { requires: ["canvas"] })]);

    h.caps.add("canvas");
    await h.loader.flush();
    h.caps.remove("canvas");
    await h.loader.flush();
    h.caps.add("canvas");
    await h.loader.flush();
    h.caps.remove("canvas");
    await h.loader.flush();

    expect(h.trace).toEqual([
      "setup:P",
      "cleanup:P",
      "setup:P",
      "cleanup:P",
    ]);
  });
});

describe("ExtensionLoader — unload runs cleanups in reverse order", () => {
  it("reverses activation order; pending are silently cleared", async () => {
    const h = setup();
    await h.loader.load([
      manifest("A"),
      manifest("B"),
      manifest("C"),
      manifest("D-pending", { requires: ["canvas"] }),
    ]);

    await h.loader.unload();

    expect(h.trace).toEqual([
      "setup:A",
      "setup:B",
      "setup:C",
      "cleanup:C",
      "cleanup:B",
      "cleanup:A",
    ]);
    expect(h.loader.getActive()).toEqual([]);
    expect(h.loader.getPending()).toEqual([]);
  });

  it("cleanup error is isolated and forwarded with phase: 'cleanup'", async () => {
    const h = setup();
    await h.loader.load([
      manifest("A"),
      manifest("B", {
        setupFn: (ctx) => {
          ctx.trace.push("setup:B");
          return () => {
            throw new Error("cleanup-boom");
          };
        },
      }),
      manifest("C"),
    ]);

    await h.loader.unload();

    expect(h.trace).toEqual([
      "setup:A",
      "setup:B",
      "setup:C",
      "cleanup:C",
      "cleanup:A",
    ]);
    expect(h.onError).toHaveBeenCalledTimes(1);
    const [err, mf, phase] = h.onError.mock.calls[0];
    expect(err).toBeInstanceOf(ExtensionSetupError);
    expect(mf.id).toBe("B");
    expect(phase).toBe("cleanup");
  });
});

describe("ExtensionLoader — error-sink fallback + isolation", () => {
  it("falls back to console.error when no onError is supplied", async () => {
    const caps = new CapabilityRegistry<Cap>();
    const loader = new ExtensionLoader<Ctx, Cap>({
      capabilities: caps,
      contextFactory: () => ({
        hostId: "h",
        trace: [],
        register: () => "x",
      }),
      devMode: false,
    });
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await loader.load([
      manifest("X", {
        setupFn: () => {
          throw new Error("sink-fallback");
        },
      }),
    ]);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy.mock.calls[0][0]).toBeInstanceOf(ExtensionSetupError);
  });

  it("constructs with devMode defaulted from import.meta.env.DEV when not passed", () => {
    // Smoke: omitting devMode triggers the default helper. Vitest runs in
    // dev-equivalent mode so the helper returns true; the point is that
    // the helper is invoked without error.
    const caps = new CapabilityRegistry<Cap>();
    const loader = new ExtensionLoader<Ctx, Cap>({
      capabilities: caps,
      contextFactory: () => ({
        hostId: "h",
        trace: [],
        register: () => "x",
      }),
    });
    expect(loader.getActive()).toEqual([]);
  });

  it("an exception thrown inside onError is itself swallowed (loader stays alive)", async () => {
    const h = setup();
    h.onError.mockImplementation(() => {
      throw new Error("sink-blew-up");
    });

    await expect(
      h.loader.load([
        manifest("A"),
        manifest("B", {
          setupFn: () => {
            throw new Error("boom");
          },
        }),
        manifest("C"),
      ]),
    ).resolves.toBeUndefined();

    expect(h.loader.getActive().map((m) => m.id)).toEqual(["A", "C"]);
  });
});

describe("ExtensionLoader — owner-bound register helper", () => {
  it("ctx.register binds owner = manifest.id", async () => {
    const h = setup();
    let captured = "";

    await h.loader.load([
      manifest("the-plugin", {
        setupFn: (ctx) => {
          captured = ctx.register({ id: "entry-x" });
        },
      }),
    ]);

    expect(captured).toBe("the-plugin:entry-x");
  });
});

describe("ExtensionLoader — dev-mode pending warn", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("warns once per plugin after 30s of pending when devMode = true", () => {
    const consoleSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const h = setup({ devMode: true });

    void h.loader.load([
      manifest("Pending-1", { requires: ["canvas"] }),
      manifest("Pending-2", { requires: ["preview", "canvas"] }),
    ]);

    vi.advanceTimersByTime(30_000);
    expect(consoleSpy).toHaveBeenCalledTimes(2);

    const messages = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(messages.some((m) => m.includes("Pending-1") && m.includes("canvas"))).toBe(
      true,
    );
    expect(
      messages.some(
        (m) =>
          m.includes("Pending-2") && m.includes("preview") && m.includes("canvas"),
      ),
    ).toBe(true);

    vi.advanceTimersByTime(60_000);
    expect(consoleSpy).toHaveBeenCalledTimes(2);
  });

  it("activation before the 30s boundary suppresses the warn", async () => {
    const consoleSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const h = setup({ devMode: true });

    await h.loader.load([manifest("P", { requires: ["canvas"] })]);

    vi.advanceTimersByTime(15_000);
    h.caps.add("canvas");
    await vi.runAllTimersAsync();
    await h.loader.flush();
    vi.advanceTimersByTime(60_000);

    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it("does NOT warn when devMode = false", () => {
    const consoleSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const h = setup({ devMode: false });

    void h.loader.load([manifest("P", { requires: ["canvas"] })]);
    vi.advanceTimersByTime(60_000);

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});

describe("ExtensionLoader — provides side-effects after async setup", () => {
  it("provides are added only after setup resolves (not before)", async () => {
    const h = setup();
    let resolveSetup!: () => void;
    const ready = new Promise<void>((r) => (resolveSetup = r));

    const observed: boolean[] = [];

    const promise = h.loader.load([
      manifest("provider", {
        provides: ["canvas"],
        setupFn: async () => {
          observed.push(h.caps.has("canvas"));
          await ready;
        },
      }),
    ]);

    await Promise.resolve();
    expect(observed).toEqual([false]);
    expect(h.caps.has("canvas")).toBe(false);

    resolveSetup();
    await promise;

    expect(h.caps.has("canvas")).toBe(true);
  });
});
