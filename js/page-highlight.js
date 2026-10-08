
//Highlights the text being read directly on the page, for selected-text playback.
//The speech engine re-chunks and rewrites the text (word replacements, URLs, punctuation),
//so chunks are located by matching letters and digits only against the selection's text nodes.
//With voices that report word events, the current sentence and word are highlighted;
//otherwise the whole chunk is. The whole selection stays tinted so you can see what's left to read.

var pageHighlighter = (function() {
  var selectionHighlight = "read-aloud-selection"
  var contextHighlight = "read-aloud-context"
  var wordHighlight = "read-aloud-word"
  //fast enough to follow words at normal speaking rates
  var pollInterval = 100
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
      positionKey: null,
      timer: setInterval(poll, pollInterval),
    }
    var selection = new Highlight(range)
    selection.priority = -1
    CSS.highlights.set(selectionHighlight, selection)
    window.getSelection().removeAllRanges()
  }

  function stop() {
    if (!session) return
    clearInterval(session.timer)
    session = null
    CSS.highlights.delete(selectionHighlight)
    CSS.highlights.delete(contextHighlight)
    CSS.highlights.delete(wordHighlight)
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
      current.positionKey = null
    }

    var position = speech.position
    var positionKey = JSON.stringify(position)
    if (positionKey != current.positionKey) {
      current.positionKey = positionKey
      paint(current.index, current.spans[position.index], speech.texts[position.index], position)
    }
  }

  function paint(index, span, text, position) {
    var context = span && (position.sentence ? locate(index, span, text, position.sentence) : span)
    var word = span && position.word ? locateWord(index, span, text, position.word) : null
    setHighlight(contextHighlight, index, context, 0)
    setHighlight(wordHighlight, index, word, 1)
    if (word || context) scrollIntoViewIfNeeded(makeRange(index, word || context))
  }

  function setHighlight(name, index, span, priority) {
    if (!span) {
      CSS.highlights.delete(name)
      return
    }
    var highlight = new Highlight(makeRange(index, span))
    highlight.priority = priority
    CSS.highlights.set(name, highlight)
  }

  function makeRange(index, span) {
    var range = document.createRange()
    var first = index.map[span.start]
    var last = index.map[span.end-1]
    range.setStart(first.node, first.offset)
    range.setEnd(last.node, last.offset+1)
    return range
  }

  //Maps a character range of the chunk's text onto the page by counting letters and digits before it
  function locate(index, span, text, section) {
    var length = normalize(text.slice(section.startIndex, section.endIndex)).length
    var start = span.start + normalize(text.slice(0, section.startIndex)).length
    var end = Math.min(start + length, span.end)
    return start < end ? {start: start, end: end} : null
  }

  //A rewritten word earlier in the chunk shifts the count, so look for the word itself near where it should be
  function locateWord(index, span, text, word) {
    var key = normalize(text.slice(word.startIndex, word.endIndex))
    if (!key) return null
    var expected = span.start + normalize(text.slice(0, word.startIndex)).length
    var hay = index.text
    if (hay.substr(expected, key.length) == key) return {start: expected, end: expected + key.length}
    var after = hay.indexOf(key, expected)
    var before = hay.lastIndexOf(key, expected)
    var candidates = [after, before].filter(function(pos) {
      return pos >= span.start && pos + key.length <= span.end && Math.abs(pos - expected) <= probeLength
    })
    if (!candidates.length) return null
    var pos = candidates.sort(function(a, b) {return Math.abs(a - expected) - Math.abs(b - expected)})[0]
    return {start: pos, end: pos + key.length}
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
    sheet.replaceSync(
      "::highlight(" + selectionHighlight + ") { background-color: rgba(66, 133, 244, 0.14); }\n" +
      "::highlight(" + contextHighlight + ") { background-color: #fff3bf; color: #000; }\n" +
      "::highlight(" + wordHighlight + ") { background-color: #ffc933; color: #000; }"
    )
    document.adoptedStyleSheets = document.adoptedStyleSheets.concat(sheet)
  }

  return {
    start: start,
    stop: stop,
  }
})();
