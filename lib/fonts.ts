import {
  Manrope,
  Playfair_Display,
  Space_Grotesk,
  IBM_Plex_Mono,
} from "next/font/google";

// Additional font pairings used only by the template gallery preview cards,
// kept separate from the site-wide Fraunces/Inter pairing in app/layout.tsx
// so marketing pages don't pay for fonts they don't render.
export const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

export const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

export const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const templateFontVariables = [
  manrope.variable,
  playfairDisplay.variable,
  spaceGrotesk.variable,
  plexMono.variable,
].join(" ");
