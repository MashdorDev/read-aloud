try {
  importScripts(
    "js/rxjs.umd.min.js",
    "js/defaults.js",
    "js/messaging.js",
    "js/background-speech.js",
    "js/content-handlers.js",
    "js/events.js"
  )
}
catch (err) {
  console.error(err)
}
