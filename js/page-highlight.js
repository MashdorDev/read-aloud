
//Highlights the text being read directly on the page, for selected-text playback.
//The speech engine re-chunks and rewrites the text (word replacements, URLs, punctuation),
//so chunks are located by matching letters and digits only against the selection's text nodes.

var pageHighlighter = (function() {
  var highlightName = "read-aloud-active"
  var pollInterval = 250
  var startupTimeout = 15*1000
  var probeLength = 24
  var session = null

  function isSupported() {
    return typeof CSS != "undefined" && CSS.highlights && typeof Highlight == "function"
  }

  function start(range) {
    stop()
    if (!isSupported() || !range || range.collapsed) return
    var index = buildIndex(range)
    if (!index.text) return
    installStyle()
    session = {
      index: index,
      startTime: Date.now(),
      seen: false,
      textsKey: null,
      spans: null,
      activeIndex: null,
      timer: setInterval(poll, pollInterval),
    }
    window.getSelection().removeAllRanges()
  }

  function stop() {
    if (!session) return
    clearInterval(session.timer)
    session = null
    CSS.highlights.delete(highlightName)
  }

  async function poll() {
    var current = session
    var result = await brapi.runtime.sendMessage({dest: "player", method: "getSpeechInfo"})
      .catch(function() {return null})
    if (current != session) return

    var speech = result && !result.error && result.state != "STOPPED" ? result.speechInfo : null
    if (!speech) {
      if (current.seen || Date.now()-current.startTime > startupTimeout) stop()
      return
    }

    var textsKey = speech.texts.join("\n")
    if (textsKey != current.textsKey) {
      current.textsKey = textsKey
      current.spans = alignChunks(current.index, speech.texts)
      if (!current.spans.some(Boolean)) {
        //the player is reading something other than this selection
        if (current.seen || Date.now()-current.startTime > startupTimeout) stop()
        return
      }
      current.seen = true
      current.activeIndex = null
    }

    var activeIndex = speech.position.index
    if (activeIndex != current.activeIndex) {
      current.activeIndex = activeIndex
      paint(current.index, current.spans[activeIndex])
    }
  }

  function paint(index, span) {
    if (!span) {
      CSS.highlights.delete(highlightName)
      return
    }
    var range = document.createRange()
    var first = index.map[span.start]
    var last = index.map[span.end-1]
    range.setStart(first.node, first.offset)
    range.setEnd(last.node, last.offset+1)
    CSS.highlights.set(highlightName, new Highlight(range))
    scrollIntoViewIfNeeded(range)
  }

  function scrollIntoViewIfNeeded(range) {
    var rect = range.getBoundingClientRect()
    var margin = 80
    if (rect.top < margin || rect.bottom > window.innerHeight - margin) {
      var elem = range.startContainer.parentElement
      if (elem) elem.scrollIntoView({block: "center", behavior: "smooth"})
    }
  }

  //Collects the selection's letters and digits, each mapped back to its text node and offset
  function buildIndex(range) {
    var chars = []
    var map = []
    var root = range.commonAncestorContainer
    var walker = document.createTreeWalker(root.nodeType == Node.TEXT_NODE ? root.parentNode : root, NodeFilter.SHOW_TEXT, {
      acceptNode: function(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT
        if (node.parentElement && node.parentElement.closest("script, style, noscript, template")) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
    })
    var node
    while (node = walker.nextNode()) {
      var start = node == range.startContainer ? range.startOffset : 0
      var end = node == range.endContainer ? range.endOffset : node.data.length
      for (var i=start; i<end; i++) {
        var c = normalizeChar(node.data[i])
        if (c) {
          chars.push(c)
          map.push({node: node, offset: i})
        }
      }
    }
    return {text: chars.join(""), map: map}
  }

  function normalizeChar(c) {
    if (!/[\p{L}\p{N}]/u.test(c)) return ""
    var lower = c.toLowerCase()
    return lower.length == 1 ? lower : c
  }

  function normalize(text) {
    var out = ""
    for (var c of text) {
      var n = normalizeChar(c)
      if (n.length == 1) out += n
    }
    return out
  }

  //Finds each chunk's span in the page text, scanning forward since chunks are in reading order
  function alignChunks(index, texts) {
    var hay = index.text
    var cursor = 0
    return texts.map(function(text) {
      var key = normalize(text)
      if (!key) return null
      var start = findStart(hay, key, cursor)
      if (start < 0) return null
      var end = findEnd(hay, key, start)
      cursor = end
      return {start: start, end: end}
    })
  }

  //Shorter tails survive a rewritten last word. Searching back from the limit picks the last repeat
  //inside the chunk, and the limit keeps it from reaching into the next chunk.
  function findEnd(hay, key, start) {
    var limit = start + key.length + probeLength
    for (var length of [probeLength, probeLength/2, probeLength/4]) {
      var tail = key.slice(-length)
      var pos = hay.lastIndexOf(tail, limit - tail.length)
      if (pos >= start) return pos + tail.length
    }
    return Math.min(start + key.length, hay.length)
  }

  //Tries probes at a few points in the chunk, so a rewritten word near the start doesn't lose the whole chunk.
  //Chunks are read back to back, so a start found close to the previous chunk's end snaps to it.
  function findStart(hay, key, cursor) {
    var offsets = [0, Math.floor(key.length/3), Math.floor(key.length*2/3)]
    for (var offset of offsets) {
      var probe = key.slice(offset, offset + probeLength)
      if (!probe) continue
      var pos = hay.indexOf(probe, cursor)
      if (pos < 0) continue
      if (offset == 0) return pos
      return pos - offset - cursor <= probeLength ? cursor : pos - offset
    }
    return -1
  }

  function installStyle() {
    if (installStyle.done) return
    installStyle.done = true
    var sheet = new CSSStyleSheet()
    sheet.replaceSync("::highlight(" + highlightName + ") { background-color: #ffe066; color: #000; }")
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet)
  }

  return {
    start: start,
    stop: stop,
  }
})();
