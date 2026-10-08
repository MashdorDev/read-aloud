
//Floating playback bar shown on the page while a selection is read.
//It lives in a shadow root so the page's styles can't reach it.

var pageControls = (function() {
  var rates = [0.75, 1, 1.25, 1.5, 1.75, 2]
  var icons = {
    grip: "M9 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM9 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
    rewind: "M6 6h2v12H6zm3.5 6l8.5 6V6z",
    play: "M8 5v14l11-7z",
    pause: "M6 19h4V5H6v14zm8-14v14h4V5h-4z",
    forward: "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z",
    stop: "M6 6h12v12H6z",
  }
  var host = null
  var elems = null

  var css = `
    .bar {
      display: flex; align-items: center; gap: 2px;
      padding: 6px 8px 6px 4px;
      background: #202124; color: #e8eaed;
      border-radius: 999px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      font: 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
      user-select: none;
    }
    button, select {
      font: inherit; color: inherit; background: none; border: 0; margin: 0;
      cursor: pointer; border-radius: 999px;
    }
    button { width: 34px; height: 34px; padding: 0; display: grid; place-items: center; }
    button:hover, select:hover { background: rgba(255, 255, 255, 0.12); }
    button:focus-visible, select:focus-visible { outline: 2px solid #ffc933; outline-offset: 1px; }
    svg { width: 20px; height: 20px; fill: currentColor; }
    .grip { width: 22px; cursor: grab; color: #9aa0a6; }
    .grip:hover { background: none; }
    .grip:active { cursor: grabbing; }
    .toggle { width: 40px; height: 40px; background: #ffc933; color: #202124; }
    .toggle:hover { background: #ffd65c; }
    .toggle svg { width: 24px; height: 24px; }
    select { height: 30px; padding: 0 6px; margin: 0 2px; appearance: none; -webkit-appearance: none; }
    select option { color: #202124; background: #fff; }
    .loading .toggle { opacity: 0.6; }
  `

  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + icons[name] + '"/></svg>'
  }

  function show(onCommand) {
    hide()
    host = document.createElement("div")
    var hostStyle = {position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", "z-index": "2147483647", margin: "0", padding: "0", border: "0", background: "none"}
    for (var name in hostStyle) host.style.setProperty(name, hostStyle[name], "important")
    var root = host.attachShadow({mode: "open"})
    root.innerHTML = '<style>' + css + '</style>' +
      '<div class="bar" role="toolbar" aria-label="Read Aloud">' +
        '<button class="grip" title="Drag to move" aria-hidden="true" tabindex="-1">' + icon("grip") + '</button>' +
        '<button class="rewind" title="Previous sentence" aria-label="Previous sentence">' + icon("rewind") + '</button>' +
        '<button class="toggle" title="Pause" aria-label="Pause">' + icon("pause") + '</button>' +
        '<button class="forward" title="Next sentence" aria-label="Next sentence">' + icon("forward") + '</button>' +
        '<select class="rate" title="Speed" aria-label="Speed">' +
          rates.map(function(rate) {return '<option value="' + rate + '">' + rate + 'x</option>'}).join("") +
        '</select>' +
        '<button class="stop" title="Stop" aria-label="Stop">' + icon("stop") + '</button>' +
      '</div>'
    elems = {
      root: root,
      bar: root.querySelector(".bar"),
      toggle: root.querySelector(".toggle"),
      rate: root.querySelector(".rate"),
      state: null,
    }
    root.querySelector(".rewind").addEventListener("click", function() {onCommand("rewind")})
    root.querySelector(".forward").addEventListener("click", function() {onCommand("forward")})
    root.querySelector(".stop").addEventListener("click", function() {onCommand("stop")})
    elems.toggle.addEventListener("click", function() {onCommand(elems.state == "PAUSED" ? "resume" : "pause")})
    elems.rate.addEventListener("change", function() {onCommand("rate", Number(elems.rate.value))})
    makeDraggable(root.querySelector(".grip"))
    document.documentElement.appendChild(host)
  }

  function update(state, rate) {
    if (!elems) return
    if (state != elems.state) {
      elems.state = state
      var paused = state == "PAUSED"
      elems.toggle.innerHTML = icon(paused ? "play" : "pause")
      elems.toggle.title = paused ? "Play" : "Pause"
      elems.toggle.setAttribute("aria-label", elems.toggle.title)
      elems.bar.classList.toggle("loading", state == "LOADING")
    }
    if (rate != null && elems.root.activeElement != elems.rate) {
      if (!rates.includes(rate)) {
        var option = document.createElement("option")
        option.value = rate
        option.textContent = rate + "x"
        elems.rate.appendChild(option)
      }
      elems.rate.value = String(rate)
    }
  }

  function hide() {
    if (host) host.remove()
    host = elems = null
  }

  function contains(event) {
    return host != null && event.composedPath().includes(host)
  }

  //Switches from centered to explicit left/top on the first drag, then follows the pointer
  function makeDraggable(grip) {
    grip.addEventListener("pointerdown", function(event) {
      event.preventDefault()
      var rect = host.getBoundingClientRect()
      var dx = event.clientX - rect.left
      var dy = event.clientY - rect.top
      host.style.setProperty("transform", "none", "important")
      host.style.setProperty("bottom", "auto", "important")
      grip.setPointerCapture(event.pointerId)
      function move(e) {
        var left = Math.min(Math.max(0, e.clientX - dx), window.innerWidth - rect.width)
        var top = Math.min(Math.max(0, e.clientY - dy), window.innerHeight - rect.height)
        host.style.setProperty("left", left + "px", "important")
        host.style.setProperty("top", top + "px", "important")
      }
      move(event)
      grip.addEventListener("pointermove", move)
      grip.addEventListener("pointerup", function() {grip.removeEventListener("pointermove", move)}, {once: true})
    })
  }

  return {
    show: show,
    update: update,
    hide: hide,
    contains: contains,
  }
})();
