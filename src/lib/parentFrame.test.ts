import { describe, it, expect, afterEach, vi } from 'vitest';
import { PARENT_ORIGIN, postLeadToParent, postStepToParent } from './parentFrame';

/**
 * groundmounts.com's /quote page counts DesignerStep / DesignerComplete / Lead
 * only from these messages, so they have to arrive, go to that site alone, and
 * never carry the owner's own tests.
 */
function framed({ search = '', cookie = '' } = {}) {
  const postMessage = vi.fn();
  const parent = { postMessage };
  const win = { location: { search }, parent } as unknown as Window & { parent: typeof parent };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', { cookie });
  return postMessage;
}

describe('messages to the embedding site', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts each step view to groundmounts.com, and nowhere else', () => {
    const postMessage = framed({ search: '?source=groundmounts.com&utm_source=facebook' });
    postStepToParent(3);
    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'designer:step', step: 3 }, 'https://groundmounts.com');
    expect(PARENT_ORIGIN).not.toBe('*');
  });

  it('posts the filed lead with its lead id as the event id, and its value', () => {
    const postMessage = framed();
    postLeadToParent('8f14e45f-ceea-467a-9f34-2c8c3b1a77de', 41250);
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'designer:complete', eventId: '8f14e45f-ceea-467a-9f34-2c8c3b1a77de', value: 41250 },
      PARENT_ORIGIN
    );
  });

  it('sends nothing for the owner testing (?internal=1 or the cookie)', () => {
    let postMessage = framed({ search: '?source=groundmounts.com&internal=1' });
    postStepToParent(1);
    postLeadToParent('8f14e45f-ceea-467a-9f34-2c8c3b1a77de', 41250);
    expect(postMessage).not.toHaveBeenCalled();

    postMessage = framed({ cookie: 'other=1; gm_internal=1' });
    postStepToParent(1);
    postLeadToParent('8f14e45f-ceea-467a-9f34-2c8c3b1a77de', 41250);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('does nothing when the funnel is opened on its own, not in a frame', () => {
    const postMessage = vi.fn();
    const win: Record<string, unknown> = { location: { search: '' }, postMessage };
    win.parent = win;
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', { cookie: '' });
    postStepToParent(2);
    postLeadToParent('8f14e45f-ceea-467a-9f34-2c8c3b1a77de', 41250);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('never posts a lead without an id', () => {
    const postMessage = framed();
    postLeadToParent('', 41250);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('never throws, even when the parent refuses the message', () => {
    const postMessage = framed();
    postMessage.mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => postStepToParent(4)).not.toThrow();
    expect(() => postLeadToParent('8f14e45f-ceea-467a-9f34-2c8c3b1a77de', 41250)).not.toThrow();
  });
});
