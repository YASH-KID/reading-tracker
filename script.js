const BOOKS_KEY = "reading-tracker-books";
const WISHLIST_KEY = "reading-tracker-wishlist";
const THEME_KEY = "reading-tracker-theme";
const STATUSES = ["To Read", "Reading", "Finished"];

let books = loadBooks();
let wishlist = loadWishlist();
let currentBookId = null;
let pendingDelete = null; // { type: "book" | "wishlist", id }
let totalPagesTouchedByUser = false;
let lookupTimer = null;
let pressState = null; // { book, spineEl, timer, startX, startY }
let dragState = null; // { book, withoutDragged, flatIndex, cloneEl, dims }
let dragEngaged = false; // true right after a drag drop, to swallow the trailing click event

// ---------- Element refs ----------

const shelvesContainer = document.getElementById("shelvesContainer");

const wishlistBtn = document.getElementById("wishlistBtn");
const addBooksBtn = document.getElementById("addBooksBtn");
const themeToggle = document.getElementById("themeToggle");

const addModalOverlay = document.getElementById("addModalOverlay");
const addForm = document.getElementById("addForm");
const titleInput = document.getElementById("titleInput");
const totalPagesInput = document.getElementById("totalPagesInput");
const pagesReadInput = document.getElementById("pagesReadInput");
const statusInput = document.getElementById("statusInput");
const noteInput = document.getElementById("noteInput");
const lookupHint = document.getElementById("lookupHint");
const bulkInput = document.getElementById("bulkInput");
const bulkImportBtn = document.getElementById("bulkImportBtn");
const bulkStatus = document.getElementById("bulkStatus");

const bookModalOverlay = document.getElementById("bookModalOverlay");
const modalTitle = document.getElementById("modalTitle");
const modalStatusBadge = document.getElementById("modalStatusBadge");
const modalProgressFill = document.getElementById("modalProgressFill");
const modalProgressPct = document.getElementById("modalProgressPct");
const modalPagesRead = document.getElementById("modalPagesRead");
const modalTotalPages = document.getElementById("modalTotalPages");
const modalNote = document.getElementById("modalNote");
const modalFinished = document.getElementById("modalFinished");
const modalStatus = document.getElementById("modalStatus");
const modalDeleteBtn = document.getElementById("modalDeleteBtn");

const wishlistModalOverlay = document.getElementById("wishlistModalOverlay");
const wishlistBulkToggle = document.getElementById("wishlistBulkToggle");
const wishlistBulk = document.getElementById("wishlistBulk");
const wishlistBulkInput = document.getElementById("wishlistBulkInput");
const wishlistBulkImportBtn = document.getElementById("wishlistBulkImportBtn");
const wishlistBulkStatus = document.getElementById("wishlistBulkStatus");
const wishlistAddForm = document.getElementById("wishlistAddForm");
const wishlistTitleInput = document.getElementById("wishlistTitleInput");
const wishlistList = document.getElementById("wishlistList");
const wishlistEmpty = document.getElementById("wishlistEmpty");

const confirmOverlay = document.getElementById("confirmOverlay");
const confirmMessage = document.getElementById("confirmMessage");
const confirmCancel = document.getElementById("confirmCancel");
const confirmOk = document.getElementById("confirmOk");

// ---------- Storage ----------

