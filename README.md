# LV Marketing Suite

Internal and public-facing marketing tools built with React, TypeScript, and Vite.

## Motion Palette

Motion Palette is an authenticated, browser-only editor for detecting and replacing colors in Lottie/Bodymovin JSON animations. Start the suite with `npm install` and `npm run dev`, sign in, then open `/motion-palette` or choose **Motion Palette** in the sidebar's tools section.

Color detection recursively visits top-level layers and precomposition assets, normalizes static RGB channels to 8-bit HEX values, and groups visually identical colors in first-occurrence order. The current editor supports shape fills (`ty: "fl"`) and strokes (`ty: "st"`), both static and animated, while preserving alpha and unrelated animation data. An animated color is edited per keyframe: each keyframe value joins the palette under its own color, and only the RGB channels are rewritten, so keyframe timing and easing handles are left exactly as the animator set them. Gradient fills (`ty: "gf"`) and strokes (`ty: "gs"`) are edited per stop. A gradient ramp is one flat, untagged array of `[offset, r, g, b]` groups optionally followed by `[offset, alpha]` opacity pairs, with the stop count in `g.p` as the only boundary between them, so a ramp whose length disagrees with its declared stop count is rejected rather than partially written: writing into the opacity pairs would make a gradient invisible instead of merely miscolored. Stop offsets, the opacity ramp, and the gradient's start, end and highlight coordinates are never modified. Malformed color structures, raster assets, and expressions that govern a color are detected but are not edited. An expression on a non-color property, such as layer rotation, is not reported, because it neither affects nor is affected by recoloring.

Named color schemes are stored only in the current browser's `localStorage`; animation files are processed locally and are not uploaded. Further format support should extend the framework-independent parser's detection and replacement visitors with typed handlers for the relevant Lottie property shapes, while continuing to leave unsupported data untouched.

The preview can be zoomed from 50% to 150% without changing the animation document or export dimensions. The Lottie JSON download remains animated; the SVG action exports the currently visible original or recolored frame as a static, transparent-background SVG snapshot.
