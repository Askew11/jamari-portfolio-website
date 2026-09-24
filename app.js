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






