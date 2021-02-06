$(function () {
  $("#progress").progress();
  // Smooth scrolling using jQuery easing
  $('a.js-scroll-trigger[href*="#"]:not([href="#"])').click(function () {
    if (
      location.pathname.replace(/^\//, "") ==
        this.pathname.replace(/^\//, "") &&
      location.hostname == this.hostname
    ) {
      var target = $(this.hash);
      target = target.length ? target : $("[name=" + this.hash.slice(1) + "]");
      if (target.length) {
        $("html, body").animate(
          {
            scrollTop: target.offset().top - 54,
          },
          1000,
          "easeInOutExpo"
        );
        return false;
      }
    }
  });

  // Closes responsive menu when a scroll trigger link is clicked
  $(".js-scroll-trigger").click(function () {
    $(".navbar-collapse").collapse("hide");
  });

  var animated = 0;
  var shrunk = false;
  // Collapse Navbar
  var navbarCollapse = function () {
    if ($("#mainNav").offset().top > 0) {
      $("#mainNav").addClass("navbar-shrink");
      shrunk = true;
    } else {
      if (shrunk === true && animated == 0) {
        $(".get_started > .btn").addClass("animated tada");
        animated++;
      }
      $(".get_started > .btn").bind(
        "animationend webkitAnimationEnd oAnimationEnd MSAnimationEnd",
        function () {
          $(this).removeClass("animated tada");
        }
      );
      $("#mainNav").removeClass("navbar-shrink");
    }
  };
  // Collapse now if page is not at top
  navbarCollapse();
  // Collapse the navbar when page is scrolled
  $(window).scroll(navbarCollapse);
  if ($("div.highlighter-rouge").length > 0) {
    $("div.highlighter-rouge").each(function () {
      let classList = $(this).attr("class");
      let lang = classList.split("language-")[1].split(" ")[0];
      let div = $(this).find(":first-child");
      div.prepend(`<span class="lang_id">${lang}</span>`);
    });
  }
});
