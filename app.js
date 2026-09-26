// change color of navbar when not in home area
document.onscroll = function() {
    const about = document.querySelector('#id-about');
    const nav = document.querySelector('.navbar');
    
    if (about.getBoundingClientRect().top <= 120) {
        nav.classList.add('scrolled');
    } else {
        nav.classList.remove('scrolled');
    }
}

// change nav bar color depending on section
document.addEventListener("DOMContentLoaded", function () {
    var navItems = document.querySelectorAll('#nav-wrap .navbar ul li');

    function getActiveSection() {
        var scrollPosition = window.scrollY;
        var activeSection = null;

        document.querySelectorAll('section[id^="id-"]').forEach(function (section) {
            var sectionTop = section.offsetTop - 50;

            if (scrollPosition >= sectionTop) {
                activeSection = section.id;
            }
        });

        if (scrollPosition < 800) {
            activeSection = 'id-home';
        }

        // On tall screens the page runs out before Contact's top reaches the menu, so the bottom counts as Contact.
        if (window.innerHeight + scrollPosition >= document.documentElement.scrollHeight - 2) {
            activeSection = 'id-contact';
        }

        return activeSection;
    }

    function updateActiveNavItem() {
        var activeSectionId = getActiveSection();

        navItems.forEach(function (navItem) {
            var sectionId = navItem.querySelector('a').getAttribute('href').substring(1);

            if (sectionId === activeSectionId) {
                navItem.classList.add('active');
            } else {
                navItem.classList.remove('active');
            }
        });
    }

    window.addEventListener('scroll', function () {
        updateActiveNavItem();
    });

    updateActiveNavItem();
});

// Shared scroll-reveal helper: watches `elements` and calls onIntersect(target)
// the first time each one scrolls into view.
function revealOnIntersect(elements, onIntersect, options) {
    options = options || { root: null, rootMargin: '0px', threshold: 0.15 };

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                onIntersect(entry.target);
            }
        });
    }, options);

    elements.forEach(function (el) {
        observer.observe(el);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    // Timeline entries: fade in each block's image and text box as it enters view
    revealOnIntersect(document.querySelectorAll('.timeline-block'), function (target) {
        target.querySelector('img').classList.add('visible');
        target.querySelector('.text-box').classList.add('visible');
    });

    // Timeline lines: both the work and education lines appear together once
    // either one comes into view
    var timelineWraps = document.querySelectorAll('.timeline-wrap');
    revealOnIntersect(timelineWraps, function () {
        timelineWraps.forEach(function (wrap) {
            wrap.classList.add('appear');
        });
    });

    // Simple fade-in-on-scroll sections: about intro, profile/skills columns,
    // and the hire-me/download-cv buttons
    ['.about-intro', '.col-items-about-profile', '.profile-contact'].forEach(function (selector) {
        revealOnIntersect(document.querySelectorAll(selector), function (target) {
            target.classList.add('appear');
        });
    });
});




var currentYear = new Date().getFullYear();
document.getElementById("year").innerHTML = " " + currentYear;

// Modal
function openModal(modalId) {
    var modal = document.getElementById(modalId);
    var title = modal.querySelector('h4');
    track('classic-project/' + modalId, title ? title.textContent.trim() : modalId);
    modal.classList.add('modal-open');
    modal.style.display = "block";
}

function closeModal() {
    var modals = document.querySelectorAll('.modal');
    modals.forEach(function(modal) {
        modal.classList.remove('modal-open');
        modal.style.display = "none";
    });
}

var modalLinks = document.querySelectorAll('a[href^="#myModal-"]');

modalLinks.forEach(function(modalLink) {
    modalLink.addEventListener('click', function(event) {
        event.preventDefault();
        var modalId = modalLink.getAttribute('href').substring(1);
        openModal(modalId);
    });
});

window.onclick = function(event) {
    var modals = document.querySelectorAll('.modal');
    modals.forEach(function(modal) {
        if (event.target == modal) {
            closeModal();
        }
    });
};

var closeLinks = document.querySelectorAll('.modal .close');

closeLinks.forEach(function(closeLink) {
    closeLink.addEventListener('click', function() {
        closeModal();
    });
});

// Visitor analytics (GoatCounter): count project views and clicks on the links that matter most.
function track(path, title) {
    if (window.goatcounter && window.goatcounter.count) {
        window.goatcounter.count({ path: path, title: title || path, event: true });
    }
}

function linkEvent(href) {
    if (/Resume\.pdf/.test(href)) return 'click/resume';
    if (/\/desktop\//.test(href)) return 'click/desktop-mode';
    if (/linkedin\.com/.test(href)) return 'click/linkedin';
    if (/github\.com/.test(href)) return 'click/github';
    if (/^mailto:/.test(href)) return 'click/email';
    if (/^\/(snake|a-star|triage)\//.test(href)) return 'click/demo' + href.replace(/\/$/, '');
    return null;
}

document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href]');
    if (!link) return;
    var name = linkEvent(link.getAttribute('href'));
    if (name) track(name, link.textContent.trim() || name);
});

// Contact form: send through Formspree without leaving the page.
(function () {
    var form = document.getElementById('contactForm');
    if (!form) return;
    var status = form.querySelector('.cf-status');
    var button = form.querySelector('.cf-send');

    function say(text, cls) {
        status.textContent = text;
        status.className = 'cf-status' + (cls ? ' ' + cls : '');
    }

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        var firstBad = null;
        form.querySelectorAll('input[required], textarea[required]').forEach(function (field) {
            var ok = field.checkValidity() && field.value.trim() !== '';
            field.setAttribute('aria-invalid', ok ? 'false' : 'true');
            if (!ok && !firstBad) firstBad = field;
        });
        if (firstBad) {
            say('Please fill in your name, a valid email, and a message.', 'bad');
            firstBad.focus();
            return;
        }
        button.disabled = true;
        say('Sending\u2026');
        fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
            .then(function (res) {
                if (!res.ok) throw new Error(res.status);
                form.reset();
                say('Thanks! Your message was sent. I\u2019ll get back to you soon.', 'good');
                track('contact-form/sent', 'Contact form (classic)');
            })
            .catch(function () {
                say('Sorry, that didn\u2019t send. Please email me at jamaribenologabusiness@gmail.com.', 'bad');
            })
            .then(function () { button.disabled = false; });
    });
})();
