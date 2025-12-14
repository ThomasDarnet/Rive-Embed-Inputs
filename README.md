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
- `artboard`: Artboard name.
- `stateMachine`: State machine name.
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
