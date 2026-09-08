import { describe, expect, it, vi } from "vitest";
import { EventBus, type Middleware } from "../bus";

interface Events {
  "user:login": { id: string };
  "user:logout": { reason: string };
}

describe("EventBus — basic pub/sub", () => {
  it("invokes listeners synchronously in subscription order", () => {
    const bus = new EventBus<Events>();
    const order: string[] = [];

    bus.on("user:login", (p) => order.push(`A:${p.id}`));
    bus.on("user:login", (p) => order.push(`B:${p.id}`));

    bus.emit("user:login", { id: "u1" });
    expect(order).toEqual(["A:u1", "B:u1"]);
  });

  it("returns an unsubscribe function from on()", () => {
    const bus = new EventBus<Events>();
    const spy = vi.fn();

    const off = bus.on("user:login", spy);
    bus.emit("user:login", { id: "u1" });
    off();
    bus.emit("user:login", { id: "u2" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(bus.listenerCount("user:login")).toBe(0);
  });

  it("off(topic, listener) removes a specific listener", () => {
    const bus = new EventBus<Events>();
    const spy = vi.fn();
    bus.on("user:login", spy);
    bus.off("user:login", spy);
    bus.emit("user:login", { id: "u1" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("emit to a topic with zero listeners is a no-op", () => {
    const bus = new EventBus<Events>();
    expect(() => bus.emit("user:logout", { reason: "x" })).not.toThrow();
  });

  it("off() on a topic that has no listeners is silently a no-op", () => {
    const bus = new EventBus<Events>();
    expect(() => bus.off("user:logout", () => {})).not.toThrow();
    expect(bus.listenerCount("user:logout")).toBe(0);
  });

  it("off() removes the topic key once the last listener is unsubscribed", () => {
    const bus = new EventBus<Events>();
    const listener = vi.fn();
    bus.on("user:logout", listener);
    bus.off("user:logout", listener);
    expect(bus.listenerCount("user:logout")).toBe(0);
    expect(bus.listenerCount()).toBe(0);
  });

  it("off() of one of many listeners keeps the topic key alive", () => {
    const bus = new EventBus<Events>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("user:logout", a);
    bus.on("user:logout", b);
    bus.off("user:logout", a);

    expect(bus.listenerCount("user:logout")).toBe(1);
    bus.emit("user:logout", { reason: "x" });
    expect(b).toHaveBeenCalledWith({ reason: "x" });
    expect(a).not.toHaveBeenCalled();
  });

  it("listenerCount() reports per-topic and total", () => {
    const bus = new EventBus<Events>();
    bus.on("user:login", () => {});
    bus.on("user:login", () => {});
    bus.on("user:logout", () => {});

    expect(bus.listenerCount("user:login")).toBe(2);
    expect(bus.listenerCount("user:logout")).toBe(1);
    expect(bus.listenerCount()).toBe(3);
  });
});

describe("EventBus — listener errors are isolated", () => {
  it("forwards listener throws to onListenerError and continues remaining listeners", () => {
    const onListenerError = vi.fn();
    const bus = new EventBus<Events>({ onListenerError });

    bus.on("user:login", () => {
      throw new Error("boom");
    });
    const spyB = vi.fn();
    bus.on("user:login", spyB);

    bus.emit("user:login", { id: "u1" });

    expect(onListenerError).toHaveBeenCalledTimes(1);
    const [err, topic, payload] = onListenerError.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("boom");
    expect(topic).toBe("user:login");
    expect(payload).toEqual({ id: "u1" });
    expect(spyB).toHaveBeenCalledWith({ id: "u1" });
  });

  it("defaults onListenerError to console.error when not injected", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bus = new EventBus<Events>();
    bus.on("user:login", () => {
      throw new Error("nope");
    });
    bus.emit("user:login", { id: "u1" });

    expect(consoleSpy).toHaveBeenCalled();
  });
});

describe("EventBus — middleware chain", () => {
  it("executes middlewares in registration order before listeners", () => {
    const bus = new EventBus<Events>();
    const trace: string[] = [];

    const m1: Middleware<Events> = (event, next) => {
      trace.push(`M1:${event.topic}`);
      next(event);
    };
    const m2: Middleware<Events> = (event, next) => {
      trace.push(`M2:${event.topic}`);
      next(event);
    };

    bus.use(m1);
    bus.use(m2);
    bus.on("user:login", (p) => trace.push(`L:${p.id}`));

    bus.emit("user:login", { id: "u1" });
    expect(trace).toEqual(["M1:user:login", "M2:user:login", "L:u1"]);
  });

  it("middleware can transform payload by calling next with a new payload", () => {
    const bus = new EventBus<Events>();
    bus.use((event, next) =>
      next({ topic: event.topic, payload: { id: `${event.payload.id}-tagged` } }),
    );
    const spy = vi.fn();
    bus.on("user:login", spy);

    bus.emit("user:login", { id: "u1" });
    expect(spy).toHaveBeenCalledWith({ id: "u1-tagged" });
  });

  it("middleware can drop the event by not calling next", () => {
    const bus = new EventBus<Events>();
    bus.use((event, next) => {
      if (event.payload.id === "blocked") return;
      next(event);
    });
    const spy = vi.fn();
    bus.on("user:login", spy);

    bus.emit("user:login", { id: "blocked" });
    bus.emit("user:login", { id: "ok" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ id: "ok" });
  });

  it("dispose function returned by use() removes that middleware", () => {
    const bus = new EventBus<Events>();
    const trace: string[] = [];
    const dispose = bus.use((event, next) => {
      trace.push("MW");
      next(event);
    });
    bus.on("user:login", () => trace.push("L"));

    bus.emit("user:login", { id: "u1" });
    dispose();
    bus.emit("user:login", { id: "u2" });

    expect(trace).toEqual(["MW", "L", "L"]);
  });

  it("dispose called twice is a no-op (the second call cannot find the middleware)", () => {
    const bus = new EventBus<Events>();
    const dispose = bus.use((event, next) => next(event));
    dispose();
    expect(() => dispose()).not.toThrow();
  });

  it("an exception inside onListenerError itself is swallowed so siblings keep running", () => {
    const bus = new EventBus<Events>({
      onListenerError: () => {
        throw new Error("sink-itself-blew-up");
      },
    });
    const spyB = vi.fn();
    bus.on("user:login", () => {
      throw new Error("listener-blew-up");
    });
    bus.on("user:login", spyB);

    expect(() => bus.emit("user:login", { id: "u1" })).not.toThrow();
    expect(spyB).toHaveBeenCalledWith({ id: "u1" });
  });
});

describe("EventBus — destroy", () => {
  it("destroy() removes listeners + middleware; subsequent emit is a silent no-op", () => {
    const onListenerError = vi.fn();
    const bus = new EventBus<Events>({ onListenerError });
    bus.on("user:login", () => {
      throw new Error("should not reach");
    });
    bus.use((event, next) => next(event));

    bus.destroy();
    expect(bus.listenerCount()).toBe(0);

    expect(() => bus.emit("user:login", { id: "u1" })).not.toThrow();
    expect(onListenerError).not.toHaveBeenCalled();
  });

  it("on() and use() after destroy throw a 'destroyed' error", () => {
    const bus = new EventBus<Events>();
    bus.destroy();
    expect(() => bus.on("user:login", () => {})).toThrow(/destroyed/i);
    expect(() => bus.use((e, next) => next(e))).toThrow(/destroyed/i);
  });

  it("calling destroy() twice is safe", () => {
    const bus = new EventBus<Events>();
    bus.destroy();
    expect(() => bus.destroy()).not.toThrow();
  });
});
