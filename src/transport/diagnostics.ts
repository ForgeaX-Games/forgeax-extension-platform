let installed = false;

function formatValue(value: unknown): string {
  if (value instanceof Error) return value.stack?.split('\n')[0] ?? value.message;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function installExtensionDiagnosticsBridge(extensionId?: string): void {
  if (installed || typeof window === 'undefined' || window.parent === window) return;
  installed = true;
  const send = (level: 'error' | 'warn', code: string, message: string) => {
    try {
      window.parent.postMessage({ type: 'forgeax:diagnostic', level, source: 'extension', code, component: extensionId ?? 'extension', message, hint: 'Inspect the extension runtime report.', retryable: true, recoveryActions: [{ command: 'retry-extension', description: 'Retry extension activation after fixing the reported error.' }] }, '*');
    } catch { /* A closed parent cannot receive diagnostics. */ }
  };
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      const message = args.map(formatValue).join(' ');
      if (!message.startsWith('[forgeax-diagnostic]')) send(level, `console-${level}`, message);
    };
  }
  window.addEventListener('error', (event) => send('error', 'window-error', event.message));
  window.addEventListener('unhandledrejection', (event) => send('error', 'unhandled-rejection', formatValue(event.reason)));
}
