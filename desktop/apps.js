/* Desktop edition: the utility apps (Settings, Browser, Terminal, Notes and Calculator).
   Loads after desktop.js and talks to the window manager through window.JBDesktop. */
(function () {
    'use strict';

    var D = window.JBDesktop;
    var $ = function (sel, root) { return (root || document).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

    // localStorage can be missing or throw (private windows, blocked storage), so every access is guarded.
    function load(key, fallback) {
        try {
            var value = JSON.parse(localStorage.getItem(key));
            return value == null ? fallback : value;
        } catch (e) { return fallback; }
    }
    function save(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function svgIcon(id) {
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'gl');
        svg.setAttribute('aria-hidden', 'true');
        var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', '#' + id);
        svg.appendChild(use);
        return svg;
    }

    function make(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text != null) el.textContent = text;
        return el;
    }

    function openInRealTab(href) {
        window.open(href, '_blank', 'noopener');
    }

    /* =====================================================================
       Settings: wallpaper, light/dark theme, startup animation
       ===================================================================== */

    var Settings = (function () {
        var root = document.documentElement;
        var form = $('#settingsForm');
        var WALLPAPERS = ['aurora', 'sunset', 'ocean', 'forest', 'midnight', 'classic'];
        var state = { wallpaper: 'aurora', theme: 'auto', boot: true };
        var saved = load('jb-settings', {});
        Object.keys(state).forEach(function (k) { if (k in saved) state[k] = saved[k]; });

        function apply() {
            if (state.theme === 'light' || state.theme === 'dark') root.setAttribute('data-theme', state.theme);
            else root.removeAttribute('data-theme');
            if (state.wallpaper && state.wallpaper !== 'aurora') root.setAttribute('data-wallpaper', state.wallpaper);
            else root.removeAttribute('data-wallpaper');
            form.elements.wallpaper.value = state.wallpaper;
            form.elements.theme.value = state.theme;
            form.elements.boot.checked = state.boot !== false;
        }

        function set(key, value) {
            state[key] = value;
            save('jb-settings', state);
            apply();
        }

        form.addEventListener('change', function (e) {
            var t = e.target;
            if (t.name === 'boot') set('boot', t.checked);
            else if (t.name) set(t.name, t.value);
        });
        form.addEventListener('submit', function (e) { e.preventDefault(); });

        $('[data-set="reset"]', form).addEventListener('click', function () {
            if (!window.confirm('Reset the desktop? This clears your settings and notes in this browser.')) return;
            try {
                localStorage.removeItem('jb-settings');
                localStorage.removeItem('jb-notes');
                localStorage.removeItem('jb-layout');
                sessionStorage.removeItem('jb-booted');
            } catch (e) {}
            window.location.reload();
        });

        apply();
        return { set: set, get: function (k) { return state[k]; }, wallpapers: WALLPAPERS };
    })();

    /* =====================================================================
       Browser: tabs, history, start page. Pages load in iframes, and many big
       sites refuse to be framed, so those get a friendly "open in a new tab".
       ===================================================================== */

    var Browser = (function () {
        var win = D.window('browser');
        var tabBar = $('.br-tabs', win);
        var newTabBtn = $('.br-newtab', win);
        var bar = $('.br-bar', win);
        var address = bar.elements.address;
        var views = $('.br-views', win);
        var startPage = $('#br-start');
        var buttons = {};
        $$('[data-br]', bar).forEach(function (b) { buttons[b.dataset.br] = b; });

        var MAX_TABS = 8;
        var tabs = [];
        var active = null;

        // Sites known to block framing (X-Frame-Options / CSP). Anything unlisted is tried, with a hint just in case.
        var BLOCKED = /(^|\.)(github\.com|linkedin\.com|bing\.com|duckduckgo\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|facebook\.com|instagram\.com|reddit\.com|amazon\.com|stackoverflow\.com|netflix\.com|twitch\.tv|tiktok\.com|apple\.com|microsoft\.com|chatgpt\.com|openai\.com|yahoo\.com|discord\.com|spotify\.com|medium\.com|claude\.ai|anthropic\.com|pinterest\.com|twitch\.com)$/i;
        // Sites known to work inside a frame: no hint needed.
        var FRAMEABLE = /(^|\.)(google\.com|wikipedia\.org|wikimedia\.org|openstreetmap\.org|example\.com)$/i;

        function isGoogle(host) { return /(^|\.)google\.com$/i.test(host); }
        function isYouTubeEmbed(u) { return /(^|\.)youtube\.com$/i.test(u.hostname) && u.pathname.indexOf('/embed/') === 0; }

        // Turn what the visitor typed into a URL: a site path, a web address, or a Google search.
        function resolve(raw) {
            var s = String(raw || '').trim();
            if (!s) return null;
            if (s.charAt(0) === '/') return new URL(s, window.location.origin).href;
            var candidate = null;
            if (/^https?:\/\//i.test(s)) candidate = s;
            else if (!/\s/.test(s) && /^([\w-]+\.)+[a-z]{2,}(:\d+)?([/?#]\S*)?$/i.test(s)) candidate = 'https://' + s;
            else if (/^localhost(:\d+)?([/?#]\S*)?$/i.test(s)) candidate = 'http://' + s;
            if (candidate) {
                try {
                    var u = new URL(candidate);
                    if (u.protocol === 'http:' || u.protocol === 'https:') return u.href;
                } catch (e) {}
            }
            return 'https://www.google.com/search?' + new URLSearchParams({ q: s });
        }

        // What the iframe actually loads: Google needs igu=1 to allow framing; YouTube watch links become embeds.
        function frameUrl(href) {
            var u = new URL(href);
            if (isGoogle(u.hostname)) {
                u.searchParams.set('igu', '1');
                return u.href;
            }
            var host = u.hostname.replace(/^www\./, '');
            if (host === 'youtube.com' && u.pathname === '/watch' && u.searchParams.get('v')) {
                return 'https://www.youtube.com/embed/' + encodeURIComponent(u.searchParams.get('v'));
            }
            if (host === 'youtu.be' && u.pathname.length > 1) {
                return 'https://www.youtube.com/embed/' + encodeURIComponent(u.pathname.slice(1));
            }
            return u.href;
        }

        function isBlocked(href) {
            if (href === 'home') return false;
            var u = new URL(frameUrl(href));
            if (u.origin === window.location.origin || isYouTubeEmbed(u)) return false;
            return BLOCKED.test(u.hostname);
        }

        function titleFor(href) {
            if (href === 'home') return 'Start Page';
            var u = new URL(href);
            if (isGoogle(u.hostname)) {
                var q = u.pathname === '/search' && u.searchParams.get('q');
                return q ? q + ' - Google Search' : 'Google';
            }
            if (/wikipedia\.org$/i.test(u.hostname) && u.pathname.indexOf('/wiki/') === 0 && u.pathname.indexOf(':') < 0) {
                return decodeURIComponent(u.pathname.slice(6)).replace(/_/g, ' ') + ' - Wikipedia';
            }
            if (u.origin === window.location.origin) return u.pathname;
            return u.hostname.replace(/^www\./, '');
        }

        // Show addresses the way people type them (spaces instead of %20).
        function readable(href) {
            try { return decodeURI(href); } catch (e) { return href; }
        }

        function hostOf(href) {
            try { return new URL(href).hostname.replace(/^www\./, ''); } catch (e) { return href; }
        }

        /* ---- tabs ---- */

        function newTab(href) {
            if (tabs.length >= MAX_TABS) {
                navigate(active, href || 'home');
                return active;
            }
            var tab = { history: [], index: -1, frame: null };
            tab.el = make('div', 'br-tab');
            tab.titleBtn = make('button', 'br-tab-title', 'Start Page');
            tab.closeBtn = make('button', 'br-tab-close');
            tab.closeBtn.setAttribute('aria-label', 'Close tab');
            tab.closeBtn.appendChild(svgIcon('g-close'));
            tab.el.appendChild(tab.titleBtn);
            tab.el.appendChild(tab.closeBtn);
            tabBar.insertBefore(tab.el, newTabBtn);

            tab.view = make('div', 'br-view');
            views.appendChild(tab.view);

            tab.titleBtn.addEventListener('click', function () { select(tab); });
            tab.closeBtn.addEventListener('click', function () { closeTab(tab); });
            tab.el.addEventListener('auxclick', function (e) { if (e.button === 1) closeTab(tab); });

            tabs.push(tab);
            select(tab);
            navigate(tab, href || 'home');
            tab.el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            return tab;
        }

        function select(tab) {
            active = tab;
            tabs.forEach(function (t) {
                var on = t === tab;
                t.el.classList.toggle('active', on);
                t.titleBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
                t.view.hidden = !on;
            });
            syncBar();
        }

        function closeTab(tab) {
            var i = tabs.indexOf(tab);
            if (i < 0) return;
            tabs.splice(i, 1);
            tab.el.remove();
            tab.view.remove();
            if (!tabs.length) {
                active = null;
                D.close('browser');
                return;
            }
            if (active === tab) select(tabs[Math.min(i, tabs.length - 1)]);
        }

        function closeAll() {
            tabs.forEach(function (t) { t.el.remove(); t.view.remove(); });
            tabs = [];
            active = null;
        }

        /* ---- navigation ---- */

        function navigate(tab, href) {
            if (!tab || !href) return;
            tab.history = tab.history.slice(0, tab.index + 1);
            tab.history.push(href);
            tab.index = tab.history.length - 1;
            render(tab);
        }

        function step(tab, delta) {
            var i = tab.index + delta;
            if (i < 0 || i >= tab.history.length) return;
            tab.index = i;
            render(tab);
        }

        function render(tab) {
            var href = tab.history[tab.index];
            var view = tab.view;
            view.textContent = '';
            tab.frame = null;

            if (href === 'home') {
                view.appendChild(startPage.content.cloneNode(true));
            } else if (isBlocked(href)) {
                view.appendChild(blockedPage(tab, href));
            } else {
                var u = new URL(frameUrl(href));
                var external = u.origin !== window.location.origin;
                if (external && !FRAMEABLE.test(u.hostname) && !isYouTubeEmbed(u)) view.appendChild(notice(href));

                var frame = document.createElement('iframe');
                frame.title = titleFor(href);
                if (external) {
                    // No allow-top-navigation: a framed site can't navigate this page away.
                    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation');
                    frame.referrerPolicy = 'strict-origin-when-cross-origin';
                }
                frame.allow = 'fullscreen; encrypted-media; picture-in-picture';
                frame.addEventListener('load', function () { onFrameLoad(tab, frame); });
                frame.src = u.href;
                view.appendChild(frame);
                tab.frame = frame;
            }
            setTitle(tab, titleFor(href));
            if (tab === active) syncBar();
        }

        // Same-origin pages (my projects, the classic site) can report their real title and in-page navigation.
        function onFrameLoad(tab, frame) {
            try {
                var loc = frame.contentWindow.location.href;
                if (loc === 'about:blank') return;
                if (frame.contentDocument.title) setTitle(tab, frame.contentDocument.title);
                var cur = tab.history[tab.index];
                if (cur !== 'home' && loc !== cur && loc !== frameUrl(cur)) {
                    tab.history = tab.history.slice(0, tab.index + 1);
                    tab.history.push(loc);
                    tab.index++;
                    if (tab === active) syncBar();
                }
            } catch (e) { /* cross-origin page: nothing to read */ }
        }

        function setTitle(tab, title) {
            tab.titleBtn.textContent = title;
            tab.titleBtn.title = title;
        }

        function blockedPage(tab, href) {
            var wrap = make('div', 'br-blocked');
            var inner = make('div', 'br-blocked-inner');
            var icon = make('span', 'app-icon ic-browser');
            icon.appendChild(svgIcon('i-globe'));
            inner.appendChild(icon);
            inner.appendChild(make('h3', null, hostOf(href) + ' can\u2019t be shown here'));
            inner.appendChild(make('p', null, 'This site doesn\u2019t allow itself to be displayed inside other websites. You can still open it in a normal browser tab.'));
            var row = make('div', 'btn-row');
            var open = make('button', 'btn primary');
            open.appendChild(svgIcon('i-external'));
            open.appendChild(document.createTextNode('Open in new tab'));
            open.addEventListener('click', function () { openInRealTab(href); });
            var back = make('button', 'btn', tab.index > 0 ? 'Go back' : 'Start page');
            back.addEventListener('click', function () {
                if (tab.index > 0) step(tab, -1); else navigate(tab, 'home');
            });
            row.appendChild(open);
            row.appendChild(back);
            inner.appendChild(row);
            wrap.appendChild(inner);
            return wrap;
        }

        function notice(href) {
            var bar = make('div', 'br-notice');
            bar.appendChild(make('span', null, 'Some sites don\u2019t allow being shown inside other pages. If this one stays blank, open it in a new tab.'));
            var btn = make('button', null, 'Open in new tab');
            btn.addEventListener('click', function () { openInRealTab(href); });
            bar.appendChild(btn);
            return bar;
        }

        function syncBar() {
            if (!active) return;
            var href = active.history[active.index];
            if (document.activeElement !== address) address.value = href === 'home' ? '' : readable(href);
            buttons.back.disabled = active.index <= 0;
            buttons.forward.disabled = active.index >= active.history.length - 1;
            buttons.external.disabled = href === 'home';
        }

        // Open a URL typed or clicked by the visitor; framing-blocked sites go straight to a real tab.
        function go(href) {
            if (!href) return;
            if (isBlocked(href)) openInRealTab(href);
            else navigate(active, href);
        }

        /* ---- events ---- */

        bar.addEventListener('submit', function (e) {
            e.preventDefault();
            var href = resolve(address.value);
            if (!href) return;
            address.blur();
            navigate(active, href);
        });
        address.addEventListener('focus', function () { address.select(); });
        address.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { address.blur(); syncBar(); }
        });

        win.addEventListener('click', function (e) {
            var b = e.target.closest('[data-br]');
            if (b && !b.disabled) {
                var cur = active && active.history[active.index];
                switch (b.dataset.br) {
                    case 'newtab': newTab(); break;
                    case 'back': step(active, -1); break;
                    case 'forward': step(active, 1); break;
                    case 'reload': render(active); break;
                    case 'home': navigate(active, 'home'); break;
                    case 'external': if (cur && cur !== 'home') openInRealTab(cur); break;
                }
                return;
            }
            var tile = e.target.closest('.br-tile');
            if (tile) go(resolve(tile.dataset.url));
        });

        // The start page's own search box.
        views.addEventListener('submit', function (e) {
            if (!e.target.classList.contains('br-search')) return;
            e.preventDefault();
            go(resolve(e.target.elements.q.value));
        });

        win.addEventListener('jb:open', function () { if (!tabs.length) newTab(); });
        win.addEventListener('jb:close', closeAll);

        return {
            // Open a page from elsewhere (the terminal): reuse a start-page tab, otherwise add a tab.
            open: function (raw) {
                var href = resolve(raw);
                D.open('browser');
                if (!href) return;
                if (isBlocked(href)) { openInRealTab(href); return; }
                if (active && active.history[active.index] === 'home') navigate(active, href);
                else newTab(href);
            },
            resolve: resolve
        };
    })();

    /* =====================================================================
       Terminal: a tiny shell. Portfolio answers are read from the other
       windows' HTML so there's a single source of truth.
       ===================================================================== */

    (function () {
        var win = D.window('terminal');
        var body = $('.win-body', win);
        var out = $('.term-out', win);
        var form = $('.term-line', win);
        var input = $('#term-input');
        var PROMPT = 'visitor@jamari ~ %';
        var history = [];
        var hIndex = 0;
        var startedAt = Date.now();

        var APPS = {
            about: 'about', experience: 'experience', exp: 'experience', projects: 'projects', resume: 'resume', cv: 'resume',
            contact: 'contact', snake: 'snake', astar: 'astar', 'a*': 'astar', pathfinding: 'astar', browser: 'browser',
            web: 'browser', notes: 'notes', calculator: 'calculator', calc: 'calculator', settings: 'settings',
            terminal: 'terminal', classic: 'classic'
        };

        /* ---- output helpers ---- */

        function print(parts, cls) {
            var p = make('p', cls);
            [].concat(parts).forEach(function (part) {
                if (part == null) return;
                p.appendChild(typeof part === 'string' ? document.createTextNode(part) : part);
            });
            if (!p.childNodes.length) p.textContent = '\u00a0';
            out.appendChild(p);
            return p;
        }
        function span(text, cls) { return make('span', cls, text); }
        function link(text, href) {
            var a = make('a', null, text);
            a.href = href;
            if (href.indexOf('mailto:') !== 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            return a;
        }
        function pad(s, n) { while (s.length < n) s += ' '; return s; }
        function clean(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }

        /* ---- portfolio content ---- */

        function about() {
            print(span('Jamari Benologa', 'term-accent'));
            print(clean($('#win-about .about > p')));
        }

        function experience() {
            $$('#win-experience .exp-list > *').forEach(function (el) {
                if (el.classList.contains('exp-group')) {
                    print('');
                    print(span(clean(el), 'term-accent'));
                    return;
                }
                var panel = document.getElementById(el.getAttribute('aria-controls'));
                print([
                    '  \u2022 ', span(clean($('h3', panel)), 'term-cmd'),
                    ': ' + clean($('.role-line', panel)) + '  ',
                    span('(' + clean($('.muted', panel)) + ')', 'term-dim')
                ]);
            });
            print('');
            print(span('Type `open experience` for the full details.', 'term-dim'));
        }

        function projectItems() {
            return $$('#win-projects .project-item').map(function (b) { return clean(b); });
        }

        function projects() {
            projectItems().forEach(function (name, i) {
                print(['  ', span(String(i + 1) + '.', 'term-dim'), ' ', span(name, 'term-cmd')]);
            });
            print('');
            print(span('Type `open projects` to browse them, or `open snake` / `open astar` to play.', 'term-dim'));
        }

        function skills() {
            $$('#win-about .skill-group').forEach(function (g) {
                var items = $$('.chips li', g).map(clean).join(', ');
                print([span(pad(clean($('h5', g)) + ':', 20), 'term-accent'), items]);
            });
        }

        function contact() {
            $$('#win-contact .contact-list a').forEach(function (a) {
                var label = clean($('strong', a));
                var shown = a.href.indexOf('mailto:') === 0 ? a.href.slice(7) : a.href.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
                print(['  ', span(pad(label, 22), 'term-dim'), link(shown, a.href)]);
            });
        }

        function neofetch() {
            var art = ['     _ ____  ', '    | | __ ) ', ' _  | |  _ \\ ', '| |_| | |_) |', ' \\___/|____/ ', '', '', '', '', '', ''];
            var mins = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
            var theme = Settings.get('theme');
            var wp = Settings.get('wallpaper');
            var info = [
                [span('visitor', 'term-accent'), '@', span('jamari', 'term-accent')],
                ['--------------'],
                [span('OS: ', 'term-accent'), 'JB Desktop 1.0'],
                [span('Host: ', 'term-accent'), 'jamaribenologa.com'],
                [span('Shell: ', 'term-accent'), 'jsh (a tiny JavaScript shell)'],
                [span('Uptime: ', 'term-accent'), mins + (mins === 1 ? ' min' : ' mins')],
                [span('Resolution: ', 'term-accent'), window.innerWidth + 'x' + window.innerHeight],
                [span('Theme: ', 'term-accent'), theme.charAt(0).toUpperCase() + theme.slice(1)],
                [span('Wallpaper: ', 'term-accent'), wp.charAt(0).toUpperCase() + wp.slice(1)],
                [span('Role: ', 'term-accent'), 'Tech Architecture Analyst @ Accenture'],
                [span('Location: ', 'term-accent'), 'Austin, Texas']
            ];
            info.forEach(function (parts, i) {
                print([span(pad(art[i] || '', 16), 'term-accent')].concat(parts));
            });
        }

        /* ---- commands ---- */

        var FILES = { 'about.txt': about, 'experience.txt': experience, 'skills.txt': skills, 'contact.txt': contact };

        var COMMANDS = {
            help: { desc: 'Show this list', run: function () {
                Object.keys(COMMANDS).forEach(function (name) {
                    var c = COMMANDS[name];
                    if (c.hidden) return;
                    print(['  ', span(pad(c.usage || name, 22), 'term-good'), c.desc]);
                });
            } },
            about: { desc: 'Who I am', run: about },
            experience: { desc: 'Where I\u2019ve worked and studied', run: experience },
            projects: { desc: 'Things I\u2019ve built', run: projects },
            skills: { desc: 'Languages and tools I use', run: skills },
            contact: { desc: 'How to reach me', run: contact },
            resume: { desc: 'Open my resume', run: function () { print('Opening Resume.pdf\u2026'); D.open('resume'); } },
            open: { usage: 'open <app>', desc: 'Open an app (about, projects, snake, astar, browser\u2026)', run: function (args) {
                var name = (args[0] || '').toLowerCase();
                var app = APPS[name];
                if (!name) { print('usage: open <app>. Apps: ' + Object.keys(APPS).filter(function (k) { return APPS[k] === k; }).join(', '), 'term-dim'); return; }
                if (!app) { print('open: no app called \u201c' + name + '\u201d. Try: ' + Object.keys(APPS).filter(function (k) { return APPS[k] === k; }).join(', '), 'term-err'); return; }
                if (app === 'terminal') { print('You\u2019re already here.'); return; }
                if (app === 'classic') { print('Heading to the classic site\u2026'); window.location.href = '/'; return; }
                print('Opening ' + app + '\u2026');
                D.open(app);
            } },
            search: { usage: 'search <words>', desc: 'Search Google in the Browser', run: function (args) {
                if (!args.length) { print('usage: search <words>', 'term-dim'); return; }
                print('Searching Google for \u201c' + args.join(' ') + '\u201d\u2026');
                Browser.open('https://www.google.com/search?' + new URLSearchParams({ q: args.join(' ') }));
            } },
            browse: { usage: 'browse <url>', desc: 'Open a web page in the Browser', run: function (args) {
                if (!args.length) { D.open('browser'); return; }
                print('Opening ' + args.join(' ') + '\u2026');
                Browser.open(args.join(' '));
            } },
            neofetch: { desc: 'System info', run: neofetch },
            theme: { usage: 'theme <auto|light|dark>', desc: 'Change the appearance', run: function (args) {
                var t = (args[0] || '').toLowerCase();
                if (['auto', 'light', 'dark'].indexOf(t) < 0) { print('usage: theme <auto|light|dark>', 'term-dim'); return; }
                Settings.set('theme', t);
                print('Theme set to ' + t + '.', 'term-good');
            } },
            wallpaper: { usage: 'wallpaper <name>', desc: 'Change the wallpaper', run: function (args) {
                var w = (args[0] || '').toLowerCase();
                if (Settings.wallpapers.indexOf(w) < 0) { print('usage: wallpaper <' + Settings.wallpapers.join('|') + '>', 'term-dim'); return; }
                Settings.set('wallpaper', w);
                print('Wallpaper set to ' + w + '.', 'term-good');
            } },
            ls: { desc: 'List files', run: function (args) {
                if ((args[0] || '').replace(/\/$/, '') === 'projects') {
                    print(projectItems().map(function (n) { return n.toLowerCase().replace(/[^a-z0-9*]+/g, '-'); }).join('  '));
                    return;
                }
                print([Object.keys(FILES).join('  ') + '  resume.pdf  ', span('projects/', 'term-accent')]);
            } },
            cat: { usage: 'cat <file>', desc: 'Read a file', run: function (args) {
                var f = args[0];
                if (!f) { print('usage: cat <file>. Try `ls` first.', 'term-dim'); return; }
                if (FILES[f]) FILES[f]();
                else if (f === 'resume.pdf') print('cat: resume.pdf: that\u2019s a PDF. Try `open resume`.', 'term-err');
                else if (f.replace(/\/$/, '') === 'projects') print('cat: projects: Is a directory', 'term-err');
                else print('cat: ' + f + ': No such file or directory', 'term-err');
            } },
            date: { desc: 'Show the date and time', run: function () { print(new Date().toString()); } },
            whoami: { desc: 'Who are you?', run: function () { print('visitor'); print(span('(I\u2019m Jamari. Type `about` to learn more.)', 'term-dim')); } },
            echo: { usage: 'echo <text>', desc: 'Print some text', run: function (args) { print(args.join(' ')); } },
            history: { desc: 'Commands you\u2019ve run', run: function () {
                history.forEach(function (c, i) { print(['  ', span(pad(String(i + 1), 4), 'term-dim'), c]); });
            } },
            clear: { desc: 'Clear the screen', run: function () { out.textContent = ''; } },
            exit: { desc: 'Close the terminal', run: function () { D.close('terminal'); } },

            // Easter eggs
            sudo: { hidden: true, run: function () { print('visitor is not in the sudoers file. This incident will be reported.', 'term-err'); } },
            rm: { hidden: true, run: function () { print('rm: permission denied (nice try)', 'term-err'); } },
            cd: { hidden: true, run: function () { print('cd: there\u2019s only one folder here, and it likes where it is.'); } },
            pwd: { hidden: true, run: function () { print('/home/visitor'); } },
            hello: { hidden: true, run: function () { print('Hey there! Type `help` to see what you can do.'); } },
            hi: { hidden: true, run: function () { COMMANDS.hello.run(); } },
            google: { hidden: true, run: function (args) { COMMANDS.search.run(args); } },
            man: { hidden: true, run: function () { COMMANDS.help.run(); } }
        };

        function run(line) {
            print([span(PROMPT, 'term-good'), ' ', span(line, 'term-cmd')]);
            var trimmed = line.trim();
            if (trimmed) {
                history.push(trimmed);
                var args = trimmed.split(/\s+/);
                var name = args.shift().toLowerCase();
                var cmd = COMMANDS[name];
                if (cmd) cmd.run(args);
                else print('jsh: command not found: ' + name + '. Type `help` for a list of commands.', 'term-err');
            }
            hIndex = history.length;
            body.scrollTop = body.scrollHeight;
        }

        function welcome() {
            var when = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replace(/,/g, '');
            print('Last login: ' + when + ' on ttys001', 'term-dim');
            print(['Welcome to ', span('jsh', 'term-accent'), ', the shell for Jamari\u2019s desktop.']);
            print(['Type ', span('help', 'term-good'), ' to see what you can do, or try ', span('neofetch', 'term-good'), '.']);
            print('');
        }

        function complete() {
            var value = input.value;
            var parts = value.split(/\s+/);
            var pool, word;
            if (parts.length === 1) { pool = Object.keys(COMMANDS).filter(function (k) { return !COMMANDS[k].hidden; }); word = parts[0]; }
            else if (parts.length === 2 && parts[0] === 'open') { pool = Object.keys(APPS); word = parts[1]; }
            else if (parts.length === 2 && parts[0] === 'cat') { pool = Object.keys(FILES).concat('resume.pdf'); word = parts[1]; }
            else return;
            var matches = pool.filter(function (k) { return k.indexOf(word.toLowerCase()) === 0; });
            if (matches.length === 1) {
                parts[parts.length - 1] = matches[0];
                input.value = parts.join(' ') + ' ';
            } else if (matches.length > 1) {
                print([span(PROMPT, 'term-good'), ' ', span(value, 'term-cmd')]);
                print(matches.join('  '), 'term-dim');
                body.scrollTop = body.scrollHeight;
            }
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var line = input.value;
            input.value = '';
            run(line);
        });

        input.addEventListener('keydown', function (e) {
            if (e.key === 'ArrowUp' && history.length) {
                e.preventDefault();
                hIndex = Math.max(0, hIndex - 1);
                input.value = history[hIndex];
            } else if (e.key === 'ArrowDown' && history.length) {
                e.preventDefault();
                hIndex = Math.min(history.length, hIndex + 1);
                input.value = history[hIndex] || '';
            } else if (e.key === 'Tab') {
                e.preventDefault();
                complete();
            } else if (e.key === 'l' && e.ctrlKey) {
                e.preventDefault();
                out.textContent = '';
            }
        });

        // Clicking anywhere in the terminal types into it (unless the visitor is selecting text).
        body.addEventListener('mouseup', function () {
            if (!String(window.getSelection())) input.focus({ preventScroll: true });
        });

        win.addEventListener('jb:open', function () { if (!out.childNodes.length) welcome(); });
        win.addEventListener('jb:close', function () { out.textContent = ''; history = []; hIndex = 0; });
    })();

    /* =====================================================================
       Notes: saved in the visitor's browser (localStorage)
       ===================================================================== */

    (function () {
        var win = D.window('notes');
        var list = $('.notes-list', win);
        var editor = $('.notes-editor', win);
        var WELCOME = [
            'Welcome to my desktop',
            '',
            'Thanks for stopping by! I built this desktop from scratch with plain HTML, CSS and JavaScript: no frameworks, just a small window manager and a handful of apps.',
            '',
            'Things to try:',
            '\u2022 Play Snake, or watch A* find the shortest path',
            '\u2022 Open Terminal and type help',
            '\u2022 Search the web in Browser',
            '\u2022 Pick a new wallpaper in Settings',
            '',
            'Anything you write here is saved in your browser only, so feel free to use it as a scratchpad.',
            '',
            '\u2014 Jamari'
        ].join('\n');

        function makeNote(text) {
            return { id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: text || '', updated: Date.now() };
        }

        var data = load('jb-notes', null);
        if (!data || !Array.isArray(data.notes) || !data.notes.length) data = { notes: [makeNote(WELCOME)], active: null };

        function find(id) { return data.notes.filter(function (n) { return n.id === id; })[0]; }
        function current() { return find(data.active) || data.notes[0]; }

        var saveTimer;
        function persist() {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(function () { save('jb-notes', data); }, 250);
        }

        function titleOf(note) {
            var first = note.text.split('\n').filter(function (l) { return l.trim(); })[0];
            return first ? first.trim().slice(0, 60) : 'New note';
        }

        var timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
        var dayFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
        function whenOf(note) {
            var d = new Date(note.updated);
            return d.toDateString() === new Date().toDateString() ? timeFmt.format(d) : dayFmt.format(d);
        }

        function renderList() {
            var active = current();
            list.textContent = '';
            data.notes.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (note) {
                var li = document.createElement('li');
                var b = make('button', 'note-item');
                b.setAttribute('aria-current', note === active ? 'true' : 'false');
                b.appendChild(make('strong', null, titleOf(note)));
                b.appendChild(make('small', null, whenOf(note)));
                b.addEventListener('click', function () { show(note); });
                li.appendChild(b);
                list.appendChild(li);
            });
        }

        function show(note) {
            data.active = note.id;
            editor.value = note.text;
            renderList();
            persist();
        }

        editor.addEventListener('input', function () {
            var note = current();
            note.text = editor.value;
            note.updated = Date.now();
            renderList();
            persist();
        });

        win.addEventListener('click', function (e) {
            var b = e.target.closest('[data-note]');
            if (!b) return;
            if (b.dataset.note === 'new') {
                var note = makeNote('');
                data.notes.push(note);
                show(note);
                editor.focus();
            } else if (b.dataset.note === 'delete') {
                var cur = current();
                if (cur.text.trim() && !window.confirm('Delete \u201c' + titleOf(cur) + '\u201d?')) return;
                data.notes = data.notes.filter(function (n) { return n !== cur; });
                if (!data.notes.length) data.notes.push(makeNote(''));
                show(data.notes.slice().sort(function (a, b) { return b.updated - a.updated; })[0]);
            }
        });

        show(current());
    })();

    /* =====================================================================
       Calculator
       ===================================================================== */

    (function () {
        var win = D.window('calculator');
        var display = $('.calc-display', win);
        var keys = $('.calc-keys', win);
        var cur = '0';        // text being entered / shown
        var acc = null;       // left-hand value
        var op = null;        // pending operator
        var fresh = true;     // next digit starts a new number
        var repeat = null;    // pressing = again repeats the last operation

        function fmt(n) {
            if (!isFinite(n)) return 'Error';
            var s = String(parseFloat(n.toPrecision(12)));
            if (s.replace(/[-.]/g, '').length > 12) s = n.toExponential(6).replace(/\.?0+e/, 'e');
            return s;
        }

        function apply(a, b, o) {
            switch (o) {
                case '+': return a + b;
                case '-': return a - b;
                case '*': return a * b;
                case '/': return b === 0 ? NaN : a / b;
            }
            return b;
        }

        function reset() { cur = '0'; acc = null; op = null; fresh = true; repeat = null; }

        function setOp(o) {
            var v = Number(cur);
            if (op && !fresh) {
                acc = apply(acc, v, op);
                cur = fmt(acc);
            } else if (!op) {
                acc = v;
            }
            op = cur === 'Error' ? null : o;
            fresh = true;
            repeat = null;
        }

        function equals() {
            var v = Number(cur);
            if (op) {
                repeat = { op: op, v: v };
                cur = fmt(apply(acc, v, op));
                acc = null;
                op = null;
            } else if (repeat) {
                cur = fmt(apply(v, repeat.v, repeat.op));
            }
            fresh = true;
        }

        function press(k) {
            if (cur === 'Error' && k !== 'clear') reset();
            if (/^\d$/.test(k)) {
                if (fresh) { cur = k; fresh = false; }
                else if (cur.replace(/[-.]/g, '').length < 12) cur = cur === '0' ? k : cur === '-0' ? '-' + k : cur + k;
            } else if (k === '.') {
                if (fresh) { cur = '0.'; fresh = false; }
                else if (cur.indexOf('.') < 0) cur += '.';
            } else if (k === 'clear') {
                reset();
            } else if (k === 'neg') {
                if (fresh && op) { cur = '-0'; fresh = false; }
                else cur = cur.charAt(0) === '-' ? cur.slice(1) : '-' + cur;
            } else if (k === '%') {
                cur = fmt(Number(cur) / 100);
                fresh = false;
            } else if (k === 'back') {
                if (!fresh) {
                    cur = cur.slice(0, -1);
                    if (cur === '' || cur === '-') cur = '0';
                }
            } else if ('+-*/'.indexOf(k) > -1) {
                setOp(k);
            } else if (k === '=') {
                equals();
            }
            render();
        }

        function pretty(s) {
            if (s === 'Error' || s.indexOf('e') > -1) return s;
            var neg = s.charAt(0) === '-';
            var parts = s.replace('-', '').split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return (neg ? '-' : '') + parts.join('.');
        }

        function render() {
            var text = pretty(cur);
            display.textContent = text;
            display.style.fontSize = text.length <= 7 ? '' : text.length <= 9 ? '42px' : text.length <= 12 ? '33px' : '26px';
            $$('.op', keys).forEach(function (b) { b.classList.toggle('active', fresh && op === b.dataset.k); });
        }

        keys.addEventListener('click', function (e) {
            var b = e.target.closest('[data-k]');
            if (b) press(b.dataset.k);
        });

        var KEYMAP = { Enter: '=', '=': '=', Backspace: 'back', Delete: 'clear', c: 'clear', C: 'clear', x: '*', X: '*', ',': '.' };
        win.addEventListener('keydown', function (e) {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            if ((e.key === 'Enter' || e.key === ' ') && e.target.tagName === 'BUTTON') return;   // let a focused key press itself
            var k = KEYMAP[e.key] || e.key;
            if (!/^[\d.+\-*/%=]$/.test(k) && k !== 'back' && k !== 'clear') return;
            e.preventDefault();
            press(k);
            var btn = $('[data-k="' + (k === 'back' ? 'clear' : k) + '"]', keys);
            if (btn) {
                btn.classList.add('pressed');
                setTimeout(function () { btn.classList.remove('pressed'); }, 110);
            }
        });

        render();
    })();
})();
