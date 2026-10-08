
//Speaks on behalf of BackgroundSpeechEngine (Firefox): the player tab is never brought to the
//foreground, and Firefox stalls speech in such tabs, but the background page can speak.
//Chrome's service worker has no speechSynthesis, so this does nothing there.

if (typeof speechSynthesis != "undefined") {
  let utter = null

  registerMessageListener("backgroundSpeech", {
    async speak(id, text, options) {
      stopCurrent()
      const voices = await getSpeechVoices()
      utter = new SpeechSynthesisUtterance(text)
      utter.voice = voices.find(voice => voice.name == options.voiceName) || null
      if (options.lang) utter.lang = options.lang
      if (options.rate) utter.rate = options.rate
      if (options.pitch) utter.pitch = options.pitch
      if (options.volume) utter.volume = options.volume
      const send = event => brapi.runtime.sendMessage({dest: "backgroundSpeechClient", method: "onSpeechEvent", args: [id, event]})
        .catch(console.error)
      utter.onstart = () => send({type: "start", charIndex: 0})
      utter.onend = () => send({type: "end", charIndex: text.length})
      utter.onboundary = event => {
        if (event.name == "word") send({type: "word", charIndex: event.charIndex, length: event.charLength})
      }
      utter.onerror = event => {
        if (event.error != "canceled" && event.error != "interrupted") send({type: "error", error: {message: event.error}})
      }
      speechSynthesis.speak(utter)
    },
    stop: stopCurrent,
    pause: () => speechSynthesis.pause(),
    resume: () => speechSynthesis.resume(),
    isSpeaking: () => speechSynthesis.speaking,
    //called by the player while it reads, so the event page isn't unloaded during a long pause
    keepAlive: () => true,
  })

  function stopCurrent() {
    if (utter) utter.onstart = utter.onend = utter.onboundary = utter.onerror = null
    utter = null
    speechSynthesis.cancel()
  }

  function getSpeechVoices() {
    const voices = speechSynthesis.getVoices()
    if (voices.length) return Promise.resolve(voices)
    return promiseTimeout(1500, "Timeout WebSpeech getVoices", new Promise(fulfill => {
      speechSynthesis.addEventListener("voiceschanged", () => fulfill(speechSynthesis.getVoices()), {once: true})
    }))
  }
}
