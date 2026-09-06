# Project preferences

## Scratch integration design

Use the existing Scratch integration as the approved design for future Scratch requests in this project, unless the user explicitly requests a different layout.

- Keep the site's existing exercise panel on the right, including its useful instructions, scene, and controls.
- Embed the official Scratch editor in an iframe on the left. Let it fill all remaining width and height, with only compact outer padding and a small gap between panels.
- Preserve the existing heading and useful instructions above the editor. Do not replace the whole page with Scratch, constrain it to a small centered box, or leave large unused margins.
- Keep the adjacent panel synchronized with the Scratch VM. Avoid duplicating the scene inside the embedded editor; retain Scratch's native flag and stop controls.
- Preserve the site's established styling. Do not add decorative headers, badges, status copy, or explanatory text that the user has not requested.

Reference implementation: `components/scratch-challenge.tsx`, `public/scratch/embed.css`, `public/scratch/editor.css`, and the Scratch panels in `app/page.tsx`.
