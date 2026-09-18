# Reading Tracker

A reading tracker styled like a library bookshelf. No install, no server — it
runs entirely in your browser and saves your books on your own computer (in
`localStorage`). It also does one live internet lookup: fetching a book's
page count from the free [Open Library](https://openlibrary.org/) API.

## How to open it

Double-click the **Reading Tracker** icon on your Desktop. It opens as its
own app window (no browser tabs/address bar).

You can also just double-click `index.html` in this folder to open it in
any browser — it works the same way, just inside a normal browser tab.

## Setting it up on a new computer

Double-click **`Setup Reading Tracker.bat`**. It opens a small setup window
that checks for Chrome or Edge (the only thing this app needs) and creates
the Desktop shortcut for you — no manual steps. Nothing else gets
installed, since this app has no other dependencies (the Open Library
lookup just needs an internet connection at the time you use it).

## How it works

- **The bookshelf**: your books stand on shelves as spines, color-coded by
  status (grey = To Read, gold = Reading, green = Finished). Books pack in to
  fill however wide your window is — the same way text wraps — with faint
  outlined slots showing the remaining room on each shelf. Once a shelf fills
  up, a new shelf appears below it automatically, and resizing the window
  reflows everything live.
- **Reorder books**: press and hold a spine for about a second — it lifts
  into your hand. While still holding, drag it anywhere on the bookshelf
  (even onto a different shelf row) and let go to drop it there. The shelves
  repack around the new order automatically.
- **Open a book**: click its spine to pull up its card — progress bar,
  editable pages read/total, note, status, and a **Finished** checkbox. Close
  it (✕ or click outside) and it goes back on the shelf.
- **Mark finished / unfinished**: tick **Finished** on a book's card to mark
  it done (pages completed snaps to the total, spine turns green). Untick to
  put it back to **Reading**, keeping its page count. You can also set status
  directly from the dropdown.
- **Add books**: double-click **+ Add Books** (top-right) to open the add
  panel — title (with automatic Open Library page-count lookup, editable),
  total pages, pages completed, note, and status. A single click just
  wiggles the button as a reminder that it needs a double-click.
- **Bulk add books**: inside the Add Books panel, open "Bulk add from a
  checklist" and paste a markdown checklist, one book per line:
  ```
  - [ ] The Hobbit
  - [x] Dune
  ```
  Unchecked lines are added as **To Read**, checked lines as **Finished**.
- **Wishlist**: click **Wishlist** (top-left) for a separate list of books
  you might want to read. Add one at a time, or click **Bulk add** (top-right
  of the wishlist panel) to paste a plain list of titles, one per line. Click
  **Start reading** on any wishlist entry to move it onto your shelf (its
  page count is looked up automatically).
- **Delete**: remove a book from its card, or a wishlist entry with its ✕ —
  book removal asks for confirmation first.
- **Light/dark mode**: the sun/moon button (top-right) switches between a
  cream/pastel light theme and a premium charcoal-and-gold dark theme. Your
  choice is remembered.

## Where your data lives

Your books and wishlist are saved in your browser's `localStorage`, tied to
this `index.html` file. That means:

- No account needed. Page-count lookups need an internet connection; adding,
  editing, and everything else works fully offline.
- If you clear Chrome's browsing data, or move/rename this folder and the
  shortcut breaks, your saved data could be lost — there's no backup file.

## Files in this folder

```
reading-tracker/
├── index.html                     <- page structure (bookcase, book/add/wishlist modals)
├── style.css                      <- all visual design (wood-grain shelves, spines, cream/dark themes)
├── script.js                      <- app logic (shelf rendering, CRUD, wishlist, Open Library lookup, theme)
├── icon.ico                       <- custom app icon, used by the Desktop shortcut
├── Setup Reading Tracker.bat      <- double-click to set up / recreate the Desktop shortcut
├── setup.ps1                      <- the setup wizard logic the .bat runs
├── installers/                    <- zip packages for setting this app up on another computer
└── README.md                      <- this file
```
