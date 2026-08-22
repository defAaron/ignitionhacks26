# existing-site — sketch edits onto a pre-existing website

Import a live URL (or drop an `.html` file onto a page). The site is painted
faintly **under** the page so you sketch additions and changes on top of it.
When the page is Sealed, the original document plus your sketched elements go
to Claude with instructions to **modify the existing site** — keep everything
that's there, integrate the new elements in flow, styled to match — instead of
generating a page from scratch.

## Enable

```
NEXT_PUBLIC_MODULE_EXISTING_SITE=1
```

With the flag unset: no UI, `/api/import-site` returns 404, the Frame request
and prompt are byte-identical to stock.

## Use

1. Focus a page, switch to browse mode → **Start from a site** pill (left of Seal).
2. Paste a URL → Import. Or drop an `.html` file anywhere on the page.
3. Pick how to use it:
   - **Sketch on top** — the page shows faintly under your ink as a guide.
     Seal sends the real site plus your sketch to Claude, which edits it.
   - **Turn into elements** — its backgrounds (page colour/gradient and any
     wide coloured band: nav, hero, footer), buttons, headings, paragraphs,
     links, inputs, images and nav are measured from a hidden render and placed on the canvas
     as ordinary editable elements. The guide hides automatically so nothing
     doubles up. **Choose elements…** lets you keep a subset; re-extracting
     replaces the previous set (ids are tracked in `baseSite.extractedIds`).
4. Seal.

## Layout

```
modules/existing-site/
  index.ts                    public surface (everything the app imports)
  flag.ts                     existingSiteEnabled()
  types.ts                    BaseSite, FrameBaseSite, ImportSite{Request,Response}
  html.ts                     injectBaseHref, extractTitle, trimHtml, stripScriptsForPreview, makeBaseSite
  prompt.ts                   buildBaseSitePromptSection()  → prepended to the Frame user message
  detect.ts                   detectSiteElements() (hidden same-origin, script-free iframe + getBoundingClientRect) and detectedToPageElements()
  server/ssrf.ts              validatePublicUrl(): http(s) only, no creds, blocks private/link-local/loopback (literal + resolved)
  server/fetch-site.ts        10s timeout, 2MB cap, manual redirects (≤3, each re-validated), text/html only
  server/handler.ts           POST handler for /api/import-site
  components/BaseSiteLayer.tsx    inert sandboxed iframe under the page (sandbox="", scripts stripped, pointer-events none)
  components/ImportSiteControl.tsx pill + guided popover; isHtmlFile / readHtmlFile
  components/BaseSiteRow.tsx       the site's pinned row in the element manager + 'from site' tags
app/api/import-site/route.ts  1-line shim re-exporting server/handler
```

`baseSite` is stored on `Page` (`lib/page.ts`), so it travels with the page and
is in scope at seal time. Only the HTML lane (`/api/frame`) receives it.

## Hook lines (every one is tagged `// [existing-site]`)

| File | What |
|---|---|
| `lib/page.ts` | `Page.baseSite?` |
| `lib/frame/types.ts` | `FrameRequest.baseSite?` |
| `lib/frame/space-types.ts` | `SealedFrame.input.baseSite?` |
| `app/api/frame/route.ts` | import + prepend prompt section to the user message |
| `app/api/import-site/route.ts` | the shim file |
| `components/Studio.tsx` | import; `handleFile` `.html` branch; root `onDrop` gate; `<BaseSiteLayer>` in both `.page-clip`s; `<ImportSiteControl>` beside Seal (with `pageWidth`/`pageHeight`/`onExtract={(els) => setPage((p) => applyExtraction(p, els))}`); `bodyHtml` + `post()` + `setSeals` input in `seal()`; `tags`/`header` props on `<ElementManager>` |
| `.env.example` | the flag |

## Remove

```
grep -rn "\[existing-site\]" product/      # delete every listed line
rm -r product/modules/existing-site product/app/api/import-site
npm run typecheck
```

## Known limitations

- The Vite app lane (`/api/frame-app`) and the space's app bundle ignore the
  base site — they still generate from sketched elements only. The stitched
  multi-page HTML site does include the modified page (it reuses the sealed HTML).
- The injected `<base href>` keeps the site's assets working in the preview, but
  in a downloaded multi-page bundle relative links resolve against the original
  origin.
- `stitchHtmlSite` injects baio's nav after `<body>`, so it lands above the
  site's own header.
- Documents over ~150KB are trimmed before prompting (comments, script bodies,
  inline SVG, long styles/data URLs); very large pages may exceed the 64k output
  budget. Works best on pages under ~100KB.
- The preview is page-height only (1200×page height); scroll the studio page to
  grow it and reveal more of the site.
- Sealing requires at least one sketched element (stock `/api/frame` rule).
- Detection maps onto baio's plain UI kinds (button, heading, paragraph,
  input, checkbox, image, navbar, text) plus `rect` shapes for backgrounds
  (solid fills and linear gradients; background images are not extracted).
  Cards and other composite blocks are not extracted. Layout is measured at page width ×
  page height with scripts off, so JS-rendered content is invisible to it.
- Images from a dropped `.html` file only carry a `src` when it is absolute.
