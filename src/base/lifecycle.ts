// Universal lifecycle callables — the platform's equivalent of vs/base
// IDisposable. Everything that can be "torn down" returns a Cleanup.

export type Cleanup = () => void | Promise<void>;

export type SetupReturn = Cleanup | void;
