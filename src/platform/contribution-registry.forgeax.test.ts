// packages/interface/src/core/extension-foundation/contribution-registry.test.ts
import { describe, expect, it } from 'vitest';
import { createContributionRegistry, createContributionTransaction } from './contribution-registry';

describe('contribution-registry', () => {
  it('preserves contribution order and owner tags', () => {
    const r = createContributionRegistry<string>();
    r.contribute('a', 'one');
    r.contribute('b', 'two');
    r.contribute('a', 'three');
    expect(r.entries().map((e) => `${e.owner}:${e.item}`)).toEqual(['a:one', 'b:two', 'a:three']);
  });

  it('cleanup removes exactly its entry; remaining order intact', () => {
    const r = createContributionRegistry<string>();
    r.contribute('a', 'one');
    const off = r.contribute('b', 'two');
    r.contribute('c', 'three');
    off();
    expect(r.entries().map((e) => e.item)).toEqual(['one', 'three']);
  });

  it('cleanup is idempotent — double-call removes nothing else', () => {
    const r = createContributionRegistry<string>();
    const off = r.contribute('a', 'one');
    r.contribute('a', 'one'); // identical payload, separate entry
    off();
    off();
    expect(r.entries()).toHaveLength(1);
  });

  it('version bumps on every add and remove', () => {
    const r = createContributionRegistry<number>();
    const v0 = r.version();
    const off = r.contribute('a', 1);
    expect(r.version()).toBe(v0 + 1);
    off();
    expect(r.version()).toBe(v0 + 2);
  });

  it('onChange fires on add/remove; unsubscribe stops it', () => {
    const r = createContributionRegistry<number>();
    let fired = 0;
    const unsub = r.onChange(() => { fired++; });
    const off = r.contribute('a', 1);
    off();
    expect(fired).toBe(2);
    unsub();
    r.contribute('a', 2);
    expect(fired).toBe(2);
  });

  it('a listener may unsubscribe itself during notification', () => {
    const r = createContributionRegistry<number>();
    let calls = 0;
    const unsub = r.onChange(() => { calls++; unsub(); });
    r.contribute('a', 1);
    r.contribute('a', 2);
    expect(calls).toBe(1);
  });

  it('publishes a coherent cross-registry transaction before notifying', () => {
    const pages = createContributionRegistry<string>();
    const panels = createContributionRegistry<string>();
    const observed: string[] = [];
    pages.onChange(() => {
      observed.push(`${pages.entries().length}:${panels.entries().length}`);
    });

    const transaction = createContributionTransaction();
    transaction.contribute(pages, 'extension-a', 'page-a');
    transaction.contribute(panels, 'extension-a', 'panel-a');
    const commit = transaction.commit();

    expect(observed).toEqual(['1:1']);
    expect(pages.snapshot().generation).toBe(commit.generation);
    expect(panels.snapshot().generation).toBe(commit.generation);
    expect(pages.version()).toBe(1);
    expect(panels.version()).toBe(1);
  });

  it('cleans up transaction-added entries atomically and idempotently', () => {
    const pages = createContributionRegistry<string>();
    const panels = createContributionRegistry<string>();
    const observed: string[] = [];
    panels.onChange(() => {
      observed.push(`${pages.entries().length}:${panels.entries().length}`);
    });

    const transaction = createContributionTransaction();
    transaction.contribute(pages, 'extension-a', 'page-a');
    transaction.contribute(panels, 'extension-a', 'panel-a');
    const { cleanup } = transaction.commit();
    observed.length = 0;
    cleanup();
    cleanup();

    expect(observed).toEqual(['0:0']);
    expect(pages.entries()).toEqual([]);
    expect(panels.entries()).toEqual([]);
    expect(pages.snapshot().generation).toBe(panels.snapshot().generation);
  });

  it('can remove all entries owned by an extension in one publication', () => {
    const pages = createContributionRegistry<string>();
    const panels = createContributionRegistry<string>();
    pages.contribute('extension-a', 'page-a');
    pages.contribute('extension-b', 'page-b');
    panels.contribute('extension-a', 'panel-a');

    const transaction = createContributionTransaction();
    transaction.removeOwner(pages, 'extension-a');
    transaction.removeOwner(panels, 'extension-a');
    const commit = transaction.commit();

    expect(pages.entries().map((entry) => entry.item)).toEqual(['page-b']);
    expect(panels.entries()).toEqual([]);
    expect(pages.snapshot().generation).toBe(commit.generation);
    expect(panels.snapshot().generation).toBe(commit.generation);
  });

  it('aborts without publishing staged entries', () => {
    const registry = createContributionRegistry<string>();
    const transaction = createContributionTransaction();
    transaction.contribute(registry, 'extension-a', 'page-a');
    transaction.abort();
    expect(registry.entries()).toEqual([]);
    expect(registry.version()).toBe(0);
    expect(() => transaction.commit()).toThrow('aborted');
  });

  it('returns listener errors without losing the committed cleanup handle', () => {
    const registry = createContributionRegistry<string>();
    registry.onChange(() => { throw new Error('subscriber failed'); });
    const transaction = createContributionTransaction();
    transaction.contribute(registry, 'extension-a', 'page-a');

    const commit = transaction.commit();
    expect(commit.notificationErrors).toHaveLength(1);
    expect(registry.entries()).toHaveLength(1);
    expect(() => commit.cleanup()).toThrow('cleanup listener failed');
    expect(registry.entries()).toEqual([]);
  });
});
