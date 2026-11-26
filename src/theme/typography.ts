import { Platform, TextStyle } from 'react-native';

/**
 * Purposeful stacks — literary display + clean UI body.
 * Avoid Inter / Roboto / system-only defaults as the whole identity.
 */
const displayFamily = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'Georgia',
});

const bodyFamily = Platform.select({
  ios: 'Avenir Next',
  android: 'sans-serif',
  default: 'System',
});

const monoFamily = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

export const fonts = {
  display: displayFamily,
  body: bodyFamily,
  mono: monoFamily,
} as const;

export const typography = {
  brand: {
    fontFamily: displayFamily,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 0.4,
    fontWeight: '400',
  } satisfies TextStyle,
  brandMark: {
    fontFamily: displayFamily,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 2.4,
    fontWeight: '600',
    textTransform: 'uppercase',
  } satisfies TextStyle,
  title: {
    fontFamily: displayFamily,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: 0.2,
    fontWeight: '600',
  } satisfies TextStyle,
  headline: {
    fontFamily: displayFamily,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
  } satisfies TextStyle,
  section: {
    fontFamily: bodyFamily,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1.1,
    fontWeight: '700',
    textTransform: 'uppercase',
  } satisfies TextStyle,
  body: {
    fontFamily: bodyFamily,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
  } satisfies TextStyle,
  bodyStrong: {
    fontFamily: bodyFamily,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  } satisfies TextStyle,
  caption: {
    fontFamily: bodyFamily,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  } satisfies TextStyle,
  mono: {
    fontFamily: monoFamily,
    fontSize: 12,
    lineHeight: 17,
  } satisfies TextStyle,
  button: {
    fontFamily: bodyFamily,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    letterSpacing: 0.2,
  } satisfies TextStyle,
} as const;
