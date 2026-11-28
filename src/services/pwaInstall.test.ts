import { describe, expect, it } from 'vitest';
import { detectPwaPlatform } from './pwaInstall';

describe('pwaInstall platform detection', () => {
  it('detects iPhone, iPad, iPadOS desktop-UA, Android, and Desktop cleanly', () => {
    expect(
      detectPwaPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15',
        5,
      ),
    ).toBe('ios');
    expect(
      detectPwaPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        5,
      ),
    ).toBe('ios');
    expect(
      detectPwaPlatform(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile',
        5,
      ),
    ).toBe('android');
    expect(
      detectPwaPlatform(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0',
        0,
      ),
    ).toBe('desktop');
  });
});
