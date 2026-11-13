import { describe, expect, it } from 'vitest';
import { homeScreenPlatform } from '../src/home-screen';

describe('homeScreenPlatform', () => {
  it('shows the iOS steps on iPhone and iPad, in any browser', () => {
    expect(
      homeScreenPlatform(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
        5,
      ),
    ).toBe('ios');
    // iPadOS reports a Mac; its touch screen tells it apart.
    expect(
      homeScreenPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        5,
      ),
    ).toBe('ios');
  });
  it('shows the Android steps on Android', () => {
    expect(
      homeScreenPlatform(
        'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36',
        5,
      ),
    ).toBe('android');
  });
  it('shows both otherwise, including a Mac without touch', () => {
    expect(
      homeScreenPlatform(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
        0,
      ),
    ).toBe('other');
    expect(
      homeScreenPlatform(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        0,
      ),
    ).toBe('other');
  });
});
