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

**v1.4.1:** fixes video previews in Safari on iPhone:
- keyframe decoding when Safari blocks video playback;
- one tap-unlocked video element;
- faster app updates;
- **Preview diagnostics** with *Copy report*;
- warnings for Private Browsing, Block All Cookies and Lockdown Mode;
- better People avatars;
- *Save as collection* now hides the auto album, and any auto album can be hidden or restored;
- age-related auto-tags are removed.

**New in v1.5:** a new iOS-style design that's easier to use:
- frosted tab bar with Search, large titles that shrink as you scroll, and a **+** button to import;
- Photos-style square grid: pinch or use **View** to zoom, **Select** for a toolbar with Favorite, Add to, Vault and Delete;
- press and hold (or right-click) any item for a quick menu with a preview;
- bottom sheets you can swipe down, swipe from the left edge to go back, pull down to refresh;
- **Undo** after deleting, archiving, moving to the Vault or removing from a collection;
- a simpler player: tap to show or hide controls, swipe down to close; chapters and highlights are still there;
- grouped Settings in Profile, a 3-card tour, clearer empty screens, and a text size setting;
- respects Reduce Motion and Reduce Transparency; sidebar layout on desktop;
- fixes a freeze in WebKit (Safari's engine) when locking or unlocking a large grid.

**New in v1.6:**
- **custom AI tags**: name a tag, describe it, show a few example photos ("like this" / "not this"), and the on-device AI applies it. Each tag gets its own auto album, works in Search and rules, and learns from "Is this …?" answers. Built-in tags can be renamed, hidden or merged;
- **no more doubles**: files already in Velvet (including the Vault and the Archive) are recognised by content and skipped on import;
- **folder sync** in the Windows app: *Check for new files* on a folder collection, optionally each time Velvet opens. Velvet only reads the folder, never changes it.

**New in v1.7:** three optional on-device add-ons. Each one is downloaded from this site only the first time you use it, then cached for offline use. The Windows app already includes them.
- **Video tools** (≈7 MB): convert HEVC/MOV to H.264 MP4, compress (Small, Medium or High, with an estimated size), and trim with start and end handles. The result is saved as a new encrypted copy. Uses FFmpeg 5.1 (LGPL-2.1 build, no GPL parts) and OpenH264 (BSD), see `addons/ffmpeg/`.
- **Speech search** (≈68 MB, or ≈44 MB if On-device AI is already on): find videos by what's said, jump straight to that moment, and show subtitles (CC) in the player. Uses Whisper tiny (Apache-2.0), see `addons/whisper/`.
- **Text in photos** (≈7 MB): find photos and screenshots by the text in them. Details shows "Text found" with *Copy text*. Uses Tesseract (Apache-2.0), see `addons/ocr/`.

Turn them on in Profile → On-device AI. Transcripts and found text are stored encrypted and included in backups. Nothing is ever uploaded.

**New in v1.8:** three more optional on-device add-ons, downloaded from this site only when you first use them (the Windows app already includes them):
- **Photo upscaler** (≈32 MB, or ≈5 MB if another AI add-on is already downloaded): make a photo 2× or 4× larger and sharper, with a before/after compare slider. Runs in tiles so memory stays bounded, with a lower size cap on iPhone. Uses Real-ESRGAN (realesr-general-x4v3, BSD-3-Clause), see `addons/upscale/`.
- **Background remover** (≈74 MB, or ≈47 MB if another AI add-on is already downloaded): cut out the subject as a transparent PNG, or put it on a solid colour or a blurred version of its background. Uses IS-Net (DIS, Apache-2.0), see `addons/bgremove/`. (@imgly/background-removal is AGPL-3.0, so it isn't used.)
- **Search descriptions** (≈245 MB, or ≈218 MB if another AI add-on is already downloaded): writes a short description of each photo and video so Search finds "red bicycle" or "cup on a table". Descriptions show in Details and can be edited. Uses Microsoft Florence-2-base (MIT), see `addons/caption/`. Age-related words are removed from descriptions, and descriptions never create tags or albums.

Results are always saved as new encrypted copies; originals are never changed. Uses WebGPU when the device has it, otherwise WebAssembly. Nothing is uploaded.

**New in v1.8.1:** videos start playing almost immediately. Velvet used to decrypt a whole video before it could play, which took several seconds for a large file. Now the player gets a private address inside the app that answers the usual "give me bytes X to Y" requests, and Velvet decrypts only the 1 MB pieces it actually asks for. Seeking jumps straight to the right place. Your key never leaves the page: the service worker (or the Windows app's main process) only passes along the decrypted pieces the player requested, and nothing is cached or written to disk. Locking Velvet stops playback and closes these addresses immediately. If streaming isn't available (for example in a private window), Velvet falls back automatically to the old way. Offline cache: service worker velvet-v13.

**New in v1.8.2:** full-screen photos, like the iPhone Photos app. Tap a photo to fade away every bar and button, leaving just the photo edge to edge on black; tap again to bring them back. Swipe left/right still moves between photos, swipe down still closes, and you can now pinch or double-tap to zoom (double-click or the mouse wheel on a computer) and drag to look around while zoomed. The new expand button at the top of the viewer (or the F key) also makes the window itself full screen on computers and in the Windows app; Esc or the button again leaves. iPhone Safari can't make a single picture full screen, so there Velvet uses the hide-everything mode, which in the Home Screen app fills the whole screen. There's also a **Slideshow** in the ••• menu: full screen, a few seconds per photo, tap to stop. Offline cache: service worker velvet-v14.
