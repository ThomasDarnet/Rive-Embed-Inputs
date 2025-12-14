<?php
/**
 * Plugin Name: TheFunction Rive Player
 * Description: Embed Rive animations via shortcode with input mapping for pointer, focus, audio, and custom events.
 * Version: 0.1.0
 * Author: TheFunction
 * Text Domain: thefunction-rive
 */

if (!defined('ABSPATH')) {
    exit;
}

class TheFunction_Rive_Plugin
{
    const VERSION = '0.1.0';

    /** @var array<int, array<string, mixed>> */
    private static $instances = [];

    /** @var bool */
    private static $shortcode_used = false;

    public static function init(): void
    {
        add_action('init', [self::class, 'register_shortcode']);
        add_action('wp_enqueue_scripts', [self::class, 'register_assets']);
        add_action('wp_footer', [self::class, 'output_instance_data'], 5);
    }

    public static function register_shortcode(): void
    {
        add_shortcode('rive_player', [self::class, 'render_shortcode']);
    }

    public static function register_assets(): void
    {
        $base_url = plugin_dir_url(__FILE__);

        wp_register_style(
            'thefunction-rive-style',
            $base_url . 'assets/rive-player.css',
            [],
            self::VERSION
        );

        wp_register_script(
            'thefunction-rive-runtime',
            'https://unpkg.com/@rive-app/canvas@2.19.4/rive.js',
            [],
            '2.19.4',
            true
        );

        wp_register_script(
            'thefunction-rive-player',
            $base_url . 'assets/rive-player.js',
            ['thefunction-rive-runtime'],
            self::VERSION,
            true
        );
    }

    /**
     * @param array<string, string> $attributes
     * @return string
     */
    public static function render_shortcode(array $attributes): string
    {
        self::$shortcode_used = true;

        $defaults = [
            'src' => '',
            'width' => '100%',
            'height' => '100%',
            'fit' => 'contain',
            'alignment' => 'center',
            'autoplay' => 'true',
            'artboard' => '',
            'statemachine' => '',
            'animations' => '',
            'inputs' => '',
            'pointer' => 'true',
            'pointerscope' => 'window',
            'audio' => 'off',
            'audioelementid' => '',
            'debug' => 'false',
            'fallback' => __('Unable to load animation.', 'thefunction-rive'),
        ];

        $atts = shortcode_atts($defaults, $attributes, 'rive_player');

        $src = esc_url_raw($atts['src']);
        if (empty($src)) {
            return '';
        }

        $id = uniqid('tfrive-', true);
        $container_id = $id . '-container';
        $canvas_id = $id . '-canvas';

        $animations = self::parse_animations($atts['animations']);
        $inputs_map = self::parse_inputs($atts['inputs']);

        $state_machine = sanitize_text_field($atts['statemachine']);
        if (!empty($attributes['stateMachine'])) {
            $state_machine = sanitize_text_field($attributes['stateMachine']);
        }

        $pointer_scope = self::sanitize_choice($atts['pointerscope'], ['window', 'canvas', 'container']);
        if (!empty($attributes['pointerScope'])) {
            $pointer_scope = self::sanitize_choice((string) $attributes['pointerScope'], ['window', 'canvas', 'container']);
        }

        $audio_element_id = sanitize_text_field($atts['audioelementid']);
        if (!empty($attributes['audioElementId'])) {
            $audio_element_id = sanitize_text_field($attributes['audioElementId']);
        }

        $instance = [
            'id' => $id,
            'containerId' => $container_id,
            'canvasId' => $canvas_id,
            'src' => $src,
            'width' => sanitize_text_field($atts['width']),
            'height' => sanitize_text_field($atts['height']),
            'fit' => self::sanitize_choice($atts['fit'], ['contain', 'cover', 'fill', 'fitWidth', 'fitHeight', 'none']),
            'alignment' => self::sanitize_choice($atts['alignment'], ['center', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight']),
            'autoplay' => self::string_to_bool($atts['autoplay']),
            'artboard' => sanitize_text_field($atts['artboard']),
            'stateMachine' => $state_machine,
            'animations' => $animations,
            'inputs' => $inputs_map,
            'pointer' => self::string_to_bool($atts['pointer']),
            'pointerScope' => $pointer_scope,
            'audioMode' => self::sanitize_choice($atts['audio'], ['off', 'mic', 'element']),
            'audioElementId' => $audio_element_id,
            'debug' => self::string_to_bool($atts['debug']),
        ];

        self::$instances[] = $instance;

        wp_enqueue_style('thefunction-rive-style');
        wp_enqueue_script('thefunction-rive-runtime');
        wp_enqueue_script('thefunction-rive-player');

        $styles = sprintf(
            'style="width:%s; height:%s;"',
            esc_attr($instance['width']),
            esc_attr($instance['height'])
        );

        $fallback = wp_kses_post($atts['fallback']);

        return sprintf(
            '<div class="thefunction-rive-wrapper" id="%1$s" %2$s>' .
            '<canvas id="%3$s" class="thefunction-rive-canvas" role="img" aria-label="Rive animation"></canvas>' .
            '<div class="thefunction-rive-fallback" aria-live="polite">%4$s</div>' .
            '</div>',
            esc_attr($container_id),
            $styles,
            esc_attr($canvas_id),
            $fallback
        );
    }

    public static function output_instance_data(): void
    {
        if (!self::$shortcode_used || empty(self::$instances)) {
            return;
        }

        $json = wp_json_encode(array_values(self::$instances));
        if (!$json) {
            return;
        }

        echo '<script type="text/javascript">';
        echo 'window.thefunctionRiveConfigs = ' . $json . ';';
        echo '</script>';
    }

    /**
     * @param string $value
     * @return array<int, string>
     */
    private static function parse_animations(string $value): array
    {
        $parts = array_filter(array_map('trim', explode(',', $value)));
        return array_values($parts);
    }

    /**
     * @param string $value
     * @return array<string, mixed>
     */
    private static function parse_inputs(string $value): array
    {
        $value = trim($value);
        if ($value === '') {
            return [];
        }

        $decoded = json_decode(stripslashes($value), true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            return $decoded;
        }

        // Semi-colon fallback format: key:value;key2:value2
        $pairs = array_filter(array_map('trim', explode(';', $value)));
        $result = [];
        foreach ($pairs as $pair) {
            $bits = array_map('trim', explode(':', $pair));
            if (count($bits) === 2) {
                $result[$bits[0]] = $bits[1];
            }
        }

        return $result;
    }

    /**
     * @param string $value
     * @param array<int, string> $allowed
     * @return string
     */
    private static function sanitize_choice(string $value, array $allowed): string
    {
        $value = sanitize_text_field($value);
        return in_array($value, $allowed, true) ? $value : $allowed[0];
    }

    private static function string_to_bool(string $value): bool
    {
        return filter_var($value, FILTER_VALIDATE_BOOLEAN);
    }
}

TheFunction_Rive_Plugin::init();
