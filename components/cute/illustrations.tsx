/**
 * Hand-drawn style illustrations (inline SVG, theme-token colours, so they
 * follow light/dark automatically). Decorative by default: pass `title` to
 * expose one to assistive tech.
 */
import type { SVGProps } from "react";

type IllustrationProps = Omit<SVGProps<SVGSVGElement>, "children"> & {
  title?: string;
};

function a11y(title?: string) {
  return title ? { role: "img", "aria-label": title } : { "aria-hidden": true };
}

const LINE = "var(--cat-line)";
const BLUSH = "var(--blush)";

/** Cat head centred on (0,0), about 50×52 units. */
function CatHead({ fur, eyes }: { fur: string; eyes: "happy" | "open" | "sleepy" }) {
  const stroke = { stroke: LINE, strokeWidth: 2.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <g>
      <path d="M-20 -6 L-16 -28 L-3 -17 Z" fill={fur} {...stroke} />
      <path d="M20 -6 L16 -28 L3 -17 Z" fill={fur} {...stroke} />
      <path d="M-15.5 -11 L-13.8 -22.5 L-7.5 -16.5 Z" fill={BLUSH} />
      <path d="M15.5 -11 L13.8 -22.5 L7.5 -16.5 Z" fill={BLUSH} />
      <ellipse cx="0" cy="0" rx="22" ry="19" fill={fur} {...stroke} />
      {eyes === "open" ? (
        <>
          <circle cx="-8" cy="-1.5" r="2.4" fill={LINE} />
          <circle cx="8" cy="-1.5" r="2.4" fill={LINE} />
          <circle cx="-7.2" cy="-2.4" r="0.8" fill="#fff" />
          <circle cx="8.8" cy="-2.4" r="0.8" fill="#fff" />
        </>
      ) : eyes === "happy" ? (
        <>
          <path d="M-11.5 -0.5 q3.5 -4.5 7 0" fill="none" {...stroke} />
          <path d="M4.5 -0.5 q3.5 -4.5 7 0" fill="none" {...stroke} />
        </>
      ) : (
        <>
          <path d="M-11.5 -1.5 q3.5 3.5 7 0" fill="none" {...stroke} />
          <path d="M4.5 -1.5 q3.5 3.5 7 0" fill="none" {...stroke} />
        </>
      )}
      <circle cx="-13.5" cy="5.5" r="3.2" fill={BLUSH} opacity="0.6" />
      <circle cx="13.5" cy="5.5" r="3.2" fill={BLUSH} opacity="0.6" />
      <path d="M-2.4 4.2 h4.8 l-2.4 2.8 Z" fill={BLUSH} stroke={LINE} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M0 7 q-2.6 3.2 -5.2 1.2 M0 7 q2.6 3.2 5.2 1.2" fill="none" {...stroke} strokeWidth="1.8" />
      <path d="M-12 6.5 L-25 4.5 M-12 9.5 L-24.5 11 M12 6.5 L25 4.5 M12 9.5 L24.5 11" {...stroke} strokeWidth="1.3" opacity="0.7" />
    </g>
  );
}

export const HEART_PATH =
  "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.8 4.5 6.6 4.5c2.2 0 3.6 1.2 4.4 2.5.8-1.3 2.2-2.5 4.4-2.5 3.8 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z";

export function Heart({ title, ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...a11y(title)} {...props}>
      <path d={HEART_PATH} />
    </svg>
  );
}

export function PawPrint({ title, ...props }: IllustrationProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...a11y(title)} {...props}>
      <ellipse cx="12" cy="15.5" rx="5.2" ry="4.4" />
      <circle cx="6.2" cy="10" r="2.1" />
      <circle cx="9.9" cy="6.6" r="2.1" />
      <circle cx="14.1" cy="6.6" r="2.1" />
      <circle cx="17.8" cy="10" r="2.1" />
    </svg>
  );
}

/** App mark: a happy cat face with a tiny heart. */
export function CatFace({ title, ...props }: IllustrationProps) {
  return (
    <svg viewBox="-30 -34 60 60" {...a11y(title)} {...props}>
      <CatHead fur="var(--cat-fur)" eyes="happy" />
      <g transform="translate(14 -30) scale(0.62)">
        <path d={HEART_PATH} fill="var(--primary)" transform="translate(-12 -12)" />
      </g>
    </svg>
  );
}

