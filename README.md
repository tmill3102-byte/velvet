# Velvet

A private, encrypted photo & video gallery that runs entirely in your browser.

**Open it:** https://tmill3102-byte.github.io/velvet/

- **iPhone:** open the link in Safari → Share → **Add to Home Screen**, then open Velvet from the Home Screen.
- **Windows:** download `Velvet-Setup.exe` from [Releases](https://github.com/tmill3102-byte/velvet/releases/latest). It's unsigned, so if SmartScreen appears click **More info → Run anyway**.

Your photos and videos never leave your device. They're encrypted (AES-256-GCM) with your passcode and stored locally. This site only serves the app code. **If you forget your passcode, your data cannot be recovered.** Export a backup from Profile now and then.

**On-device AI (v1.1, optional):** smart search ("sunset on the beach"), auto-tags and a duplicate finder, all running on your device with Apple MobileCLIP-S0 (≈93 MB, downloaded once from this site and cached for offline use). No photo, tag or query is ever uploaded. Turn it on in Profile → On-device AI. Licenses: `models/Xenova/mobileclip_s0/LICENSE`, `js/vendor/transformers/`.

**New in v1.2:** smart albums (places, themes and moments from capture dates), a best-shot picker for bursts and look-alikes (keeps the best and archives the rest, with restore from Profile → Archive), and smart rules ("items tagged X / looking like Y → Vault or a collection"). All on-device and encrypted.

**New in v1.3:** video chapters (on-device scene detection, chapter marks with thumbnails on the scrubber, tap to jump, AI chapter names) and highlight reels (the best moments of a video, collection or selection played as one seamless reel, with optional save as a new silent, encrypted video where the browser supports recording).

**New in v1.4:** People. Velvet can find faces in your photos and video frames and group them into people. You can name them, merge or split groups, mark "not this person", hide someone, search by name, and add smart rules ("person X → Vault or a collection"). It's opt-in under Profile → On-device AI → People. It uses OpenCV Zoo's YuNet (MIT) and SFace (Apache-2.0) models: ≈39 MB, downloaded once from this site. All face data and names are encrypted on your device and never uploaded.
