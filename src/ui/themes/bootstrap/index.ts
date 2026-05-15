// Bootstrap theme: trivial SVG cards used to prove the theme wiring works
// end-to-end. Real visual themes ("classic", "minimal") arrive in phase
// 4b/4c. SVGs are generated programmatically rather than authored as files
// because each card differs only by label + category.

import type { CardCategory, CardType } from '@/engine/cards';
import { STANDARD_DECK_COMPOSITION } from '@/engine/deck';
import { categoryOf, mileValueOf } from '@/engine/cards';
import type { Theme } from '../types';

const CATEGORY_COLOR_VAR: Readonly<Record<CardCategory, string>> = {
  mileage: 'var(--color-mileage)',
  hazard: 'var(--color-hazard)',
  remedy: 'var(--color-remedy)',
  safety: 'var(--color-safety)',
};

function labelFor(type: CardType): string {
  const v = mileValueOf(type);
  if (v !== null) return `${v}`;
  return type.replace(/^[^-]+-/, '').replace(/-/g, ' ');
}

function cardSvg(type: CardType): string {
  const category = categoryOf(type);
  const color = CATEGORY_COLOR_VAR[category];
  const label = labelFor(type);
  const value = mileValueOf(type);
  const isMile = value !== null;
  // Mile cards: big numeric value (SVG <text> centers fine). Others: words
  // that may exceed one line (e.g. "puncture proof"), so use foreignObject
  // + HTML so the browser handles word-wrap natively.
  const labelMarkup = isMile
    ? `<text x="100" y="160" text-anchor="middle"
            font-family="system-ui, sans-serif" font-weight="700"
            font-size="72" fill="var(--card-fg)">${escapeXml(label)}</text>`
    : `<foreignObject x="14" y="80" width="172" height="140">
         <div xmlns="http://www.w3.org/1999/xhtml" style="
              font-family: system-ui, sans-serif; font-weight: 700;
              font-size: 28px; line-height: 1.05; color: var(--card-fg);
              text-align: center; text-transform: capitalize;
              word-break: break-word; hyphens: auto;
              display: flex; align-items: center; justify-content: center;
              height: 100%;">
           ${escapeXml(label)}
         </div>
       </foreignObject>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" preserveAspectRatio="xMidYMid meet">
      <rect x="3" y="3" width="194" height="274" rx="14"
            fill="var(--card-bg)" stroke="${color}" stroke-width="4"/>
      ${labelMarkup}
      <text x="100" y="252" text-anchor="middle"
            font-family="system-ui, sans-serif" font-size="14"
            fill="var(--card-fg)" opacity="0.55"
            style="text-transform: uppercase; letter-spacing: 0.08em;">${category}</text>
    </svg>
  `.trim();
}

function buildAllCards(): Record<CardType, string> {
  const out: Partial<Record<CardType, string>> = {};
  for (const [type] of STANDARD_DECK_COMPOSITION) {
    out[type] = cardSvg(type);
  }
  return out as Record<CardType, string>;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const back = `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 280" preserveAspectRatio="xMidYMid meet">
    <defs>
      <linearGradient id="back-bs" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="var(--card-back-a)"/>
        <stop offset="100%" stop-color="var(--card-back-b)"/>
      </linearGradient>
    </defs>
    <rect x="3" y="3" width="194" height="274" rx="14"
          fill="url(#back-bs)" stroke="var(--card-back-frame)" stroke-width="4"/>
    <text x="100" y="155" text-anchor="middle"
          font-family="system-ui, sans-serif" font-weight="800"
          font-size="48" letter-spacing="6" fill="var(--card-back-fg)">MB</text>
  </svg>
`.trim();

export const bootstrapTheme: Theme = {
  id: 'bootstrap',
  name: 'Bootstrap',
  cards: buildAllCards(),
  back,
  cssVars: {
    '--card-bg': '#fafafa',
    '--card-fg': '#1a1a1a',
    '--card-back-a': '#2a2a2a',
    '--card-back-b': '#444',
    '--card-back-frame': '#555',
    '--card-back-fg': '#999',
  },
};
