# Critical Rules
- Never change the `localStorage` key names (`reading-tracker-books`, `reading-tracker-wishlist`, `reading-tracker-theme`) without a migration — this silently wipes a user's saved books.
- Preserve existing book and wishlist data on any change; don't restructure the data model without a migration path.
- Verify data persistence (add data, refresh, confirm it's still there) after every storage-related change.

# Project Purpose
A personal reading tracker styled as a library bookshelf: add books, track pages/progress/notes and status, keep a wishlist, browse in light or dark mode.

# Current Scope
- Add/edit/delete books: title, total pages (auto-looked-up, editable), pages completed, note, status (To Read / Reading / Finished)
- Bulk-add books by pasting a markdown checklist (`- [ ] Title` / `- [x] Title`)
- Bookshelf: spines sized by page count, color-coded by status, dynamically packed to fill the shelf's actual pixel width (like text wrapping) and overflow into a new connected shelf row underneath — no fixed books-per-shelf count, reflows live on window resize, enclosed wood-cabinet visual (back wall, side walls, shared boards)
- Reorder books: long-press (~1s) a spine to lift it into your hand, drag it anywhere on the bookshelf (across rows too), drop to reorder — shelves auto-repack around the new order
- Click a spine to open a book's detail modal — flies in from the spine's position, then a cover + page-flip animation reveals the editable content
- Wishlist (top-left): single/bulk add, "Start reading" promotes an entry onto the shelf with an automatic page-count lookup
- Light/dark theme toggle (cream pastel / charcoal + champagne gold), remembered across sessions
- Desktop shortcut + custom icon, opens as its own app window via Chrome/Edge `--app=` mode

# Architecture
- `index.html` — structure: bookcase, book/add/wishlist modals, confirm overlay
- `style.css` — all visual design: wood-grain shelf/cabinet, spine styling, light/dark theme variables, modal + animation CSS, drag/ghost/pressing visuals
- `script.js` — state (`books[]`, `wishlist[]`) persisted to `localStorage`, shelf rendering, modal open/close + FLIP fly/page-flip animation, Open Library lookup, bulk-import parsing, theme toggle
  - `computeRows()` / `renderRows()` — greedy line-wrap packer that fills each shelf row to the bookcase's actual pixel width (measured via `shelfAvailableWidth()`), wrapping overflow onto new rows; re-run on `renderShelves()` and on a debounced `resize` listener
  - `onSpinePointerDown()` → `beginDrag()` → `onDragMove()`/`hitTestFlatIndex()` → `finishDrag()`/`abortDrag()` — long-press (600ms) drag-to-reorder lifecycle. A floating clone follows the pointer; `renderDragPreview()` reuses `computeRows()` with a ghost placeholder spliced into a filtered copy of `books` so the live preview matches the eventual repack exactly. `books` itself is only mutated on a successful drop
- `icon.ico` — desktop shortcut icon
- Flat folder, no subdirectories, no build step, no dependencies

# Data Model
- Book: `{ id, title, totalPages: number|null, pagesRead: number, note: string, status: "To Read"|"Reading"|"Finished" }`
- Wishlist item: `{ id, title }`

# Development Commands
None — static HTML/CSS/JS, no build/lint/test tooling. Preview via the Browser pane using the `reading-tracker` entry in the workspace's `.claude/launch.json` (`py -3 -m http.server 8792 --directory reading-tracker`), or open `index.html` directly.

# Coding Conventions
- Vanilla JS, no framework, no build step.
- Theming is entirely CSS custom properties on `:root`, with dark-mode overrides under `:root[data-theme="dark"]` — don't hardcode colors outside these variable blocks.
- Status is the literal string `"To Read"` / `"Reading"` / `"Finished"`, used directly as both the data value and the `data-status` attribute — don't introduce a separate enum/id mapping.

# Product Rules
- `pagesRead` is always clamped between `0` and `totalPages` (see `clampPages()`).
- Marking a book Finished (checkbox or status dropdown) snaps `pagesRead` to `totalPages` when `totalPages` is known. Unchecking the Finished checkbox reverts status to `"Reading"` (not `"To Read"`) and keeps the existing page count.
- Shelf rows pack books left-to-right in array order until the next book wouldn't fit the row's actual available width, then wrap to a new row — never a fixed count per row. A book wider than the whole row still always gets placed alone rather than looping forever.
- Book order (the `books[]` array order) is the single source of truth for shelf layout; which row a book visually lands in is always recomputed, never stored.
- Spine width/height scale with `totalPages`, clamped to a 50–1000 page range; an unknown page count defaults to an assumed 280 pages for sizing purposes only (not stored).
- `main`'s `max-width: 1100px` is intentionally kept — dynamic fill/wrap applies fully below that width, but the shelf doesn't keep growing on very wide monitors past it (confirmed with user).

# Available Tools and Capabilities
- Open Library Search API (`https://openlibrary.org/search.json`) — free, no key required, used for page-count lookup on single add, bulk import, and wishlist promotion. No other network calls; everything else is local-only.

# Verification Requirements
Before calling any change done:
- Add a book manually and via bulk-import checklist paste; confirm the Open Library lookup fills total pages and manual override still works.
- Add enough books to overflow a row and confirm a new connected shelf row appears once the actual pixel width fills up (not at a fixed count); resize the window and confirm the shelves live-reflow.
- Long-press (~1s) a spine without moving: confirm it visibly lifts and the book modal does not open; a quick tap still opens the modal.
- Drag a lifted book to a new position (including across rows) and drop it; confirm the final order matches the drop point and persists after a refresh.
- Press Escape mid-drag: confirm nothing moved and no data changed.
- Toggle a book's Finished checkbox and status dropdown; confirm page-count snapping/reverting behaves as specified above.
- Add and promote a wishlist item onto the shelf.
- Delete a book (confirm dialog) and a wishlist item.
- Toggle light/dark theme and refresh — confirm books, wishlist, and theme all persisted with no console errors.
- Check mobile width (375px): no page-level horizontal scroll (shelves should scroll independently instead).

# Known Problems and Lessons
- Fixed-width flex rows (the add-book field row, and originally the 12-spine shelf row) overflow and cause page-level horizontal scroll at narrow widths unless given `flex-wrap` or their own `overflow-x: auto` — always check a new fixed-width row layout at mobile width.
- Automated browser screenshots can't reliably catch sub-second CSS transitions due to tool round-trip latency. To visually verify an animation, stage a mid-transition frame manually (set `transform`/`opacity` with `transition: none`) rather than trying to time a live screenshot.
- `const`/`let` declared in one `javascript_tool` debug eval persists in the page's global scope for later evals against the same page — wrap ad hoc debug scripts in an IIFE to avoid "already declared" errors.
- The Browser pane's `resize_window` tool changes the CDP viewport but doesn't reliably dispatch a native `window` `resize` event, so shelf-reflow testing after a `resize_window` call needs a manual `window.dispatchEvent(new Event("resize"))` (or a direct `renderShelves()` call) to see the update — real OS window resizes in an actual browser fire `resize` normally, so this is a preview-tool quirk, not an app bug. The `computer` screenshot action was also unreliable (consistent 30s timeouts) during this session; drag/reflow behavior was instead verified via `javascript_tool` DOM/localStorage inspection and dispatched `PointerEvent`/`KeyboardEvent` sequences.

# Out of Scope
- Accounts or cloud sync — everything is local-only via `localStorage`.
- Multiple bookshelves/libraries, or tagging/categories beyond status.
- Editing a book's title after it's created.
- Author field, cover images, ISBN, or other metadata beyond title and page count.
