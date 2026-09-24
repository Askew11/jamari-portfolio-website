/* Desktop edition: customizable desktop icons and dock.
   Computers: drag icons around a snapping grid, drag apps into and within the dock, drag them off the dock onto
   the desktop, and right-click for menus.
   Phones: press and hold an icon to enter edit mode, then drag to rearrange the home screen and dock.
   Settings has a Desktop & Dock checklist that does the same without dragging. Saved in localStorage. */
(function () {
    'use strict';

    var D = window.JBDesktop;
    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

    var KEY = 'jb-layout';
    var CW = 96, CH = 98;            // desktop icon grid cell
    var PHONE_DOCK_MAX = 4;
    var LONG_PRESS_MS = 450;

    var desktop = $('#desktop');
    var iconsUl = $('.desk-icons');
    var dockEl = $('.dock');
    var dockUl = $('.dock-apps');

    var phone = function () { return D.isPhone(); };
    var clamp = function (n, lo, hi) { return Math.max(lo, Math.min(hi, n)); };

    /* ---------------- App registry, read from the page's own markup ---------------- */

    var APPS = {};
    var ORDER = [];
    $$('.desk-icon', iconsUl).forEach(function (el) {
        var id = el.dataset.open || 'classic';
        ORDER.push(id);
        APPS[id] = {
            label: $('.label', el).textContent,
            icon: $('.app-icon', el).cloneNode(true),
            open: el.dataset.open || null,
            href: el.dataset.open ? null : el.getAttribute('href')
        };
    });
    $$('.dock-btn', dockEl).forEach(function (el) {
        var id = el.dataset.open || 'classic';
        if (APPS[id]) APPS[id].dockLabel = el.getAttribute('aria-label');
    });
    function dockLabel(id) { return APPS[id].dockLabel || APPS[id].label; }

    function openById(id, opener) {
        if (APPS[id].open) D.open(APPS[id].open, opener);
        else window.location.href = APPS[id].href;
    }

    /* ---------------- Saved layout ---------------- */

    var DEFAULTS = {
        desk: ['about', 'experience', 'projects', 'resume', 'snake', 'astar', 'contact', 'classic'],
        dock: ['about', 'experience', 'projects', 'resume', 'contact', 'snake', 'astar', 'browser', 'terminal', 'notes', 'calculator', 'settings', 'classic'],
        home: ['experience', 'snake', 'astar', 'browser', 'terminal', 'notes', 'calculator', 'settings', 'classic'],
        phoneDock: ['about', 'projects', 'resume', 'contact']
    };

    function cleanList(list) {
        if (!Array.isArray(list)) return null;
        return list.filter(function (id, i) { return APPS[id] && list.indexOf(id) === i; });
    }

    function loadState() {
        var saved = {};
        try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
        return {
            desk: cleanList(saved.desk) || DEFAULTS.desk.slice(),
            pos: saved.pos && typeof saved.pos === 'object' ? saved.pos : null,   // null = arrange automatically
            dock: cleanList(saved.dock) || DEFAULTS.dock.slice(),
            home: cleanList(saved.home) || DEFAULTS.home.slice(),
            phoneDock: (cleanList(saved.phoneDock) || DEFAULTS.phoneDock.slice()).slice(0, PHONE_DOCK_MAX)
        };
    }

    var state = loadState();

    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    }

    // The lists for whichever layout is showing: desktop + dock on computers, home screen + dock on phones.
    function iconList() { return phone() ? state.home : state.desk; }
    function dockList() { return phone() ? state.phoneDock : state.dock; }

    /* ---------------- Rendering ---------------- */

    function makeItem(id, className, label) {
        var app = APPS[id];
        var li = document.createElement('li');
        li.dataset.id = id;
        var el = document.createElement(app.open ? 'button' : 'a');
        el.className = className;
        if (app.open) el.dataset.open = app.open;
        else el.href = app.href;
        el.appendChild(app.icon.cloneNode(true));
        var text = document.createElement('span');
        text.className = className === 'dock-btn' ? 'tip' : 'label';
        text.textContent = label;
        el.appendChild(text);
        if (className === 'dock-btn') el.setAttribute('aria-label', label);
        li.appendChild(el);
        return li;
    }

    function render() {
        iconsUl.textContent = '';
        iconList().forEach(function (id) { iconsUl.appendChild(makeItem(id, 'desk-icon', APPS[id].label)); });
        iconsUl.classList.toggle('free', !phone());
        if (!phone()) placeIcons();

        dockUl.textContent = '';
        dockList().forEach(function (id) { dockUl.appendChild(makeItem(id, 'dock-btn', dockLabel(id))); });
        D.sync();
        renderSettings();
    }

    /* ---------------- Desktop grid (computers) ---------------- */

    var cells = {};

    function grid() {
        var r = iconsUl.getBoundingClientRect();
        return { w: r.width, cols: Math.max(1, Math.floor(r.width / CW)), rows: Math.max(1, Math.floor(r.height / CH)) };
    }

    // Each icon's cell (columns counted from the right edge): its saved spot if it still fits on screen,
    // otherwise the first free cell, filling columns top to bottom like a Mac desktop.
    function computeCells() {
        var g = grid(), taken = {}, out = {}, pending = [];
        var key = function (c, r) { return c + ',' + r; };
        state.desk.forEach(function (id) {
            var p = state.pos && state.pos[id];
            if (p && p.c < g.cols && p.r < g.rows && !taken[key(p.c, p.r)]) {
                out[id] = { c: p.c, r: p.r };
                taken[key(p.c, p.r)] = true;
            } else {
                pending.push(id);
            }
        });
        pending.forEach(function (id) {
            for (var i = 0; i < g.cols * g.rows; i++) {
                var c = Math.floor(i / g.rows), r = i % g.rows;
                if (!taken[key(c, r)]) {
                    out[id] = { c: c, r: r };
                    taken[key(c, r)] = true;
                    return;
                }
            }
            out[id] = { c: 0, r: 0 };
        });
        return out;
    }

    function placeIcons() {
        var g = grid();
        cells = computeCells();
        $$('li', iconsUl).forEach(function (li) {
            var cell = cells[li.dataset.id];
            li.style.left = (g.w - (cell.c + 1) * CW + (CW - 92) / 2) + 'px';
            li.style.top = (cell.r * CH) + 'px';
        });
    }

    // Freeze the current automatic arrangement into saved positions before the first manual move.
    function materialize() {
        state.pos = {};
        Object.keys(cells).forEach(function (id) { state.pos[id] = { c: cells[id].c, r: cells[id].r }; });
    }

    /* ---------------- Shared drag helpers ---------------- */

    var dragActive = false;
    var suppressClick = false;

    function suppressNextClick() {
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 0);
    }

    function hits(el, x, y, pad) {
        var r = el.getBoundingClientRect();
        pad = pad || 0;
        return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    }

    function ids(ul) {
        return $$('li[data-id]', ul).map(function (li) { return li.dataset.id; });
    }

    // Item in a horizontal list that the dragged item should go before (null = the end).
    function dockBefore(x, skip) {
        var items = $$(':scope > li', dockUl).filter(function (el) { return el !== skip && !el.classList.contains('dock-slot'); });
        for (var i = 0; i < items.length; i++) {
            var r = items[i].getBoundingClientRect();
            if (x < r.left + r.width / 2) return items[i];
        }
        return null;
    }

    // Item in a wrapping grid that the dragged item should go before, based on the nearest icon.
    function gridBefore(ul, x, y, skip) {
        var items = $$(':scope > li', ul).filter(function (el) { return el !== skip; });
        if (!items.length) return null;
        var best = null, bestD = Infinity;
        items.forEach(function (el) {
            var r = el.getBoundingClientRect();
            var d = Math.pow(x - (r.left + r.width / 2), 2) + Math.pow(y - (r.top + r.height / 2), 2);
            if (d < bestD) { bestD = d; best = el; }
        });
        var br = best.getBoundingClientRect();
        if (x > br.left + br.width / 2) {
            var next = best.nextElementSibling;
            return next === skip ? skip.nextElementSibling : next;
        }
        return best;
    }

    // While a finger drags an icon, stop the page from scrolling underneath it.
    document.addEventListener('touchmove', function (e) { if (dragActive) e.preventDefault(); }, { passive: false });

    // A click that ends a drag (or lands on an icon in edit mode) must not open anything.
    document.addEventListener('click', function (e) {
        if (suppressClick || (editing && e.target.closest('.desk-icon, .dock-btn'))) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    /* ---------------- Desktop icons: select, open, drag (computers) ---------------- */

    var lastPointerType = 'mouse';

    function select(icon) {
        $$('.desk-icon.selected').forEach(function (el) { if (el !== icon) el.classList.remove('selected'); });
        if (icon) icon.classList.add('selected');
    }

    iconsUl.addEventListener('click', function (e) {
        var icon = e.target.closest('.desk-icon');
        if (!icon) return;
        select(icon);
        var direct = e.detail === 0 || lastPointerType !== 'mouse' || phone();
        if (icon.dataset.open) {
            if (direct) D.open(icon.dataset.open, icon);
        } else if (!direct) {
            e.preventDefault();               // a single mouse click on a link icon only selects it
        }
    });

    iconsUl.addEventListener('dblclick', function (e) {
        var li = e.target.closest('li[data-id]');
        if (li && !editing) openById(li.dataset.id, $('.desk-icon', li));
    });

    desktop.addEventListener('pointerdown', function (e) {
        if (e.target.closest('.desk-icon')) return;
        select(null);
        if (editing && !e.target.closest('.window')) exitEdit();
    });

    iconsUl.addEventListener('pointerdown', function (e) {
        lastPointerType = e.pointerType;
        var li = e.target.closest('li[data-id]');
        if (!li) return;
        if (phone()) { phonePress(e, li); return; }
        if (e.button === 0) iconDrag(e, li);
    });

    function iconDrag(e, li) {
        var id = li.dataset.id;
        var pid = e.pointerId, sx = e.clientX, sy = e.clientY;
        var dragging = false, slot = null;

        function move(ev) {
            if (ev.pointerId !== pid) return;
            var dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (!dragging) {
                if (Math.abs(dx) + Math.abs(dy) < 5) return;
                dragging = dragActive = true;
                try { li.setPointerCapture(pid); } catch (err) {}
                li.classList.add('dragging');
                document.body.classList.add('dragging');
                select($('.desk-icon', li));
                closeMenu();
            }
            li.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
            if (!dockEl.hidden && hits(dockEl, ev.clientX, ev.clientY, 24)) {
                if (!slot) {
                    slot = document.createElement('li');
                    slot.className = 'dock-slot';
                }
                var before = dockBefore(ev.clientX, null);
                if (slot.parentNode !== dockUl || slot.nextElementSibling !== before) dockUl.insertBefore(slot, before);
            } else if (slot) {
                slot.remove();
                slot = null;
            }
        }

        function end(ev) {
            if (ev.pointerId !== pid) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (!dragging) return;
            dragActive = false;
            document.body.classList.remove('dragging');
            li.classList.remove('dragging');
            suppressNextClick();

            var dx = ev.clientX - sx, dy = ev.clientY - sy;
            if (slot && ev.type !== 'pointercancel') {
                // Dropped on the dock: add it there (the desktop icon stays, like a Mac alias).
                var index = $$(':scope > li', dockUl).indexOf(slot);
                slot.remove();
                li.style.transform = '';
                addToDock(id, index);
                return;
            }
            if (slot) slot.remove();
            if (ev.type === 'pointercancel') { li.style.transform = ''; return; }

            // Dropped on the desktop: snap to the nearest cell, swapping with any icon already there.
            var g = grid();
            var left = li.offsetLeft + dx, top = li.offsetTop + dy;
            var c = clamp(Math.floor((g.w - (left + li.offsetWidth / 2)) / CW), 0, g.cols - 1);
            var r = clamp(Math.floor((top + li.offsetHeight / 2) / CH), 0, g.rows - 1);
            materialize();
            var from = state.pos[id];
            Object.keys(state.pos).forEach(function (other) {
                if (other !== id && state.pos[other].c === c && state.pos[other].r === r) state.pos[other] = { c: from.c, r: from.r };
            });
            state.pos[id] = { c: c, r: r };
            save();

            // Start the snap animation from where the icon was dropped, not from its old spot.
            li.style.transition = 'none';
            li.style.left = left + 'px';
            li.style.top = top + 'px';
            li.style.transform = '';
            void li.offsetWidth;
            li.style.transition = '';
            placeIcons();
        }

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    }

    /* ---------------- Sortable drag (dock on computers, everything on phones) ---------------- */

    // opts: lists (uls it may move between), accept(ul, li), immediate (start without waiting for movement),
    // onDrop() after a reorder, onOut(x, y) when dragged up off the dock (the ghost turns into a desktop icon)
    function sortDrag(e, li, opts) {
        var pid = e.pointerId, sx = e.clientX, sy = e.clientY;
        var dragging = false, outside = false, ghost = null, deskGhost = null;

        function begin() {
            dragging = dragActive = true;
            var r = li.getBoundingClientRect();
            ghost = li.cloneNode(true);
            ghost.className = 'drag-ghost';
            ghost.removeAttribute('data-id');
            ghost.style.left = r.left + 'px';
            ghost.style.top = r.top + 'px';
            ghost.style.width = r.width + 'px';
            ghost.style.setProperty('--dock-icon', getComputedStyle(dockEl).getPropertyValue('--dock-icon'));
            document.body.appendChild(ghost);
            if (opts.onOut) {
                deskGhost = makeItem(li.dataset.id, 'desk-icon', APPS[li.dataset.id].label);
                deskGhost.className = 'drag-ghost desk-ghost';
                deskGhost.hidden = true;
                document.body.appendChild(deskGhost);
            }
            li.classList.add('placeholder');
            document.body.classList.add('dragging');
            try { li.setPointerCapture(pid); } catch (err) {}
            closeMenu();
        }

        function move(ev) {
            if (ev.pointerId !== pid) return;
            if (!dragging) {
                if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 5) return;
                begin();
            }
            ghost.style.transform = 'translate(' + (ev.clientX - sx) + 'px,' + (ev.clientY - sy) + 'px)';

            if (opts.onOut) {
                var out = ev.clientY < dockEl.getBoundingClientRect().top - 40;
                if (out !== outside) {
                    outside = out;
                    li.classList.toggle('collapsed', out);
                    ghost.hidden = out;
                    deskGhost.hidden = !out;
                }
                if (outside) {
                    deskGhost.style.left = (ev.clientX - 46) + 'px';
                    deskGhost.style.top = (ev.clientY - 30) + 'px';
                    return;
                }
            }

            var target = opts.lists.filter(function (ul) {
                return hits(ul === dockUl ? dockEl : ul, ev.clientX, ev.clientY, 16);
            })[0];
            if (!target || (opts.accept && !opts.accept(target, li))) return;
            var before = target === dockUl ? dockBefore(ev.clientX, li) : gridBefore(target, ev.clientX, ev.clientY, li);
            if (li.parentNode !== target || li.nextElementSibling !== before) target.insertBefore(li, before);
        }

        function end(ev) {
            if (ev.pointerId !== pid) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (!dragging) return;
            dragActive = false;
            suppressNextClick();
            document.body.classList.remove('dragging');
            li.classList.remove('placeholder', 'collapsed');
            ghost.remove();
            if (deskGhost) deskGhost.remove();
            if (outside && ev.type !== 'pointercancel') opts.onOut(ev.clientX, ev.clientY);
            else opts.onDrop();
        }

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
        if (opts.immediate) begin();
    }

    dockUl.addEventListener('pointerdown', function (e) {
        var li = e.target.closest('li[data-id]');
        if (!li) return;
        if (phone()) { phonePress(e, li); return; }
        if (e.button !== 0) return;
        sortDrag(e, li, {
            lists: [dockUl],
            onDrop: function () {
                state.dock = ids(dockUl);
                save();
                render();
            },
            onOut: function (x, y) { dockToDesktop(li.dataset.id, x, y); }
        });
    });

    /* ---------------- Phone edit mode ---------------- */

    var editing = false;
    var doneBtn = document.createElement('button');
    doneBtn.className = 'edit-done';
    doneBtn.textContent = 'Done';
    doneBtn.hidden = true;
    doneBtn.addEventListener('click', function () { exitEdit(); });
    document.body.appendChild(doneBtn);

    function enterEdit() {
        editing = true;
        document.body.classList.add('editing');
        doneBtn.hidden = false;
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    }

    function exitEdit() {
        editing = false;
        document.body.classList.remove('editing');
        doneBtn.hidden = true;
    }

    function phoneSort(e, li) {
        sortDrag(e, li, {
            lists: [iconsUl, dockUl],
            immediate: true,
            // The phone dock holds four apps; one can come in only if another leaves.
            accept: function (ul, item) {
                return ul !== dockUl || item.parentNode === dockUl || $$(':scope > li[data-id]', dockUl).length < PHONE_DOCK_MAX;
            },
            onDrop: function () {
                state.home = ids(iconsUl);
                state.phoneDock = ids(dockUl);
                save();
                render();
            }
        });
    }

    // Press and hold (without moving) to start editing; once editing, dragging starts straight away.
    function phonePress(e, li) {
        if (editing) { phoneSort(e, li); return; }
        var pid = e.pointerId, sx = e.clientX, sy = e.clientY;
        var timer = setTimeout(function () {
            cleanup();
            enterEdit();
            phoneSort(e, li);
        }, LONG_PRESS_MS);
        function move(ev) {
            if (ev.pointerId === pid && Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 10) cleanup();
        }
        function cleanup() {
            clearTimeout(timer);
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', cleanup);
            window.removeEventListener('pointercancel', cleanup);
        }
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', cleanup);
        window.addEventListener('pointercancel', cleanup);
    }

    /* ---------------- Layout changes (used by drags, menus and Settings) ---------------- */

    // Grid cell under a point on screen (the desktop-icon ghost hangs just below the pointer).
    function cellAt(x, y) {
        var g = grid(), r = iconsUl.getBoundingClientRect();
        return {
            c: clamp(Math.floor((g.w - (x - r.left)) / CW), 0, g.cols - 1),
            r: clamp(Math.floor((y + 17 - r.top) / CH), 0, g.rows - 1)
        };
    }

    function occupantOf(cell, except) {
        return Object.keys(state.pos || {}).filter(function (id) {
            return id !== except && state.pos[id].c === cell.c && state.pos[id].r === cell.r;
        })[0] || null;
    }

    function nearestFree(cell) {
        var g = grid(), best = cell, bestD = Infinity;
        for (var c = 0; c < g.cols; c++) {
            for (var r = 0; r < g.rows; r++) {
                var d = Math.pow(c - cell.c, 2) + Math.pow(r - cell.r, 2);
                if (d < bestD && !occupantOf({ c: c, r: r })) { bestD = d; best = { c: c, r: r }; }
            }
        }
        return best;
    }

    // Dragged off the dock: the app leaves the dock and lands on the desktop where it was dropped.
    function dockToDesktop(id, x, y) {
        var i = state.dock.indexOf(id);
        if (i > -1) state.dock.splice(i, 1);
        materialize();
        var cell = cellAt(x, y);
        var occupant = occupantOf(cell, id);
        if (state.desk.indexOf(id) > -1) {
            if (occupant) state.pos[occupant] = state.pos[id];     // swap with the icon already there
        } else {
            state.desk.push(id);
            if (occupant) cell = nearestFree(cell);
        }
        state.pos[id] = cell;
        save();
        render();
    }

    function addToDock(id, index) {
        var list = dockList();
        var cur = list.indexOf(id);
        if (cur > -1) {
            list.splice(cur, 1);
            if (index > cur) index--;
        } else if (phone() && list.length >= PHONE_DOCK_MAX) {
            return false;
        }
        if (index == null || index < 0 || index > list.length) index = list.length;
        list.splice(index, 0, id);
        save();
        render();
        return true;
    }

    function removeFromDock(id) {
        var list = dockList();
        var i = list.indexOf(id);
        if (i > -1) list.splice(i, 1);
        save();
        render();
    }

    function moveInDock(id, delta) {
        var list = dockList();
        var i = list.indexOf(id), j = i + delta;
        if (i < 0 || j < 0 || j >= list.length) return;
        list.splice(j, 0, list.splice(i, 1)[0]);
        save();
        render();
    }

    function setOnDesk(id, on) {
        var list = iconList();
        var i = list.indexOf(id);
        if (on && i < 0) list.push(id);
        if (!on && i > -1) {
            list.splice(i, 1);
            if (state.pos) delete state.pos[id];
        }
        save();
        render();
    }

    function cleanUp() {
        state.pos = null;
        save();
        render();
    }

    function resetLayout() {
        try { localStorage.removeItem(KEY); } catch (e) {}
        state = loadState();
        render();
    }

    /* ---------------- Right-click menus (computers) ---------------- */

    var menu = document.createElement('ul');
    menu.className = 'dropdown ctx-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    document.body.appendChild(menu);
    var menuReturn = null;

    function openMenu(x, y, items, returnTo) {
        menu.textContent = '';
        items.forEach(function (item) {
            var li = document.createElement('li');
            if (item === '-') {
                li.className = 'sep';
                li.setAttribute('role', 'separator');
            } else {
                var b = document.createElement('button');
                b.setAttribute('role', 'menuitem');
                b.textContent = item.label;
                b.addEventListener('click', function () { closeMenu(); item.run(); });
                li.appendChild(b);
            }
            menu.appendChild(li);
        });
        menuReturn = returnTo || null;
        menu.hidden = false;
        menu.style.left = clamp(x, 6, window.innerWidth - menu.offsetWidth - 6) + 'px';
        menu.style.top = clamp(y, 6, window.innerHeight - menu.offsetHeight - 6) + 'px';
        $('button', menu).focus({ preventScroll: true });
    }

    function closeMenu(restoreFocus) {
        if (menu.hidden) return;
        menu.hidden = true;
        if (restoreFocus && menuReturn && document.contains(menuReturn)) menuReturn.focus({ preventScroll: true });
    }

    menu.addEventListener('keydown', function (e) {
        var items = $$('button', menu);
        var i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(true); }
        else if (e.key === 'Tab') closeMenu();
    });
    document.addEventListener('pointerdown', function (e) { if (!e.target.closest('.ctx-menu')) closeMenu(); });
    window.addEventListener('blur', function () { closeMenu(); });
    window.addEventListener('resize', function () { closeMenu(); });

    function customize() {
        D.open('settings');
        var section = $('#layoutSection');
        if (section) section.scrollIntoView({ block: 'start' });
    }

    document.addEventListener('contextmenu', function (e) {
        var iconLi = e.target.closest('.desk-icons li[data-id]');
        var dockLi = e.target.closest('.dock-apps li[data-id]');
        if (phone()) {
            if (iconLi || dockLi) e.preventDefault();      // long-press is for edit mode on phones
            return;
        }
        var x = e.clientX, y = e.clientY;
        if (!x && !y) {                                     // opened from the keyboard (Menu key / Shift+F10)
            var r = e.target.getBoundingClientRect();
            x = r.left + 8;
            y = r.bottom + 4;
        }

        if (iconLi) {
            e.preventDefault();
            var id = iconLi.dataset.id, icon = $('.desk-icon', iconLi);
            select(icon);
            var inDock = state.dock.indexOf(id) > -1;
            openMenu(x, y, [
                { label: 'Open', run: function () { openById(id, icon); } },
                '-',
                inDock ? { label: 'Remove from Dock', run: function () { removeFromDock(id); } }
                       : { label: 'Add to Dock', run: function () { addToDock(id); } },
                { label: 'Remove from Desktop', run: function () { setOnDesk(id, false); } }
            ], icon);
        } else if (dockLi) {
            e.preventDefault();
            var did = dockLi.dataset.id, btn = $('.dock-btn', dockLi);
            var idx = state.dock.indexOf(did);
            var onDesk = state.desk.indexOf(did) > -1;
            var items = [{ label: 'Open', run: function () { openById(did, btn); } }, '-'];
            if (idx > 0) items.push({ label: 'Move Left', run: function () { moveInDock(did, -1); } });
            if (idx < state.dock.length - 1) items.push({ label: 'Move Right', run: function () { moveInDock(did, 1); } });
            items.push(onDesk ? { label: 'Remove from Desktop', run: function () { setOnDesk(did, false); } }
                              : { label: 'Show on Desktop', run: function () { setOnDesk(did, true); } });
            items.push({ label: 'Remove from Dock', run: function () { removeFromDock(did); } });
            openMenu(x, y, items, btn);
        } else if (e.target.closest('#desktop') && !e.target.closest('.window')) {
            e.preventDefault();
            openMenu(x, y, [
                { label: 'Clean Up Icons', run: cleanUp },
                { label: 'Change Wallpaper…', run: function () { D.open('settings'); } },
                { label: 'Customize Desktop & Dock…', run: customize },
                '-',
                { label: 'Reset Icons & Dock', run: resetLayout }
            ]);
        }
    });

    /* ---------------- Settings: Desktop & Dock checklist ---------------- */

    var table = $('#layoutTable');
    var hint = $('#layoutHint');

    function renderSettings() {
        if (!table) return;
        var p = phone();
        var dockFull = p && state.phoneDock.length >= PHONE_DOCK_MAX;
        hint.textContent = p
            ? 'Press and hold an icon on the home screen to rearrange it, or pick apps here. The dock holds up to 4 apps.'
            : 'Drag icons to rearrange them, drag apps between the desktop and the dock, right-click for more options, or pick apps here.';

        var focused = document.activeElement && table.contains(document.activeElement) ? document.activeElement : null;
        var focusKey = focused ? focused.dataset.place + ':' + focused.dataset.id : null;

        table.textContent = '';
        var head = table.createTHead().insertRow();
        ['App', p ? 'Home Screen' : 'Desktop', 'Dock'].forEach(function (text, i) {
            var th = document.createElement('th');
            th.scope = 'col';
            th.textContent = text;
            if (i) th.className = 'c';
            head.appendChild(th);
        });
        var body = table.createTBody();
        ORDER.forEach(function (id) {
            var row = body.insertRow();
            var name = row.insertCell();
            name.appendChild(APPS[id].icon.cloneNode(true));
            name.appendChild(document.createTextNode(dockLabel(id)));
            [['desk', iconList(), p ? 'on the home screen' : 'on the desktop'], ['dock', dockList(), 'in the dock']].forEach(function (col) {
                var cell = row.insertCell();
                cell.className = 'c';
                var box = document.createElement('input');
                box.type = 'checkbox';
                box.dataset.place = col[0];
                box.dataset.id = id;
                box.checked = col[1].indexOf(id) > -1;
                box.setAttribute('aria-label', 'Show ' + dockLabel(id) + ' ' + col[2]);
                if (col[0] === 'dock' && dockFull && !box.checked) {
                    box.disabled = true;
                    box.title = 'The dock is full. Remove an app first.';
                }
                cell.appendChild(box);
            });
        });

        if (focusKey) {
            var parts = focusKey.split(':');
            var again = $('input[data-place="' + parts[0] + '"][data-id="' + parts[1] + '"]', table);
            if (again) again.focus({ preventScroll: true });
        }
    }

    if (table) {
        table.addEventListener('change', function (e) {
            var box = e.target;
            if (!box.dataset.place) return;
            if (box.dataset.place === 'desk') setOnDesk(box.dataset.id, box.checked);
            else if (box.checked) addToDock(box.dataset.id);
            else removeFromDock(box.dataset.id);
        });
    }
    var resetBtn = $('[data-layout="reset"]');
    if (resetBtn) resetBtn.addEventListener('click', resetLayout);

    /* ---------------- Start ---------------- */

    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () { if (!phone()) placeIcons(); }, 120);
    });
    window.matchMedia('(max-width: 767px)').addEventListener('change', function () {
        exitEdit();
        render();
    });

    render();
})();