// Half-hearts: from each body's base down to the shared point, up around a lobe, into the dip.
const TAIL_LEFT = "M98 142 Q 105 141 110 136 C 92 124, 90 96, 102 96 C 107 96, 110 100, 110 106";
const TAIL_RIGHT = "M122 142 Q 115 141 110 136 C 128 124, 130 96, 118 96 C 113 96, 110 100, 110 106";

/** Two cats sitting together; their tails meet in a heart. Hero / auth art. */
export function CatCouple({ title, ...props }: IllustrationProps) {
  const outline = { stroke: LINE, strokeWidth: 2.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 220 160" {...a11y(title)} {...props}>
      <ellipse cx="110" cy="150" rx="86" ry="6" fill="var(--secondary)" />

      {/* Tails first so the bodies sit on top: each traces half of a heart. */}
      {[
        { d: TAIL_LEFT, fur: "var(--cat-fur)" },
        { d: TAIL_RIGHT, fur: "var(--cat-fur-2)" },
      ].map((tail) => (
        <g key={tail.d}>
          <path d={tail.d} fill="none" stroke={LINE} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path d={tail.d} fill="none" stroke={tail.fur} strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}

      <path d="M50 148 C 45 112, 56 92, 74 92 C 92 92, 103 112, 98 148 Z" fill="var(--cat-fur)" {...outline} />
      <ellipse cx="65" cy="147" rx="8" ry="4.5" fill="var(--cat-fur)" {...outline} />
      <ellipse cx="84" cy="147" rx="8" ry="4.5" fill="var(--cat-fur)" {...outline} />
      <g transform="translate(74 74)">
        <CatHead fur="var(--cat-fur)" eyes="happy" />
      </g>

      <path d="M122 148 C 117 112, 128 92, 146 92 C 164 92, 175 112, 170 148 Z" fill="var(--cat-fur-2)" {...outline} />
      <ellipse cx="137" cy="147" rx="8" ry="4.5" fill="var(--cat-fur-2)" {...outline} />
      <ellipse cx="156" cy="147" rx="8" ry="4.5" fill="var(--cat-fur-2)" {...outline} />
      <g transform="translate(146 74)">
        <CatHead fur="var(--cat-fur-2)" eyes="open" />
      </g>

      <g className="animate-heart" style={{ transformBox: "fill-box" }}>
        <path d={HEART_PATH} fill="var(--primary)" transform="translate(98 14) scale(1)" />
      </g>
      <path d={HEART_PATH} fill="var(--blush)" transform="translate(76 26) scale(0.5)" />
      <path d={HEART_PATH} fill="var(--blush)" transform="translate(134 22) scale(0.4)" />
    </svg>
  );
}

/** A curled-up sleeping cat for empty states. */
export function SleepyCat({ title, ...props }: IllustrationProps) {
  const outline = { stroke: LINE, strokeWidth: 2.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 150 96" {...a11y(title)} {...props}>
      <ellipse cx="78" cy="88" rx="56" ry="5" fill="var(--secondary)" />
      <path d="M40 70 C 36 44, 66 36, 92 40 C 118 44, 128 60, 122 76 C 116 88, 52 90, 40 70 Z" fill="var(--cat-fur)" {...outline} />
      <path d="M118 78 C 106 92, 62 92, 50 80" fill="none" stroke={LINE} strokeWidth="9" strokeLinecap="round" />
      <path d="M118 78 C 106 92, 62 92, 50 80" fill="none" stroke="var(--cat-fur)" strokeWidth="5" strokeLinecap="round" />
      <g transform="translate(44 60) scale(0.82)">
        <CatHead fur="var(--cat-fur)" eyes="sleepy" />
      </g>
      <text x="74" y="28" fill="var(--muted-foreground)" fontFamily="var(--font-heading)" fontSize="14" fontWeight="600">z</text>
      <text x="86" y="18" fill="var(--muted-foreground)" fontFamily="var(--font-heading)" fontSize="11" fontWeight="600" opacity="0.8">z</text>
      <text x="96" y="10" fill="var(--muted-foreground)" fontFamily="var(--font-heading)" fontSize="8" fontWeight="600" opacity="0.6">z</text>
    </svg>
  );
}
