import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Registry } from "../registry";
import { EventBus } from "../../base/bus";
import { CapabilityRegistry } from "../capabilities";
import { ExtensionLoader } from "../../extensions/loader";
import {
  installDebugHook,
  uninstallDebugHook,
  type ExtensionPlatformDebug,
} from "../debug";

interface GlobalShape {
  __VAG_DEBUG__?: { extensionPlatform?: ExtensionPlatformDebug };
}

const globalAny = globalThis as unknown as GlobalShape;

describe("debug hook — dev mode", () => {
  beforeEach(() => {
    delete globalAny.__VAG_DEBUG__;
  });

  afterEach(() => {
    delete globalAny.__VAG_DEBUG__;
  });

  it("installs onto globalThis when devMode = true", () => {
    installDebugHook({ devMode: true });

    expect(globalAny.__VAG_DEBUG__?.extensionPlatform).toBeDefined();
    expect(globalAny.__VAG_DEBUG__?.extensionPlatform?.snapshot()).toEqual({
      registries: {},
      buses: {},
      loaders: {},
    });
  });

  it("upper layers can attach registries / buses / loaders and snapshot reflects them", () => {
    installDebugHook({ devMode: true });
    const hook = globalAny.__VAG_DEBUG__!.extensionPlatform!;

    const reg = new Registry<string, { id: string }>("messagePart");
    reg.register({ id: "text" }, "owner-1");
    reg.register({ id: "code" }, "owner-2");
    hook.register("chat.messagePart", reg);

    const bus = new EventBus<{ ping: { n: number } }>();
    bus.on("ping", () => {});
    hook.register("chat.bus", bus);

    const caps = new CapabilityRegistry<"x">();
    const loader = new ExtensionLoader<{ trace: string[] }, "x">({
      capabilities: caps,
      contextFactory: () => ({ trace: [] }),
      devMode: false,
    });
    hook.register("chat.loader", loader);

    const snap = hook.snapshot();
    expect(Object.keys(snap.registries)).toEqual(["chat.messagePart"]);
    expect(snap.registries["chat.messagePart"]).toEqual([
      { id: "text", owner: "owner-1" },
      { id: "code", owner: "owner-2" },
    ]);
    expect(Object.keys(snap.buses)).toEqual(["chat.bus"]);
    expect(snap.buses["chat.bus"]).toEqual({ totalListeners: 1 });
    expect(Object.keys(snap.loaders)).toEqual(["chat.loader"]);
    expect(snap.loaders["chat.loader"]).toEqual({
      pendingIds: [],
      activeIds: [],
    });
  });

  it("hook.unregister removes a previously attached entry", () => {
    installDebugHook({ devMode: true });
    const hook = globalAny.__VAG_DEBUG__!.extensionPlatform!;

    const reg = new Registry<string, { id: string }>("messagePart");
    reg.register({ id: "text" }, "owner");
    hook.register("chat.messagePart", reg);

    const bus = new EventBus<{ ping: { n: number } }>();
    hook.register("chat.bus", bus);

    expect(Object.keys(hook.snapshot().registries)).toEqual(["chat.messagePart"]);
    expect(Object.keys(hook.snapshot().buses)).toEqual(["chat.bus"]);

    hook.unregister("chat.messagePart");
    hook.unregister("chat.bus");
    hook.unregister("nonexistent");

    expect(hook.snapshot()).toEqual({
      registries: {},
      buses: {},
      loaders: {},
    });
  });

  it("snapshot reflects loader pending and active plugin ids correctly", async () => {
    installDebugHook({ devMode: true });
    const hook = globalAny.__VAG_DEBUG__!.extensionPlatform!;

    const caps = new CapabilityRegistry<"canvas">();
    const loader = new ExtensionLoader<{ trace: string[] }, "canvas">({
      capabilities: caps,
      contextFactory: () => ({ trace: [] }),
      devMode: false,
    });

    await loader.load([
      { id: "active-1", version: "1.0.0", setup: () => undefined },
      {
        id: "pending-1",
        version: "1.0.0",
        requires: ["canvas"],
        setup: () => undefined,
      },
    ]);

    hook.register("chat.loader", loader);
    expect(hook.snapshot().loaders["chat.loader"]).toEqual({
      pendingIds: ["pending-1"],
      activeIds: ["active-1"],
    });
  });

  it("install with no devMode option falls back to import.meta.env.DEV", () => {
    installDebugHook();
    expect(globalAny.__VAG_DEBUG__?.extensionPlatform).toBeDefined();
  });

  it("uninstall removes the hook completely", () => {
    installDebugHook({ devMode: true });
    expect(globalAny.__VAG_DEBUG__?.extensionPlatform).toBeDefined();

    uninstallDebugHook();
    expect(globalAny.__VAG_DEBUG__?.extensionPlatform).toBeUndefined();
  });
});

describe("debug hook — prod mode", () => {
  beforeEach(() => {
    delete globalAny.__VAG_DEBUG__;
  });

  afterEach(() => {
    delete globalAny.__VAG_DEBUG__;
  });

  it("does not install when devMode = false", () => {
    installDebugHook({ devMode: false });
    expect(globalAny.__VAG_DEBUG__).toBeUndefined();
  });

  it("uninstall is a no-op when never installed", () => {
    expect(() => uninstallDebugHook()).not.toThrow();
    expect(globalAny.__VAG_DEBUG__).toBeUndefined();
  });
});
