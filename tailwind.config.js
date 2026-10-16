// ADSB Radarscope
// Author: dustsignal
// GitHub: https://github.com/dustsignal/adsb-radarscope
//
// ---------------------------------------------------------------------------
// tailwind.config.js — Tailwind CSS configuration
//
// Content globs and theme extensions for Tailwind. Edit to add custom colors/
// fonts or adjust which files are scanned for class names.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: tailwind-config @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Outfit', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
        serif: ['EB Garamond', 'serif'],
      }
    },
  },
  plugins: [],
}
