import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RemoteShellProfileModule from './remote-shell-profile';
import { SshClientProxy } from './ssh-client-proxy';

const mocks = vi.hoisted(() => ({
  captureRemoteShellProfile: vi.fn(),
}));

vi.mock('./remote-shell-profile', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof RemoteShellProfileModule;
  return {
    ...actual,
    captureRemoteShellProfile: mocks.captureRemoteShellProfile,
  };
});

describe('SshClientProxy remote shell profile', () => {
  beforeEach(() => {
    mocks.captureRemoteShellProfile.mockReset();
  });

  it('captures and caches the remote shell profile behind the proxy API', async () => {
    const client = {};
    const profile = {
      shell: '/bin/zsh',
      env: { PATH: '/opt/homebrew/bin:/usr/bin' },
    };
    mocks.captureRemoteShellProfile.mockResolvedValue(profile);
    const proxy = new SshClientProxy();
    proxy.update(client as never);

    await expect(proxy.getRemoteShellProfile()).resolves.toBe(profile);
    await expect(proxy.getRemoteShellProfile()).resolves.toBe(profile);

    expect(mocks.captureRemoteShellProfile).toHaveBeenCalledTimes(1);
    expect(mocks.captureRemoteShellProfile).toHaveBeenCalledWith(client);
  });

  it('clears cached shell profile on invalidate', async () => {
    const firstClient = {};
    const secondClient = {};
    mocks.captureRemoteShellProfile
      .mockResolvedValueOnce({ shell: '/bin/zsh', env: { PATH: '/first' } })
      .mockResolvedValueOnce({ shell: '/bin/bash', env: { PATH: '/second' } });
    const proxy = new SshClientProxy();

    proxy.update(firstClient as never);
    await proxy.getRemoteShellProfile();
    proxy.invalidate();
    proxy.update(secondClient as never);
    const profile = await proxy.getRemoteShellProfile();

    expect(profile).toEqual({ shell: '/bin/bash', env: { PATH: '/second' } });
    expect(mocks.captureRemoteShellProfile).toHaveBeenCalledTimes(2);
  });
});
