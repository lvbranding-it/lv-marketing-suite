# LV Marketing Suite

Internal and public-facing marketing tools built with React, TypeScript, and Vite.

## Motion Palette

Motion Palette is an authenticated, browser-only editor for detecting and replacing colors in Lottie/Bodymovin JSON animations. Start the suite with `npm install` and `npm run dev`, sign in, then open `/motion-palette` or choose **Motion Palette** in the sidebar's tools section.

Color detection recursively visits top-level layers and precomposition assets, normalizes static RGB channels to 8-bit HEX values, and groups visually identical colors in first-occurrence order. The current editor supports static shape fills (`ty: "fl"`) and strokes (`ty: "st"`) while preserving alpha and unrelated animation data. Gradients, animated color keyframes, malformed color structures, raster assets, and expressions are detected but are not edited.

Named color schemes are stored only in the current browser's `localStorage`; animation files are processed locally and are not uploaded. Future gradient or animated-color support should extend the framework-independent parser's detection and replacement visitors with typed handlers for their Lottie property shapes, while continuing to leave unsupported data untouched.
