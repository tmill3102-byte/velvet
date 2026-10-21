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
