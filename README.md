# TheFunction Rive Player (WordPress plugin)

A lightweight WordPress plugin that embeds Rive `.riv` animations via `[rive_player]` and bridges common inputs (pointer, focus, audio, custom events) to a Rive State Machine. Designed for fast deployment on production sites without extra admin UI.

## Installation
1. Copy the `thefunction-rive` directory into your WordPress `wp-content/plugins/` folder.
2. Activate **TheFunction Rive Player** from the WordPress Plugins screen.
3. Upload your `.riv` asset to the Media Library (see MIME notes below) or host it alongside the plugin files.
4. Add the `[rive_player]` shortcode to any post, page, or template where you want the animation to appear.

## Shortcode usage
Basic embed with responsive dimensions:
```text
[rive_player src="https://example.com/path/to/animation.riv" width="100%" height="480px"]
```

Common attributes (all optional unless noted):
- `src` (**required**): URL to the `.riv` file.
- `width` / `height`: CSS sizes (e.g., `400px`, `100%`). Default `100%` each.
- `fit`: `contain|cover|fill|fitWidth|fitHeight|none` (maps to `rive.Fit`).
- `alignment`: `center|topLeft|topRight|bottomLeft|bottomRight`.
- `autoplay`: `true|false` (default `true`).
- `artboard`: Artboard name (default `Skull`).
- `stateMachine`: State machine name (default `State Machine 1`).
- `animations`: Comma list of animation names when no state machine is used.
- `pointer`: Enable pointer mapping (`true|false`, default `true`).
- `pointerScope`: `window|canvas|container` (default `window`).
- `audio`: `off|mic|element` to enable audio analysis (default `off`).
- `audioElementId`: DOM id of an existing `<audio>`/`<video>` element if `audio=element`.
- `inputs`: JSON mapping for inputs (recommended).
- `debug`: `true|false` to log diagnostics.
- `fallback`: Message or HTML shown if Rive fails to load.

### Input mapping JSON
Use the `inputs` attribute to describe how browser events map to Rive inputs. Example:
```text
[rive_player
  src="https://example.com/hero.riv"
  statemachine="MainState"
  inputs='{
    "pointer": {"x": "mx", "y": "my", "normalize": "artboard"},
    "flags": {"thinking": "isThinking", "focus": "isFocused"},
    "audio": {"level": "audio_level", "threshold": 0.1, "talking": "is_talking"},
    "triggers": {"click": "fire"}
  }'
]
```

Mapping behaviors:
- **Pointer**: pointer/touch move -> numeric inputs (`normalize` supports `artboard` [-1..1], `pixels`, or `0to1`).
- **Flags**: `thinking` responds to `window.dispatchEvent(new CustomEvent('rive:thinking', {detail: {id, value: true}}))`; `focus`/`blur` follow window focus.
- **Audio**: when `audio` is enabled, RMS level drives `level`; boolean `talking` toggles above `threshold`.
- **Triggers**: `click` fires a trigger input on click/tap.

When `debug="true"`, the console logs:
- the `.riv` URL, artboard, and chosen state machine / animations,
- the detected inputs and their types,
- warnings if a state machine is missing or has no inputs (the plugin will fall back to animations when provided),
- any audio connection issues.

### Additional examples
- Minimal autoplay:
  ```text
  [rive_player src="/wp-content/uploads/anim.riv"]
  ```
- Use a specific artboard and animation fallback:
  ```text
  [rive_player src="/media/hero.riv" artboard="Hero" animations="Idle,Loop"]
  ```
- Pointer limited to canvas with debug logging:
  ```text
  [rive_player src="/media/hero.riv" pointerScope="canvas" debug="true"]
  ```
- Audio from an existing element:
  ```text
  <audio id="bgm" src="/media/track.mp3" autoplay loop></audio>
  [rive_player src="/media/hero.riv" audio="element" audioElementId="bgm" inputs='{"audio":{"level":"audio_level"}}']
  ```

## Troubleshooting
- **Nothing renders**: confirm the `src` URL is correct and publicly accessible. Check browser console for network errors.
- **Inputs not responding**: verify `stateMachine` matches the file, and the mapped input names (e.g., `mx`, `my`) exist in the state machine.
- **State machine missing**: if the configured state machine is not found, the plugin logs a warning (when `debug=true`) and falls back to listed `animations` when possible. Provide at least one valid animation name or update the state machine name.
- **Audio denied**: microphones require a user gesture; click/tap the canvas to activate if prompted. If permission is denied, the animation continues without audio.
- **Fallback visible**: the plugin shows the fallback message if Rive cannot load within ~8 seconds. Inspect the console for details when `debug=true`.

## MIME type for `.riv` uploads
WordPress may block `.riv` uploads. Add this snippet to `functions.php` or a site plugin to allow the MIME type:
```php
add_filter('upload_mimes', function ($types) {
    $types['riv'] = 'application/octet-stream';
    return $types;
});
```

## Development notes
- Assets are loaded only on pages where the shortcode appears.
- Multiple `[rive_player]` instances on the same page are supported; each keeps isolated configuration.
- The frontend uses the official Rive runtime from the CDN and vanilla JS (no build step required).

## GitHub push & conflict resolution
If your branch conflicts with GitHub and you need to push from this environment:
1. Add the remote if it is missing: `git remote add origin <URL_DU_DEPOT>`.
2. Fetch the latest changes: `git fetch origin`.
3. Rebase or merge the target branch (e.g., `main`) to resolve conflicts locally:
   - Rebase: `git rebase origin/main`
   - Merge: `git merge origin/main`
4. Fix any merge conflicts in the files, then continue the rebase (`git rebase --continue`) or commit the merge.
5. Push with upstream tracking if first push: `git push -u origin work` (replace `work` with your branch name).
6. If the remote was updated after your rebase/merge, repeat fetch/rebase before pushing again.

This repository currently has no `origin` remote configured; set it to your GitHub URL before pushing.
