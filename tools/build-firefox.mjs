//Builds build/firefox from the Chrome sources: Firefox MV3 runs background scripts as an event page
//instead of a service worker, and rejects the Chrome-only manifest keys.
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const out = path.join(root, "build", "firefox")
const include = ["_locales", "css", "img", "js", "sound", "background.js", "manifest.json"]

fs.rmSync(out, {recursive: true, force: true})
for (const entry of fs.readdirSync(root)) {
  if (include.includes(entry) || entry.endsWith(".html")) {
    fs.cpSync(path.join(root, entry), path.join(out, entry), {recursive: true, filter: src => !src.endsWith(".map")})
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"))
const background = fs.readFileSync(path.join(root, "background.js"), "utf8")
manifest.background = {scripts: [...background.matchAll(/"(js\/[^"]+\.js)"/g)].map(m => m[1])}
manifest.browser_specific_settings = {gecko: {id: "read-aloud-highlight@dorzairi.dev", strict_min_version: "140.0"}}
manifest.permissions = manifest.permissions.filter(p => !["offscreen", "tts", "ttsEngine"].includes(p))
delete manifest.key
delete manifest.oauth2
delete manifest.minimum_chrome_version
delete manifest.cross_origin_opener_policy
delete manifest.cross_origin_embedder_policy
for (const resource of manifest.web_accessible_resources) delete resource.use_dynamic_url
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2))

console.log("Built", out)
