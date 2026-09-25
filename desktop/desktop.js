/* Desktop edition: window manager, dock, menu bar, boot screen and the phone home screen. */
(function () {
    'use strict';

    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

    var root = document.documentElement;
    var phoneMQ = window.matchMedia('(max-width: 767px)');
    var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    var isPhone = function () { return phoneMQ.matches; };
    var ms = function (n) { return reduceMQ.matches ? 0 : n; };

    function cssPx(name) { return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0; }

    var windows = {};                 // app name -> <section class="window">
    $$('.window').forEach(function (win) {
        windows[win.dataset.app] = win;
        win.dataset.title = $('.win-title', win).textContent.trim();
    });

    var zTop = 10;
    var openCount = 0;
    var current = null;               // focused window
    var activeApp = $('#activeApp');
    var dockMin = $('#dockMin');

    /* ---------------- Geometry ---------------- */

    function workArea() {
        var top = cssPx('--menubar-h');
        var bottom = window.innerHeight - cssPx('--dock-reserve');
        return { top: top, bottom: bottom, width: window.innerWidth, height: bottom - top };
    }

    function placeWindow(win) {
        var area = workArea();
        var w = Math.max(320, Math.min(Number(win.dataset.w) || 640, area.width - 40));
        var h = Math.max(240, Math.min(Number(win.dataset.h) || 480, area.height - 24));
        var step = (openCount % 6) * 26;
        var x = Math.round((area.width - w) / 2) - 60 + step;
        var y = area.top + Math.max(12, Math.round((area.height - h) / 2) - 40) + step;
        setRect(win, x, y, w, h);
        clampWindow(win);
    }

    function setRect(win, x, y, w, h) {
        win.style.left = x + 'px';
        win.style.top = y + 'px';
        if (w != null) win.style.width = w + 'px';
        if (h != null) win.style.height = h + 'px';
    }

    // Keep at least part of the title bar on screen so a window can always be grabbed again.
    function clampWindow(win) {
        var area = workArea();
        var x = win.offsetLeft, y = win.offsetTop, w = win.offsetWidth;
        x = Math.max(80 - w, Math.min(x, area.width - 80));
        y = Math.max(area.top, Math.min(y, window.innerHeight - 60));
        setRect(win, x, y);
    }

    /* ---------------- Focus and stacking ---------------- */

    function visibleWindows() {
        return Object.keys(windows).map(function (k) { return windows[k]; })
            .filter(function (w) { return !w.hidden && !w._closing && !w.classList.contains('minimized'); });
    }

    function topmost() {
        return visibleWindows().sort(function (a, b) { return (b.style.zIndex | 0) - (a.style.zIndex | 0); })[0] || null;
    }

    function focusWindow(win) {
        if (!win) return;
        if (current !== win) {
            win.style.zIndex = ++zTop;
            current = win;
        }
        Object.keys(windows).forEach(function (k) { windows[k].classList.toggle('focused', windows[k] === win); });
        activeApp.textContent = win.dataset.title;
    }

    function blurAll() {
        current = null;
        Object.keys(windows).forEach(function (k) { windows[k].classList.remove('focused'); });
        activeApp.textContent = 'Desktop';
    }

    // Send keyboard focus into an app's iframe so arrow keys reach the game right away.
    function focusFrame(win) {
        var frame = $('iframe[data-src]', win);
        if (!frame || !frame.dataset.loaded) return false;
        try { frame.contentWindow.focus(); } catch (e) {}
        return true;
    }

    // Keyboard focus for a window that just came forward: its app iframe, its [data-autofocus] field
    // (skipped on phones so the on-screen keyboard doesn't pop up uninvited), or the window itself.
    function focusContent(win) {
        if (focusFrame(win)) return;
        var field = !isPhone() && $('[data-autofocus]', win);
        (field || win).focus({ preventScroll: true });
    }

    /* ---------------- Iframes load on first open ---------------- */

    function loadFrame(win) {
        var frame = $('iframe[data-src]', win);
        if (!frame || frame.dataset.loaded) return;
        if (frame.hasAttribute('data-phone-fallback') && isPhone()) return;
        frame.dataset.loaded = '1';
        frame.addEventListener('load', function () {
            if (frame.hasAttribute('data-embed')) embedApp(frame);
            if (current === win) focusFrame(win);
        }, { once: true });
        frame.src = frame.dataset.src;
    }

    // The window's title bar already names the app, so hide the app page's own heading to give the board more room,
    // then fire a resize so the p5 sketch re-measures its canvas.
    function embedApp(frame) {
        try {
            var doc = frame.contentDocument;
            var style = doc.createElement('style');
            style.textContent = '.top { display: none; } body { padding-top: 14px; }' +
                'html { scrollbar-width: none; } ::-webkit-scrollbar { display: none; }';
            doc.head.appendChild(style);
            frame.contentWindow.dispatchEvent(new Event('resize'));
        } catch (e) {}
    }

    function unloadFrame(win) {
        var frame = $('iframe[data-src]', win);
        if (!frame || !frame.dataset.loaded) return;
        frame.src = 'about:blank';                 // closing a game ends it; reopening starts fresh
        delete frame.dataset.loaded;
    }

    /* ---------------- Visitor analytics (GoatCounter) ---------------- */

    function track(path, title) {
        if (window.goatcounter && window.goatcounter.count) {
            window.goatcounter.count({ path: path, title: title || path, event: true });
        }
    }

    // Clicks on the links that matter most (resume, profiles, email, back to the classic site).
    document.addEventListener('click', function (e) {
        var link = e.target.closest('a[href]');
        if (!link) return;
        var href = link.getAttribute('href');
        var name = /Resume\.pdf/.test(href) ? 'click/resume'
            : /linkedin\.com/.test(href) ? 'click/linkedin'
            : /github\.com/.test(href) ? 'click/github'
            : /^mailto:/.test(href) ? 'click/email'
            : href === '/' ? 'click/classic-view'
            : null;
        if (name) track(name, link.getAttribute('aria-label') || link.textContent.trim() || name);
    }, true);

    /* ---------------- Open / close / minimize / maximize ---------------- */

    // Run fn when an animation ends, with a timer as backup (animations stall in tabs that aren't painting).
    function afterAnim(anim, fn) {
        var done = false;
        var once = function () { if (!done) { done = true; fn(); } };
        anim.finished.then(once, once);
        setTimeout(once, (anim.effect.getTiming().duration || 0) + 80);
    }

    function openApp(app, opener) {
        var win = windows[app];
        if (!win) return;
        if (win._closing) {                // reopened mid close-animation: keep it
            win._closing = false;
            win.getAnimations().forEach(function (a) { a.cancel(); });
        }

        if (win.classList.contains('minimized')) {
            restore(win);
            return;
        }

        if (win.hidden) {
            win.hidden = false;            // must be displayed before it can be measured and placed
            if (!win.dataset.placed) {
                placeWindow(win);
                win.dataset.placed = '1';
                openCount++;
            } else {
                clampWindow(win);
            }
            win._opener = opener || document.activeElement;
            loadFrame(win);
            win.animate(
                [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'none' }],
                { duration: ms(160), easing: 'cubic-bezier(.2,.8,.3,1)' }
            );
            if (isPhone()) {
                try { history.pushState({ win: app }, ''); } catch (e) {}
            }
            win.dispatchEvent(new CustomEvent('jb:open'));
            track('desktop-app/' + app, win.dataset.title);
        }

        focusWindow(win);
        focusContent(win);
        syncChrome();
    }

    function closeWindow(win) {
        if (win.hidden || win._closing) return;
        win._closing = true;
        var hadFocus = win.contains(document.activeElement);
        var anim = win.animate(
            [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }],
            { duration: ms(130), easing: 'ease-in', fill: 'forwards' }
        );
        afterAnim(anim, function () {
            anim.cancel();
            if (!win._closing) return;
            win._closing = false;
            win.hidden = true;
            win.classList.remove('focused');
            unloadFrame(win);
            win.dispatchEvent(new CustomEvent('jb:close'));
        });
        removeMinTile(win);
        if (current === win) current = null;

        var next = topmost();
        if (next && next !== win) focusWindow(next); else blurAll();

        if (hadFocus) {
            var back = win._opener;
            if (back && document.contains(back) && !back.closest('.window[hidden]') && back !== document.body) {
                back.focus({ preventScroll: true });
            } else if (next && next !== win) {
                next.focus({ preventScroll: true });
            }
        }
        syncChrome(win);
    }

    // On phones every open app has a history entry, so the Back button (in the app or the browser) pops it.
    function requestClose(win) {
        if (isPhone() && history.state && history.state.win === win.dataset.app) {
            history.back();
        } else {
            closeWindow(win);
        }
    }

    window.addEventListener('popstate', function () {
        if (!isPhone()) return;
        var top = topmost();
        if (top) closeWindow(top);
    });

    function dockTarget(win) {
        return $('.dock-apps [data-open="' + win.dataset.app + '"]') || addMinTile(win);
    }

    function flyTransform(win, target) {
        var r = win.getBoundingClientRect();
        var t = target.getBoundingClientRect();
        var dx = (t.left + t.width / 2) - (r.left + r.width / 2);
        var dy = (t.top + t.height / 2) - (r.top + r.height / 2);
        var s = Math.max(0.05, t.width / r.width);
        return 'translate(' + dx + 'px,' + dy + 'px) scale(' + s + ')';
    }

    function minimize(win) {
        if (isPhone() || win.classList.contains('minimized')) return;
        var target = dockTarget(win);
        var hadFocus = win.contains(document.activeElement);
        win.animate(
            [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: flyTransform(win, target) }],
            { duration: ms(280), easing: 'cubic-bezier(.4,0,.2,1)' }
        );
        win.classList.add('minimized');
        if (current === win) current = null;
        var next = topmost();
        if (next) focusWindow(next); else blurAll();
        if (hadFocus) target.focus({ preventScroll: true });
        syncChrome();
    }

    function restore(win) {
        var target = $('.dock-apps [data-open="' + win.dataset.app + '"]') || minTileFor(win);
        win.classList.remove('minimized');
        if (target) {
            win.animate(
                [{ opacity: 0, transform: flyTransform(win, target) }, { opacity: 1, transform: 'none' }],
                { duration: ms(280), easing: 'cubic-bezier(.2,.8,.3,1)' }
            );
        }
        removeMinTile(win);
        focusWindow(win);
        focusContent(win);
        syncChrome();
    }

    function toggleMaximize(win) {
        if (isPhone()) return;
        win.classList.add('animating');
        win.classList.toggle('maximized');
        setTimeout(function () { win.classList.remove('animating'); }, ms(240));
        $('.l-max', win).setAttribute('aria-label', win.classList.contains('maximized') ? 'Restore size' : 'Maximize');
    }

    /* Minimized windows without their own dock icon (project windows) get a thumbnail tile. */

    function minTileFor(win) {
        return $('[data-restore="' + win.dataset.app + '"]', dockMin);
    }

    function addMinTile(win) {
        var existing = minTileFor(win);
        if (existing) return existing;
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.className = 'dock-btn';
        btn.dataset.restore = win.dataset.app;
        btn.setAttribute('aria-label', 'Restore ' + win.dataset.title);
        var icon = document.createElement('span');
        icon.className = 'app-icon ic-projects';
        if (win.dataset.thumb) {
            var img = document.createElement('img');
            img.src = win.dataset.thumb;
            img.alt = '';
            icon.appendChild(img);
        }
        var tip = document.createElement('span');
        tip.className = 'tip';
        tip.textContent = win.dataset.title;
        btn.appendChild(icon);
        btn.appendChild(tip);
        li.appendChild(btn);
        dockMin.appendChild(li);
        return btn;
    }

    function removeMinTile(win) {
        var tile = minTileFor(win);
        if (tile) tile.parentNode.remove();
    }

    /* Running dots in the dock, and hiding the phone dock while an app is open. */
    function syncChrome(closing) {
        $$('.dock-apps [data-open]').forEach(function (btn) {
            var win = windows[btn.dataset.open];
            btn.classList.toggle('running', !!win && !win.hidden && win !== closing);
        });
        var anyOpen = Object.keys(windows).some(function (k) {
            return !windows[k].hidden && windows[k] !== closing;
        });
        document.body.classList.toggle('has-open', anyOpen);
    }

    /* ---------------- Dragging and resizing ---------------- */

    function trackPointer(e, handle, onMove, onEnd) {
        var id = e.pointerId;
        try { handle.setPointerCapture(id); } catch (err) {}
        document.body.classList.add('dragging');
        function move(ev) { if (ev.pointerId === id) onMove(ev); }
        function end(ev) {
            if (ev.pointerId !== id) return;
            handle.removeEventListener('pointermove', move);
            handle.removeEventListener('pointerup', end);
            handle.removeEventListener('pointercancel', end);
            document.body.classList.remove('dragging');
            if (onEnd) onEnd(ev);
        }
        handle.addEventListener('pointermove', move);
        handle.addEventListener('pointerup', end);
        handle.addEventListener('pointercancel', end);
    }

    function setupWindow(win) {
        var bar = $('.titlebar', win);

        // Any press inside a window brings it to the front.
        win.addEventListener('pointerdown', function () { focusWindow(win); }, true);

        bar.addEventListener('pointerdown', function (e) {
            if (e.button !== 0 || isPhone() || e.target.closest('button, a')) return;
            if (win.classList.contains('maximized')) return;
            e.preventDefault();
            var sx = e.clientX, sy = e.clientY, ox = win.offsetLeft, oy = win.offsetTop, moved = false;
            trackPointer(e, bar, function (ev) {
                var dx = ev.clientX - sx, dy = ev.clientY - sy;
                if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
                moved = true;
                setRect(win, ox + dx, oy + dy);
                clampWindow(win);
            }, function () {
                if (!moved) focusFrame(win);
            });
        });

        bar.addEventListener('dblclick', function (e) {
            if (!e.target.closest('button, a')) toggleMaximize(win);
        });

        ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].forEach(function (dir) {
            var h = document.createElement('div');
            h.className = 'rz rz-' + dir;
            h.setAttribute('aria-hidden', 'true');
            win.appendChild(h);
            h.addEventListener('pointerdown', function (e) {
                if (e.button !== 0 || isPhone()) return;
                e.preventDefault();
                e.stopPropagation();
                focusWindow(win);
                var sx = e.clientX, sy = e.clientY;
                var r = { x: win.offsetLeft, y: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight };
                var minW = Number(win.dataset.minw) || 340;
                var minH = Number(win.dataset.minh) || 240;
                var topLimit = workArea().top;
                trackPointer(e, h, function (ev) {
                    var dx = ev.clientX - sx, dy = ev.clientY - sy;
                    var x = r.x, y = r.y, w = r.w, hh = r.h;
                    if (dir.indexOf('e') > -1) w = Math.max(minW, r.w + dx);
                    if (dir.indexOf('s') > -1) hh = Math.max(minH, r.h + dy);
                    if (dir.indexOf('w') > -1) { w = Math.max(minW, r.w - dx); x = r.x + r.w - w; }
                    if (dir.indexOf('n') > -1) {
                        hh = Math.max(minH, r.h - dy);
                        y = r.y + r.h - hh;
                        if (y < topLimit) { hh -= topLimit - y; y = topLimit; }
                    }
                    setRect(win, x, y, w, hh);
                });
            });
        });
    }

    Object.keys(windows).forEach(function (k) { setupWindow(windows[k]); });

    // Clicking into an iframe doesn't bubble a pointer event to this page, but it does blur our window.
    window.addEventListener('blur', function () {
        setTimeout(function () {
            var el = document.activeElement;
            if (el && el.tagName === 'IFRAME') focusWindow(el.closest('.window'));
        }, 0);
    });

    window.addEventListener('resize', function () {
        if (isPhone()) return;
        visibleWindows().forEach(clampWindow);
    });

    /* ---------------- Clicks: open buttons, window buttons, desktop icons ---------------- */

    document.addEventListener('click', function (e) {
        var act = e.target.closest('[data-act]');
        if (act) {
            var win = act.closest('.window');
            if (act.dataset.act === 'close') requestClose(win);
            else if (act.dataset.act === 'min') minimize(win);
            else if (act.dataset.act === 'max') toggleMaximize(win);
            return;
        }

        var restoreBtn = e.target.closest('[data-restore]');
        if (restoreBtn) { restore(windows[restoreBtn.dataset.restore]); return; }

        var opener = e.target.closest('[data-open]');
        if (opener && !opener.classList.contains('desk-icon')) {
            closeMenu();
            openApp(opener.dataset.open, opener);
        }
    });

    // Clicking empty wallpaper unfocuses windows. (Desktop icons themselves are handled by layout.js.)
    $('#desktop').addEventListener('pointerdown', function (e) {
        if (e.target.closest('.window, .desk-icon')) return;
        blurAll();
    });

    /* ---------------- Menu bar ---------------- */

    var logoBtn = $('#logoBtn');
    var logoMenu = $('#logoMenu');

    function menuItems() { return $$('button, a', logoMenu); }

    function openMenu(focusFirst) {
        logoMenu.hidden = false;
        logoBtn.setAttribute('aria-expanded', 'true');
        if (focusFirst) menuItems()[0].focus();
    }

    function closeMenu(returnFocus) {
        if (logoMenu.hidden) return;
        logoMenu.hidden = true;
        logoBtn.setAttribute('aria-expanded', 'false');
        if (returnFocus) logoBtn.focus();
    }

    logoBtn.addEventListener('click', function (e) {
        if (logoMenu.hidden) openMenu(e.detail === 0); else closeMenu();
    });

    logoMenu.addEventListener('keydown', function (e) {
        var items = menuItems();
        var i = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
        if (e.key === 'Tab') closeMenu();
    });

    document.addEventListener('pointerdown', function (e) {
        if (!e.target.closest('.menu')) closeMenu();
    });

    /* ---------------- Keyboard ---------------- */

    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        if (!logoMenu.hidden) { closeMenu(true); return; }
        if (e.target.matches && e.target.matches('input, textarea')) return;
        var win = document.activeElement && document.activeElement.closest && document.activeElement.closest('.window');
        if (win) requestClose(win);
        else if (isPhone() && topmost()) requestClose(topmost());
    });

    /* ---------------- Experience tabs ---------------- */

    var expTabs = $$('.exp-tab');
    function selectExp(tab, focus) {
        expTabs.forEach(function (t) {
            var on = t === tab;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
            document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
        });
        if (focus) tab.focus();
        $('.exp-pane').scrollTop = 0;
    }
    expTabs.forEach(function (tab, i) {
        tab.addEventListener('click', function () { selectExp(tab); });
        tab.addEventListener('keydown', function (e) {
            var next = null;
            if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = expTabs[(i + 1) % expTabs.length];
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = expTabs[(i - 1 + expTabs.length) % expTabs.length];
            if (e.key === 'Home') next = expTabs[0];
            if (e.key === 'End') next = expTabs[expTabs.length - 1];
            if (next) { e.preventDefault(); selectExp(next, true); }
        });
    });

    /* ---------------- Contact: copy email ---------------- */

    $$('[data-copy]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var status = $('.copy-status');
            var text = btn.dataset.copy;
            var done = function () { status.textContent = 'Email address copied.'; };
            var fail = function () { status.textContent = text; };
            if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fail);
            else fail();
        });
    });

    /* ---------------- Clock ---------------- */

    var clock = $('#clock');
    var longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    var shortFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
    function tick() {
        var now = new Date();
        clock.textContent = (isPhone() ? shortFmt : longFmt).format(now).replace(',', '');
        clock.setAttribute('datetime', now.toISOString());
        setTimeout(tick, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 50);
    }
    tick();
    phoneMQ.addEventListener('change', function () {
        var now = new Date();
        clock.textContent = (isPhone() ? shortFmt : longFmt).format(now).replace(',', '');
    });

    /* ---------------- API for apps.js ---------------- */

    window.JBDesktop = {
        open: openApp,
        close: function (app) { if (windows[app]) requestClose(windows[app]); },
        isPhone: isPhone,
        window: function (app) { return windows[app]; },
        sync: function () { syncChrome(); }          // refresh dock "running" dots after the dock is re-rendered
    };

    /* ---------------- Boot screen, then first window ---------------- */

    function start() {
        var hash = window.location.hash.slice(1);
        if (!windows[hash]) return;
        // Deep links like /desktop/#snake. Wait for apps.js (the next script) so its apps are wired up.
        var go = function () { openApp(hash); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go);
        else go();
    }

    var boot = $('#boot');
    if (root.classList.contains('booted')) {
        boot.remove();
        start();
    } else {
        try { sessionStorage.setItem('jb-booted', '1'); } catch (e) {}
        var bootMs = reduceMQ.matches ? 300 : 1500;
        boot.style.setProperty('--boot-ms', (bootMs - 150) + 'ms');
        var finished = false;
        var finish = function () {
            if (finished) return;
            finished = true;
            boot.classList.add('done');
            setTimeout(function () { boot.remove(); }, ms(400));
            document.removeEventListener('keydown', finish, true);
            start();
        };
        setTimeout(finish, bootMs);
        boot.addEventListener('pointerdown', finish);
        document.addEventListener('keydown', finish, true);
    }
})();