function loadBooks() {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBooks() {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
}

function loadWishlist() {
  try {
    const raw = localStorage.getItem(WISHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWishlist() {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function clampPages(read, total) {
  let r = Number.isFinite(read) ? Math.max(0, Math.round(read)) : 0;
  if (Number.isFinite(total) && total > 0) r = Math.min(r, total);
  return r;
}

// ---------- Open Library page-count lookup ----------

async function lookupPageCount(title) {
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1&fields=title,number_of_pages_median`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("lookup failed");
  const data = await res.json();
  const doc = data.docs && data.docs[0];
  const pages = doc && doc.number_of_pages_median;
  return Number.isFinite(pages) && pages > 0 ? Math.round(pages) : null;
}

titleInput.addEventListener("input", () => {
  clearTimeout(lookupTimer);
  if (totalPagesTouchedByUser) return;
  const title = titleInput.value.trim();
  if (!title) {
    lookupHint.textContent = "";
    return;
  }
  lookupHint.textContent = "Looking up page count…";
  lookupTimer = setTimeout(async () => {
    try {
      const pages = await lookupPageCount(title);
      if (totalPagesTouchedByUser) return;
      if (pages) {
        totalPagesInput.value = pages;
        lookupHint.textContent = `Found ${pages} pages via Open Library`;
      } else {
        lookupHint.textContent = "Couldn't find a page count — enter it manually";
      }
    } catch {
      lookupHint.textContent = "Lookup unavailable — enter page count manually";
    }
  }, 700);
});

totalPagesInput.addEventListener("input", () => {
  totalPagesTouchedByUser = true;
});

// ---------- Add single book ----------

addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;

  const totalPages = totalPagesInput.value ? Number(totalPagesInput.value) : null;
  let pagesRead = clampPages(Number(pagesReadInput.value), totalPages);
  let status = statusInput.value;

  if (status === "Finished" && totalPages) pagesRead = totalPages;

  books.push({
    id: makeId(),
    title,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : null,
    pagesRead,
    note: noteInput.value.trim().slice(0, 200),
    status
  });

  saveBooks();
  renderShelves();
  addForm.reset();
  statusInput.value = "To Read";
  totalPagesTouchedByUser = false;
  lookupHint.textContent = "";
  titleInput.focus();
});

// ---------- Bulk import (books) ----------

function parseChecklist(text) {
  const lines = text.split("\n");
  const items = [];
  const re = /^\s*[-*+]\s*\[( |x|X)\]\s*(.+?)\s*$/;
  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const checked = m[1].toLowerCase() === "x";
    const title = m[2].trim();
    if (title) items.push({ title, checked });
  }
  return items;
}

bulkImportBtn.addEventListener("click", async () => {
  const items = parseChecklist(bulkInput.value);
  if (items.length === 0) {
    bulkStatus.textContent = "No checklist lines found. Use \"- [ ] Title\" format.";
    return;
  }

  bulkImportBtn.disabled = true;
  let done = 0;
  for (const item of items) {
    bulkStatus.textContent = `Importing ${done + 1} of ${items.length}…`;
    let totalPages = null;
    try {
      totalPages = await lookupPageCount(item.title);
    } catch {
      totalPages = null;
    }
    books.push({
      id: makeId(),
      title: item.title,
      totalPages: totalPages || null,
      pagesRead: item.checked && totalPages ? totalPages : 0,
      note: "",
      status: item.checked ? "Finished" : "To Read"
    });
    done++;
    saveBooks();
    renderShelves();
    await new Promise((r) => setTimeout(r, 250));
  }
  bulkStatus.textContent = `Imported ${items.length} book${items.length === 1 ? "" : "s"}.`;
  bulkInput.value = "";
  bulkImportBtn.disabled = false;
});

// ---------- Bookshelf rendering ----------

const SPINE_MIN_PAGES = 50;
const SPINE_MAX_PAGES = 1000;
const SPINE_DEFAULT_PAGES = 280; // used when a book's page count is unknown

const SHELF_GAP = 6; // matches .spines gap in style.css
const SPINES_PADDING_X = 36; // matches .spines left+right padding (18px * 2) in style.css
const SPINES_PADDING_X_MOBILE = 28; // matches .spines padding at the <=560px breakpoint (14px * 2)
const MOBILE_BREAKPOINT = 560;
const EMPTY_SLOT_WIDTH = 44; // matches .spine.empty-slot width in style.css

function spineDims(book) {
  const rawPages = book.totalPages;
  const pages = Number.isFinite(rawPages) && rawPages > 0 ? rawPages : SPINE_DEFAULT_PAGES;
  const clamped = Math.min(Math.max(pages, SPINE_MIN_PAGES), SPINE_MAX_PAGES);
  const t = (clamped - SPINE_MIN_PAGES) / (SPINE_MAX_PAGES - SPINE_MIN_PAGES);
  const width = Math.round(32 + t * 30); // 32-62px: thin book -> thick book
  const height = Math.round(126 + t * 44); // 126-170px: short book -> tall book
  return { width, height };
}

function itemWidth(item) {
  return item.__ghost ? item.width : spineDims(item).width;
}

function shelfAvailableWidth() {
  const bookcase = document.querySelector(".bookcase");
  const style = getComputedStyle(bookcase);
  const bookcasePad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
  const spinesPad = window.innerWidth <= MOBILE_BREAKPOINT ? SPINES_PADDING_X_MOBILE : SPINES_PADDING_X;
  return Math.max(0, bookcase.clientWidth - bookcasePad - spinesPad);
}

// Greedily wraps items (books, or a ghost placeholder during drag) into rows that
// fill the available shelf width, the same way text wraps -- no fixed count per row.
function computeRows(itemList, availableWidth) {
  const rows = [];
  const rowWidths = [];
  let current = [];
  let currentWidth = 0;
  for (const item of itemList) {
    const w = itemWidth(item);
    const addWidth = current.length ? w + SHELF_GAP : w;
    if (current.length && currentWidth + addWidth > availableWidth) {
      rows.push(current);
      rowWidths.push(currentWidth);
      current = [item];
      currentWidth = w;
    } else {
      current.push(item);
      currentWidth += addWidth;
    }
  }
  rows.push(current); // always at least one row, even if empty
  rowWidths.push(currentWidth);
  return { rows, rowWidths };
}

function emptySlotCount(rowWidth, rowHasItems, availableWidth) {
  let leftover = availableWidth - rowWidth;
  if (rowHasItems) leftover -= SHELF_GAP;
  if (leftover < EMPTY_SLOT_WIDTH) return 0;
  return Math.floor((leftover + SHELF_GAP) / (EMPTY_SLOT_WIDTH + SHELF_GAP));
}

function renderShelves() {
  renderRows(computeRows(books, shelfAvailableWidth()));
}

function renderRows({ rows, rowWidths }) {
  shelvesContainer.innerHTML = "";
  const availableWidth = shelfAvailableWidth();
  let flatIndex = 0;

  rows.forEach((rowItems, r) => {
    const shelfRow = document.createElement("div");
    shelfRow.className = "shelf-row";
    shelfRow.dataset.rowStartIndex = flatIndex;

    const track = document.createElement("div");
    track.className = "shelf-track";

    const spinesEl = document.createElement("div");
    spinesEl.className = "spines";

    for (const item of rowItems) {
      if (item.__ghost) {
        spinesEl.appendChild(createGhostSlot(item));
      } else {
        spinesEl.appendChild(createSpine(item, flatIndex));
        flatIndex++;
      }
    }

    const slots = emptySlotCount(rowWidths[r], rowItems.length > 0, availableWidth);
    for (let i = 0; i < slots; i++) {
      spinesEl.appendChild(createEmptySlot());
    }

    const board = document.createElement("div");
    board.className = "shelf-board";

    track.appendChild(spinesEl);
    track.appendChild(board);
    shelfRow.appendChild(track);
    shelvesContainer.appendChild(shelfRow);
  });
}

function createSpine(book, flatIndex) {
  const dims = spineDims(book);
  const spine = document.createElement("div");
  spine.className = "spine";
  spine.dataset.status = book.status;
  spine.dataset.flatIndex = flatIndex;
  spine.dataset.bookId = book.id;
  spine.style.height = `${dims.height}px`;
  spine.style.width = `${dims.width}px`;
  spine.title = book.title;

  const label = document.createElement("span");
  label.textContent = book.title;
  spine.appendChild(label);

  spine.addEventListener("click", () => {
    if (dragEngaged) {
      dragEngaged = false;
      return;
    }
    openBookModal(book.id, spine);
  });
  spine.addEventListener("pointerdown", (e) => onSpinePointerDown(e, book, spine));
  return spine;
}

function createEmptySlot() {
  const slot = document.createElement("div");
  slot.className = "spine empty-slot";
  return slot;
}

function createGhostSlot(item) {
  const slot = document.createElement("div");
  slot.className = "spine ghost-slot";
  slot.style.height = `${item.height}px`;
  slot.style.width = `${item.width}px`;
  return slot;
}

let shelfResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(shelfResizeTimer);
  shelfResizeTimer = setTimeout(() => {
    if (dragState) return; // don't reflow mid-drag; the drag preview owns rendering until drop
    renderShelves();
  }, 150);
});

// ---------- Long-press drag to reorder ----------

const LONG_PRESS_MS = 600; // ~"hold for about a second" before a book lifts into your hand
const PRESS_MOVE_CANCEL_PX = 8; // movement beyond this before the hold completes cancels it (treat as a click)

function onSpinePointerDown(e, book, spineEl) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  clearPressState();
  const startX = e.clientX;
  const startY = e.clientY;
  const timer = setTimeout(() => beginDrag(book, spineEl, startX, startY), LONG_PRESS_MS);
  pressState = { book, spineEl, timer, startX, startY };
  spineEl.classList.add("pressing");
  document.addEventListener("pointermove", onPressMove);
  document.addEventListener("pointerup", onPressUp);
  document.addEventListener("pointercancel", onPressUp);
}

function onPressMove(e) {
  if (!pressState) return;
  const dx = e.clientX - pressState.startX;
  const dy = e.clientY - pressState.startY;
  if (Math.hypot(dx, dy) > PRESS_MOVE_CANCEL_PX) clearPressState();
}

function onPressUp() {
  clearPressState();
}

function clearPressState() {
  if (!pressState) return;
  clearTimeout(pressState.timer);
  pressState.spineEl.classList.remove("pressing");
  pressState = null;
  document.removeEventListener("pointermove", onPressMove);
  document.removeEventListener("pointerup", onPressUp);
  document.removeEventListener("pointercancel", onPressUp);
}

function beginDrag(book, spineEl, clientX, clientY) {
  clearPressState();
  dragEngaged = true;

  const rect = spineEl.getBoundingClientRect();
  const dims = spineDims(book);
  const clone = document.createElement("div");
  clone.className = "spine book-drag-clone";
  clone.dataset.status = book.status;
  clone.style.width = `${dims.width}px`;
  clone.style.height = `${dims.height}px`;
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  const label = document.createElement("span");
  label.textContent = book.title;
  clone.appendChild(label);
  document.body.appendChild(clone);
  clone.getBoundingClientRect(); // force reflow so the lift transition plays from the resting position
  clone.classList.add("lifted");

  document.body.classList.add("dragging-book");

  const withoutDragged = books.filter((b) => b.id !== book.id);
  const originalIndex = books.findIndex((b) => b.id === book.id);

  dragState = {
    book,
    withoutDragged,
    flatIndex: Math.min(originalIndex, withoutDragged.length),
    cloneEl: clone,
    dims
  };

  positionClone(clientX, clientY);
  renderDragPreview();

  document.addEventListener("pointermove", onDragMove);
  document.addEventListener("pointerup", onDragUp);
  document.addEventListener("pointercancel", onDragCancel);
  document.addEventListener("keydown", onDragKeydown);
}

function positionClone(clientX, clientY) {
  if (!dragState) return;
  const { width, height } = dragState.dims;
  dragState.cloneEl.style.left = `${clientX - width / 2}px`;
  dragState.cloneEl.style.top = `${clientY - height / 2 - 24}px`;
}

function onDragMove(e) {
  if (!dragState) return;
  positionClone(e.clientX, e.clientY);
  const newIndex = hitTestFlatIndex(e.clientX, e.clientY);
  if (newIndex !== dragState.flatIndex) {
    dragState.flatIndex = newIndex;
    renderDragPreview();
  }
}

function onDragUp() {
  if (dragState) finishDrag();
}

function onDragCancel() {
  abortDrag();
}

function onDragKeydown(e) {
  if (e.key === "Escape") abortDrag();
}

function renderDragPreview() {
  if (!dragState) return;
  const ghost = { __ghost: true, width: dragState.dims.width, height: dragState.dims.height };
  const items = dragState.withoutDragged.slice();
  items.splice(dragState.flatIndex, 0, ghost);
  renderRows(computeRows(items, shelfAvailableWidth()));
}

function hitTestFlatIndex(clientX, clientY) {
  const rowEls = Array.from(shelvesContainer.querySelectorAll(".shelf-row"));
  if (rowEls.length === 0) return 0;

  let targetRow = rowEls[0];
  let bestDist = Infinity;
  for (const rowEl of rowEls) {
    const rect = rowEl.getBoundingClientRect();
    const dist = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    if (dist < bestDist) {
      bestDist = dist;
      targetRow = rowEl;
    }
    if (dist === 0) break;
  }

  const spineEls = Array.from(targetRow.querySelectorAll(".spine[data-flat-index]"));
  if (spineEls.length === 0) return Number(targetRow.dataset.rowStartIndex);

  for (const spineEl of spineEls) {
    const rect = spineEl.getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) return Number(spineEl.dataset.flatIndex);
  }
  return Number(spineEls[spineEls.length - 1].dataset.flatIndex) + 1;
}

function finishDrag() {
  const { book, withoutDragged, flatIndex, cloneEl } = dragState;
  const finalBooks = withoutDragged.slice();
  finalBooks.splice(flatIndex, 0, book);
  books = finalBooks;
  saveBooks();

  teardownDragListeners();
  dragState = null;
  renderShelves();

  const landedEl = shelvesContainer.querySelector(`.spine[data-book-id="${book.id}"]`);
  if (landedEl) {
    const targetRect = landedEl.getBoundingClientRect();
    cloneEl.style.transition =
      "left 0.22s cubic-bezier(.22,.85,.35,1), top 0.22s cubic-bezier(.22,.85,.35,1), transform 0.22s cubic-bezier(.22,.85,.35,1), box-shadow 0.22s ease";
    cloneEl.style.left = `${targetRect.left}px`;
    cloneEl.style.top = `${targetRect.top}px`;
    cloneEl.style.transform = "none";
    setTimeout(() => cloneEl.remove(), 230);
  } else {
    cloneEl.remove();
  }

  document.body.classList.remove("dragging-book");
  setTimeout(() => {
    dragEngaged = false;
  }, 0);
}

function abortDrag() {
  if (!dragState) return;
  dragState.cloneEl.remove();
  document.body.classList.remove("dragging-book");
  teardownDragListeners();
  dragState = null;
  renderShelves();
  setTimeout(() => {
    dragEngaged = false;
  }, 0);
}

function teardownDragListeners() {
  document.removeEventListener("pointermove", onDragMove);
  document.removeEventListener("pointerup", onDragUp);
  document.removeEventListener("pointercancel", onDragCancel);
  document.removeEventListener("keydown", onDragKeydown);
}

// ---------- Book detail modal ----------

function getBook(id) {
  return books.find((b) => b.id === id) || null;
}

const bookModal = bookModalOverlay.querySelector(".book-modal");

function openBookModal(id, originEl) {
  currentBookId = id;
  refreshBookModal();
  bookModalOverlay.classList.add("open");
  animateBookOpen(originEl);
}

function buildBookLeaves() {
  const wrap = document.createElement("div");
  wrap.className = "book-leaves";
  // Ordered bottom-to-top in the DOM: the last one appended sits on top,
  // so it's what you see first, and it flips open soonest.
  const specs = [
    { cls: "page", delay: 160 },
    { cls: "page", delay: 80 },
    { cls: "cover", delay: 0 }
  ];
  for (const spec of specs) {
    const leaf = document.createElement("div");
    leaf.className = `book-leaf ${spec.cls}`;
    leaf.style.transitionDelay = `${spec.delay}ms`;
    wrap.appendChild(leaf);
  }
  return wrap;
}

function animateBookOpen(originEl) {
  bookModal.querySelector(".book-leaves")?.remove();
  if (!originEl) return;

  const firstRect = originEl.getBoundingClientRect();
  const lastRect = bookModal.getBoundingClientRect();

  const dx = firstRect.left + firstRect.width / 2 - (lastRect.left + lastRect.width / 2);
  const dy = firstRect.top + firstRect.height / 2 - (lastRect.top + lastRect.height / 2);
  const scaleX = firstRect.width / lastRect.width;
  const scaleY = firstRect.height / lastRect.height;

  const leaves = buildBookLeaves();
  bookModal.appendChild(leaves);

  bookModal.style.transition = "none";
  bookModal.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY}) rotateY(-75deg)`;
  bookModal.style.opacity = "1";
  // eslint-disable-next-line no-unused-expressions
  bookModal.getBoundingClientRect(); // force reflow so the "from" state renders before transitioning
  bookModal.style.transition = "transform 0.42s cubic-bezier(.22,.85,.35,1)";
  bookModal.style.transform = "translate(0, 0) scale(1, 1) rotateY(0deg)";

  setTimeout(() => {
    leaves.querySelectorAll(".book-leaf").forEach((leaf) => leaf.classList.add("flipped"));
    setTimeout(() => leaves.remove(), 620);
  }, 400);
}

function closeBookModal() {
  bookModal.querySelector(".book-leaves")?.remove();
  bookModal.style.transition = "transform 0.26s ease-in, opacity 0.26s ease-in";
  bookModal.style.transform = "translateY(50px) scale(0.82) rotateY(45deg)";
  bookModal.style.opacity = "0";
  setTimeout(() => {
    bookModalOverlay.classList.remove("open");
    bookModal.style.transition = "";
    bookModal.style.transform = "";
    bookModal.style.opacity = "";
  }, 260);
}

function refreshBookModal() {
  const book = getBook(currentBookId);
  if (!book) {
    closeOverlay(bookModalOverlay);
    return;
  }
  modalTitle.textContent = book.title;
  modalStatusBadge.textContent = book.status;
  modalStatusBadge.dataset.status = book.status;

  const total = book.totalPages;
  const pct = total ? Math.round((book.pagesRead / total) * 100) : 0;
  modalProgressFill.style.width = `${total ? pct : 0}%`;
  modalProgressPct.textContent = total ? `${pct}%` : "no page count yet";

  modalPagesRead.value = book.pagesRead;
  modalTotalPages.value = book.totalPages || "";
  modalNote.value = book.note || "";
  modalFinished.checked = book.status === "Finished";
  modalStatus.value = book.status;
}

modalPagesRead.addEventListener("change", () => {
  const book = getBook(currentBookId);
  if (!book) return;
  book.pagesRead = clampPages(Number(modalPagesRead.value), book.totalPages);
  saveBooks();
  refreshBookModal();
});

modalTotalPages.addEventListener("change", () => {
  const book = getBook(currentBookId);
  if (!book) return;
  const val = Number(modalTotalPages.value);
  book.totalPages = Number.isFinite(val) && val > 0 ? val : null;
  book.pagesRead = clampPages(book.pagesRead, book.totalPages);
  saveBooks();
  refreshBookModal();
});

modalNote.addEventListener("change", () => {
  const book = getBook(currentBookId);
  if (!book) return;
  book.note = modalNote.value.trim().slice(0, 200);
  saveBooks();
});

modalFinished.addEventListener("change", () => {
  const book = getBook(currentBookId);
  if (!book) return;
  if (modalFinished.checked) {
    book.status = "Finished";
    if (book.totalPages) book.pagesRead = book.totalPages;
  } else {
    book.status = "Reading";
  }
  saveBooks();
  refreshBookModal();
  renderShelves();
});

modalStatus.addEventListener("change", () => {
  const book = getBook(currentBookId);
  if (!book) return;
  book.status = modalStatus.value;
  if (book.status === "Finished" && book.totalPages) book.pagesRead = book.totalPages;
  saveBooks();
  refreshBookModal();
  renderShelves();
});

modalDeleteBtn.addEventListener("click", () => {
  const book = getBook(currentBookId);
  if (!book) return;
  pendingDelete = { type: "book", id: book.id };
  confirmMessage.textContent = `Remove "${book.title}" from your shelf?`;
  confirmOverlay.classList.add("open");
});

// ---------- Wishlist ----------

function renderWishlist() {
  wishlistList.innerHTML = "";
  wishlistEmpty.style.display = wishlist.length === 0 ? "block" : "none";

  for (const item of wishlist) {
    const li = document.createElement("li");
    li.className = "wishlist-item";

    const span = document.createElement("span");
    span.textContent = item.title;
    li.appendChild(span);

    const actions = document.createElement("div");
    actions.className = "wishlist-actions";

    const startBtn = document.createElement("button");
    startBtn.className = "primary-btn";
    startBtn.textContent = "Start reading";
    startBtn.addEventListener("click", () => promoteWishlistItem(item.id));

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove from wishlist";
    removeBtn.addEventListener("click", () => {
      pendingDelete = { type: "wishlist", id: item.id };
      confirmMessage.textContent = `Remove "${item.title}" from your wishlist?`;
      confirmOverlay.classList.add("open");
    });

    actions.appendChild(startBtn);
    actions.appendChild(removeBtn);
    li.appendChild(actions);
    wishlistList.appendChild(li);
  }
}

async function promoteWishlistItem(id) {
  const item = wishlist.find((w) => w.id === id);
  if (!item) return;

  wishlist = wishlist.filter((w) => w.id !== id);
  saveWishlist();
  renderWishlist();

  let totalPages = null;
  try {
    totalPages = await lookupPageCount(item.title);
  } catch {
    totalPages = null;
  }

  books.push({
    id: makeId(),
    title: item.title,
    totalPages: totalPages || null,
    pagesRead: 0,
    note: "",
    status: "To Read"
  });
  saveBooks();
  renderShelves();
}

wishlistAddForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const title = wishlistTitleInput.value.trim();
  if (!title) return;
  wishlist.push({ id: makeId(), title });
  saveWishlist();
  renderWishlist();
  wishlistAddForm.reset();
  wishlistTitleInput.focus();
});

wishlistBulkToggle.addEventListener("click", () => {
  wishlistBulk.hidden = !wishlistBulk.hidden;
});

wishlistBulkImportBtn.addEventListener("click", () => {
  const lines = wishlistBulkInput.value
    .split("\n")
    .map((l) => l.replace(/^\s*[-*+]\s*(\[[ xX]\])?\s*/, "").trim())
    .filter(Boolean);

  if (lines.length === 0) {
    wishlistBulkStatus.textContent = "No titles found — one per line.";
    return;
  }

  for (const title of lines) {
    wishlist.push({ id: makeId(), title });
  }
  saveWishlist();
  renderWishlist();
  wishlistBulkStatus.textContent = `Added ${lines.length} book${lines.length === 1 ? "" : "s"} to your wishlist.`;
  wishlistBulkInput.value = "";
});

// ---------- Confirm overlay ----------

confirmCancel.addEventListener("click", () => {
  pendingDelete = null;
  confirmOverlay.classList.remove("open");
});

confirmOk.addEventListener("click", () => {
  if (pendingDelete?.type === "book") {
    books = books.filter((b) => b.id !== pendingDelete.id);
    saveBooks();
    renderShelves();
    if (currentBookId === pendingDelete.id) closeOverlay(bookModalOverlay);
  } else if (pendingDelete?.type === "wishlist") {
    wishlist = wishlist.filter((w) => w.id !== pendingDelete.id);
    saveWishlist();
    renderWishlist();
  }
  pendingDelete = null;
  confirmOverlay.classList.remove("open");
});

// ---------- Modal open/close plumbing ----------

function openOverlay(overlay) {
  overlay.classList.add("open");
}

function closeOverlay(overlay) {
  overlay.classList.remove("open");
}

document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.close;
    if (target === "book") closeBookModal();
    if (target === "add") closeOverlay(addModalOverlay);
    if (target === "wishlist") closeOverlay(wishlistModalOverlay);
  });
});

bookModalOverlay.addEventListener("click", (e) => {
  if (e.target === bookModalOverlay) closeBookModal();
});

[addModalOverlay, wishlistModalOverlay].forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeOverlay(overlay);
  });
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (confirmOverlay.classList.contains("open")) {
    confirmOverlay.classList.remove("open");
    pendingDelete = null;
    return;
  }
  if (bookModalOverlay.classList.contains("open")) closeBookModal();
  [addModalOverlay, wishlistModalOverlay].forEach(closeOverlay);
});

wishlistBtn.addEventListener("click", () => {
  renderWishlist();
  openOverlay(wishlistModalOverlay);
});

addBooksBtn.addEventListener("click", () => {
  addBooksBtn.classList.remove("hint-shake");
  void addBooksBtn.offsetWidth;
  addBooksBtn.classList.add("hint-shake");
});

addBooksBtn.addEventListener("dblclick", () => {
  addBooksBtn.classList.remove("hint-shake");
  openOverlay(addModalOverlay);
});

// ---------- Theme ----------

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "☀️" : "🌙";
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(prefersDark ? "dark" : "light");
  }
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

// ---------- Init ----------

initTheme();
renderShelves();
