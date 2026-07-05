# ⬡ ClipForge

A modern, browser-based video editor. Trim, crop, and export MP4 videos — entirely in your browser, with no uploads, no accounts, and no servers.

**Live demo:** https://clipforge.app

---

## Features

- **Trim** — Set precise start/end points with a draggable timeline
- **Crop** — Interactive crop box with aspect ratio presets (16:9, 1:1, 9:16, 4:3, Free)
- **Export** — H.264 MP4 output via ffmpeg.wasm with Low/Medium/High quality presets
- **Privacy-first** — Zero data leaves your device
- **No build step** — Pure HTML/CSS/JS, deployable as static files

---

## Deployment

### Netlify (recommended)
1. Push this folder to a GitHub repository
2. Connect repository to Netlify
3. Set publish directory: `/` (root)
4. Deploy — `netlify.toml` handles headers automatically

### Vercel
1. Push to GitHub
2. Import project in Vercel dashboard
3. Framework preset: **Other**
4. Deploy — `vercel.json` handles headers automatically

### Cloudflare Pages
1. Push to GitHub
2. Connect in Cloudflare Pages
3. Build command: *(leave blank)*
4. Deploy — `_headers` handles COOP/COEP automatically

> **Important:** The `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers are **required** for ffmpeg.wasm to use SharedArrayBuffer. All three config files above set these automatically.

---

## Project Structure

```
clipforge/
├── index.html          # Main editor page
├── css/
│   └── style.css       # All styles
├── js/
│   └── app.js          # Editor logic + ffmpeg.wasm integration
├── pages/
│   ├── terms.html      # Terms & Conditions
│   ├── privacy.html    # Privacy Policy
│   └── sitemap.html    # HTML Sitemap
├── sitemap.xml         # XML sitemap (SEO)
├── robots.txt
├── netlify.toml        # Netlify config
├── vercel.json         # Vercel config
└── _headers            # Cloudflare Pages config
```

---

## Tech Stack

- Vanilla JS (ES Modules) — no framework, no build step
- ffmpeg.wasm 0.12.x via unpkg CDN
- Inter font via Google Fonts
- Pure CSS with CSS variables — no Tailwind required

---

## Local Development

```bash
# Serve with any static server that supports custom headers
npx serve . --cors

# Or with Python (no SharedArrayBuffer — ffmpeg may fall back to single-thread mode)
python3 -m http.server 3000
```

For full ffmpeg.wasm functionality locally, use a server that can set COOP/COEP headers.

---

ClipForge © 2026
