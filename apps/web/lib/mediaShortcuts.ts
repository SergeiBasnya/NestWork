type MediaShortcutEvent = Pick<
  KeyboardEvent,
  'altKey' | 'ctrlKey' | 'defaultPrevented' | 'key' | 'metaKey' | 'repeat' | 'target'
>;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const element = target as { isContentEditable?: boolean; tagName?: unknown };
  return element.isContentEditable === true
    || (typeof element.tagName === 'string' && ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName.toUpperCase()));
}

export function shouldToggleMicFromKeyboard(event: MediaShortcutEvent): boolean {
  return !event.defaultPrevented
    && !event.repeat
    && !event.ctrlKey
    && !event.metaKey
    && !event.altKey
    && event.key.toLowerCase() === 'm'
    && !isTypingTarget(event.target);
}
