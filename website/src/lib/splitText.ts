/**
 * Split text helper: splits a container's text content into words or characters
 * wrapped in <span> elements with .w (word) and .c (char) classes.
 */
export function splitIntoWords(element: HTMLElement): HTMLElement[] {
  const text = element.textContent || '';
  element.innerHTML = '';
  const words = text.trim().split(/\s+/);
  const spans: HTMLElement[] = [];

  words.forEach((word, i) => {
    const wordSpan = document.createElement('span');
    wordSpan.className = 'w';
    wordSpan.style.display = 'inline-block';
    wordSpan.textContent = word;
    element.appendChild(wordSpan);
    spans.push(wordSpan);

    if (i < words.length - 1) {
      element.appendChild(document.createTextNode(' '));
    }
  });

  return spans;
}

export function splitIntoChars(element: HTMLElement): HTMLElement[] {
  const text = element.textContent || '';
  element.innerHTML = '';
  const chars = Array.from(text);
  const spans: HTMLElement[] = [];

  chars.forEach((char) => {
    const charSpan = document.createElement('span');
    charSpan.className = 'c';
    charSpan.style.display = 'inline-block';
    charSpan.textContent = char === ' ' ? '\u00A0' : char;
    element.appendChild(charSpan);
    spans.push(charSpan);
  });

  return spans;
}
