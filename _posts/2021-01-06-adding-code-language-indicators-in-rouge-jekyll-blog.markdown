---
layout: post
title: Adding code block language indicators to your Jekyll Rouge highlighter blog
date:   2021-01-07 00:00:00 +0000
tags:
    - javascript
    - web dev
    - jekyll
image: /assets/images/blog/M42-43-NGC-1977.jpg
description: >
    Adding code block language indicators to your Jekyll Rouge highlighter blog 
---
If you've got a Jekyll blog and you're looking to add some language `<span>` tags to your code blocks, look no further! I did came to this solution after failing to find the rouge option that would do what I wanted and also finding out that you **cannot** modify a psuedo element with javascript! 🤷‍♂️

Try this `jQuery` snippet to grab the name of the language from the css classes that rouge highlighter adds to your code blocks.

```javascript
// Iterate over all div's with the highlighter-rouge class
// div is needed since highlighter-rouge is also added to 
// inline code blocks
$("div.highlighter-rouge").each(function () {
  // Get the list of classes
  let classList = $(this).attr("class");
  // Grab the language
  let lang = classList.split("language-")[1].split(" ")[0];
  // Get the next child div element
  let div = $(this).find(":first-child");
  // prepend a <span> with our language code name
  div.prepend(`<span class="lang_id">${lang}</span>`);
});
```

Then add some style with CSS/SASS

```scss
  .highlighter-rouge {
    margin: 40px 0;
    div.highlight {
      position: relative;
      span.lang_id {
        margin-right: 10px;
        width: auto;
        font-size: 14px;
        color: white;
        top: -10px;
        padding: 0 4px;
        border-radius: 1px;
        left: -5px;
        position: absolute;
        background-color: black;
      }
    }
  }
```

If you enjoyed this post then consider following me on Twitter to get notified when I push new posts/updates😅

[https://twitter.com/the_actual_kyle](https://twitter.com/the_actual_kyle)
