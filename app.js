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

// make image and text box appear when entering timeline zone
document.addEventListener("DOMContentLoaded", function () {

    var timelineBlocks = document.querySelectorAll('.timeline-block');

    var options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.5 
    };

    var handleIntersection = function (entries, observer) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                
                entry.target.querySelector('img').classList.add('visible');
                entry.target.querySelector('.text-box').classList.add('visible');
            }
        });
    };

    
    timelineBlocks.forEach(function (timelineBlock) {
        var observer = new IntersectionObserver(handleIntersection, options);
        observer.observe(timelineBlock);
    });
});

// make timeline line appear and start moving when entering timeline zone
document.addEventListener("DOMContentLoaded", function () {
    var timelineWraps = document.querySelectorAll('.timeline-wrap');

    
    var options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
    };

    
    var handleIntersection = function (entries, observer) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                
                timelineWraps.forEach(function (timelineWrap) {
                    timelineWrap.classList.add('appear');
                });
            }
        });
    };

    
    var observer = new IntersectionObserver(handleIntersection, options);

    
    timelineWraps.forEach(function (timelineWrap) {
        observer.observe(timelineWrap);
    });
});

// make about information appear when entering information zone
document.addEventListener("DOMContentLoaded", function () {
    var informationBlocks = document.querySelectorAll('.about-intro');

    var options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
    };

    var handleIntersection = function (entries, observer) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('appear');
            }
        });
    };

    var observer = new IntersectionObserver(handleIntersection, options);

    informationBlocks.forEach(function (informationBlock) {
        observer.observe(informationBlock);
    });
});

// make skill bar and profile slide into view when intersection the zone
document.addEventListener("DOMContentLoaded", function () {
    var itemAboutProfiles = document.querySelectorAll('.col-items-about-profile');

    var options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
    };

    var handleIntersection = function (entries, observer) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('appear');
            }
        });
    };

    var observer = new IntersectionObserver(handleIntersection, options);

    itemAboutProfiles.forEach(function (itemAboutProfile) {
        observer.observe(itemAboutProfile);
    });
});

//make pofile contact buttons appear
document.addEventListener("DOMContentLoaded", function () {
    var profilecontacts = document.querySelectorAll('.profile-contact');

    var options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.5
    };

    var handleIntersection = function (entries, observer) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('appear');
            }
        });
    };

    var observer = new IntersectionObserver(handleIntersection, options);

    profilecontacts.forEach(function (profilecontact) {
        observer.observe(profilecontact);
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






