/** "⌘" on Apple devices, "Ctrl" elsewhere. */
export function modKeyLabel() {
  const platform =
    typeof navigator === 'undefined'
      ? ''
      : (navigator.userAgentData?.platform ?? navigator.platform ?? '');
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : 'Ctrl';
}
