
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

  //built with DOM calls rather than innerHTML, which pages enforcing Trusted Types would block
  function icon(name) {
    var svgNs = "http://www.w3.org/2000/svg"
    var svg = document.createElementNS(svgNs, "svg")
    svg.setAttribute("viewBox", "0 0 24 24")
    svg.setAttribute("aria-hidden", "true")
    var path = document.createElementNS(svgNs, "path")
    path.setAttribute("d", icons[name])
    svg.appendChild(path)
    return svg
  }

  function button(className, label, iconName) {
    var elem = document.createElement("button")
    elem.className = className
    elem.title = label
    elem.setAttribute("aria-label", label)
    elem.appendChild(icon(iconName))
    return elem
  }

  function show(onCommand) {
    hide()
    host = document.createElement("div")
    var hostStyle = {position: "fixed", left: "50%", bottom: "24px", transform: "translateX(-50%)", "z-index": "2147483647", margin: "0", padding: "0", border: "0", background: "none"}
    for (var name in hostStyle) host.style.setProperty(name, hostStyle[name], "important")
    var root = host.attachShadow({mode: "open"})
    var style = document.createElement("style")
    style.textContent = css
    var bar = document.createElement("div")
    bar.className = "bar"
    bar.setAttribute("role", "toolbar")
    bar.setAttribute("aria-label", "Read Aloud")
    var grip = button("grip", "Drag to move", "grip")
    grip.tabIndex = -1
    grip.setAttribute("aria-hidden", "true")
    var rewind = button("rewind", "Previous sentence", "rewind")
    var toggle = button("toggle", "Pause", "pause")
    var forward = button("forward", "Next sentence", "forward")
    var rate = document.createElement("select")
    rate.className = "rate"
    rate.title = "Speed"
    rate.setAttribute("aria-label", "Speed")
    rates.forEach(function(value) {rate.appendChild(rateOption(value))})
    var stop = button("stop", "Stop", "stop")
    bar.append(grip, rewind, toggle, forward, rate, stop)
    root.append(style, bar)
    elems = {root: root, bar: bar, toggle: toggle, rate: rate, state: null}
    rewind.addEventListener("click", function() {onCommand("rewind")})
    forward.addEventListener("click", function() {onCommand("forward")})
    stop.addEventListener("click", function() {onCommand("stop")})
    toggle.addEventListener("click", function() {onCommand("toggle")})
    rate.addEventListener("change", function() {onCommand("rate", Number(rate.value))})
    makeDraggable(grip)
    document.documentElement.appendChild(host)
  }

  function rateOption(value) {
    var option = document.createElement("option")
    option.value = value
    option.textContent = value + "x"
    return option
  }

  function update(state, rate) {
    if (!elems) return
    if (state != elems.state) {
      elems.state = state
      var paused = state == "PAUSED"
      elems.toggle.replaceChildren(icon(paused ? "play" : "pause"))
      elems.toggle.title = paused ? "Play" : "Pause"
      elems.toggle.setAttribute("aria-label", elems.toggle.title)
      elems.bar.classList.toggle("loading", state == "LOADING")
    }
    if (rate != null && elems.root.activeElement != elems.rate) {
      if (!rates.includes(rate)) elems.rate.appendChild(rateOption(rate))
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
