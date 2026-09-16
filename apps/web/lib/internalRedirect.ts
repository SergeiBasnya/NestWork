const DEFAULT_REDIRECT = '/workspace/nestwork';

export function internalRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return DEFAULT_REDIRECT;
  try {
    const decoded = decodeURIComponent(value);
    const hasControlCharacter = [...decoded].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
    if (decoded.startsWith('//') || decoded.includes('\\') || hasControlCharacter) {
      return DEFAULT_REDIRECT;
    }
    const url = new URL(value, 'https://nestwork.invalid');
    if (url.origin !== 'https://nestwork.invalid') return DEFAULT_REDIRECT;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return DEFAULT_REDIRECT;
  }
}
