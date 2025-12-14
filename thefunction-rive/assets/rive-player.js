(function () {
  'use strict';

  const globalConfigs = Array.isArray(window.thefunctionRiveConfigs)
    ? window.thefunctionRiveConfigs
    : [];

  if (!globalConfigs.length) {
    return;
  }

  const FitMap = {
    contain: rive.Fit.contain,
    cover: rive.Fit.cover,
    fill: rive.Fit.fill,
    fitWidth: rive.Fit.fitWidth,
    fitHeight: rive.Fit.fitHeight,
    none: rive.Fit.none,
  };

  const AlignmentMap = {
    center: rive.Alignment.center,
    topLeft: rive.Alignment.topLeft,
    topRight: rive.Alignment.topRight,
    bottomLeft: rive.Alignment.bottomLeft,
    bottomRight: rive.Alignment.bottomRight,
  };

  function logDebug(debug, ...args) {
    if (debug) {
      // eslint-disable-next-line no-console
      console.log('[Rive]', ...args);
    }
  }

  class AudioBridge {
    constructor(config, setLevel, setTalking, debug) {
      this.config = config || {};
      this.debug = debug;
      this.setLevel = setLevel;
      this.setTalking = setTalking;
      this.audioContext = null;
      this.source = null;
      this.analyser = null;
      this.dataArray = null;
      this.active = false;
      this.connected = false;
    }

    enableOnGesture(node) {
      if (this.connected || this.config.source === 'off') {
        return;
      }

      const start = () => {
        node.removeEventListener('click', start);
        node.removeEventListener('pointerdown', start);
        this.init();
      };

      node.addEventListener('click', start, { once: true });
      node.addEventListener('pointerdown', start, { once: true });
    }

    async init() {
      if (this.connected || this.config.source === 'off') {
        return;
      }

      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (error) {
        logDebug(this.debug, 'AudioContext unavailable', error);
        return;
      }

      if (this.config.source === 'mic') {
        await this.attachMicrophone();
      } else if (this.config.source === 'element') {
        await this.attachElement();
      }

      if (this.analyser) {
        this.connected = true;
        this.loop();
      }
    }

    async attachMicrophone() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.setupAnalyser(this.audioContext.createMediaStreamSource(stream));
        logDebug(this.debug, 'Microphone connected');
      } catch (error) {
        logDebug(this.debug, 'Microphone permission denied or unavailable', error);
      }
    }

    async attachElement() {
      const elementId = this.config.elementId;
      if (!elementId) {
        return;
      }

      const media = document.getElementById(elementId);
      if (!media) {
        logDebug(this.debug, 'Audio element not found', elementId);
        return;
      }

      try {
        const source = this.audioContext.createMediaElementSource(media);
        this.setupAnalyser(source);
        logDebug(this.debug, 'Audio element connected');
      } catch (error) {
        logDebug(this.debug, 'Unable to attach audio element', error);
      }
    }

    setupAnalyser(source) {
      this.source = source;
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.dataArray = new Uint8Array(this.analyser.fftSize);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
      this.active = true;
    }

    loop() {
      if (!this.active || !this.analyser) {
        return;
      }

      this.analyser.getByteTimeDomainData(this.dataArray);
      let sumSquares = 0;
      for (let i = 0; i < this.dataArray.length; i += 1) {
        const centered = (this.dataArray[i] - 128) / 128;
        sumSquares += centered * centered;
      }

      const rms = Math.sqrt(sumSquares / this.dataArray.length);
      const level = Math.min(1, rms * 2);
      const talking = level > (this.config.threshold || 0.08);

      this.setLevel(level);
      this.setTalking(talking);

      requestAnimationFrame(() => this.loop());
    }
  }

  class RiveInstance {
    constructor(config) {
      this.config = config;
      this.container = document.getElementById(config.containerId);
      this.canvas = document.getElementById(config.canvasId);
      this.rive = null;
      this.inputs = {};
      this.pointerMapping = null;
      this.flags = {};
      this.triggers = {};
      this.audioBridge = null;
      this.debug = !!config.debug;
      this.resizeObserver = null;
      this.loadTimeout = null;

      if (!this.container || !this.canvas) {
        return;
      }

      this.applyConfig();
      this.init();
    }

    applyConfig() {
      const mapping = this.config.inputs || {};
      this.pointerMapping = mapping.pointer || { x: 'mx', y: 'my', normalize: 'artboard' };
      this.flags = mapping.flags || {};
      this.triggers = mapping.triggers || {};

      const audioMapping = mapping.audio || {};
      this.audioBridge = new AudioBridge(
        {
          source: this.config.audioMode,
          elementId: this.config.audioElementId,
          level: audioMapping.level || 'audio_level',
          talking: audioMapping.talking || audioMapping.talkingInput || 'is_talking',
          threshold: typeof audioMapping.threshold === 'number' ? audioMapping.threshold : 0.08,
        },
        (value) => this.setNumberInput(audioMapping.level || 'audio_level', value),
        (value) => this.setBooleanInput(audioMapping.talking || audioMapping.talkingInput || 'is_talking', value),
        this.debug
      );
    }

    init() {
      try {
        this.rive = new rive.Rive({
          src: this.config.src,
          canvas: this.canvas,
          autoplay: this.config.autoplay,
          artboard: this.config.artboard || undefined,
          stateMachines: this.config.stateMachine ? [this.config.stateMachine] : undefined,
          animations: this.config.stateMachine ? undefined : this.config.animations,
          fit: FitMap[this.config.fit] || rive.Fit.contain,
          alignment: AlignmentMap[this.config.alignment] || rive.Alignment.center,
          onLoad: () => this.onLoad(),
        });

        this.loadTimeout = setTimeout(() => {
          logDebug(this.debug, 'Timed out waiting for Rive to load');
          this.showFallback();
        }, 8000);
      } catch (error) {
        logDebug(this.debug, 'Failed to start Rive', error);
        this.showFallback();
      }
    }

    onLoad() {
      if (!this.rive) {
        return;
      }

      this.syncCanvasSize();
      this.observeResize();
      this.captureInputs();
      this.attachPointer();
      this.attachFocus();
      this.attachThinking();
      this.attachClickTrigger();
      this.audioBridge.enableOnGesture(this.canvas);
      if (this.loadTimeout) {
        clearTimeout(this.loadTimeout);
      }
      logDebug(this.debug, 'Rive loaded', {
        artboard: this.config.artboard,
        stateMachine: this.config.stateMachine,
        animations: this.config.animations,
        inputs: Object.keys(this.inputs),
      });
    }

    captureInputs() {
      if (!this.rive || !this.config.stateMachine) {
        return;
      }

      const inputs = this.rive.stateMachineInputs(this.config.stateMachine) || [];
      inputs.forEach((input) => {
        this.inputs[input.name] = input;
      });
    }

    attachPointer() {
      if (!this.config.pointer) {
        return;
      }

      const target = this.pointerTarget();
      if (!target) {
        return;
      }

      const handler = (event) => {
        if (!this.rive) {
          return;
        }

        const coords = this.pointerCoordinates(event);
        if (!coords) {
          return;
        }

        const normalized = this.normalizePointer(coords);
        if (this.pointerMapping.x) {
          this.setNumberInput(this.pointerMapping.x, normalized.x);
        }
        if (this.pointerMapping.y) {
          this.setNumberInput(this.pointerMapping.y, normalized.y);
        }
      };

      target.addEventListener('pointermove', handler);
      target.addEventListener('touchmove', handler);
    }

    attachClickTrigger() {
      const triggerName = this.triggers.click;
      if (!triggerName) {
        return;
      }

      this.canvas.addEventListener('click', () => this.fireTrigger(triggerName));
      this.canvas.addEventListener('touchend', () => this.fireTrigger(triggerName));
    }

    attachFocus() {
      const focusInput = this.flags.focus;
      const blurInput = this.flags.blur || this.flags.focus;

      if (!focusInput && !blurInput) {
        return;
      }

      window.addEventListener('focus', () => {
        if (focusInput) {
          this.setBooleanInput(focusInput, true);
        }
      });

      window.addEventListener('blur', () => {
        if (blurInput) {
          this.setBooleanInput(blurInput, false);
        }
      });
    }

    attachThinking() {
      const thinkingInput = this.flags.thinking;
      if (!thinkingInput) {
        return;
      }

      window.addEventListener('rive:thinking', (event) => {
        const detail = event.detail || {};
        if (detail.id && detail.id !== this.config.id) {
          return;
        }
        this.setBooleanInput(thinkingInput, !!detail.value);
      });
    }

    pointerTarget() {
      if (this.config.pointerScope === 'canvas') {
        return this.canvas;
      }
      if (this.config.pointerScope === 'container') {
        return this.container;
      }
      return window;
    }

    pointerCoordinates(event) {
      if (!event) {
        return null;
      }

      const target = this.pointerTarget();
      if (!(target instanceof Element)) {
        const x = event.clientX || 0;
        const y = event.clientY || 0;
        return { x, y, width: window.innerWidth, height: window.innerHeight };
      }

      const rect = target.getBoundingClientRect();
      const clientX = event.clientX ?? (event.touches && event.touches[0]?.clientX);
      const clientY = event.clientY ?? (event.touches && event.touches[0]?.clientY);

      if (clientX == null || clientY == null) {
        return null;
      }

      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
        width: rect.width,
        height: rect.height,
      };
    }

    normalizePointer(coords) {
      const mode = this.pointerMapping.normalize || 'artboard';
      if (mode === '0to1') {
        return {
          x: coords.x / coords.width,
          y: coords.y / coords.height,
        };
      }

      if (mode === 'pixels') {
        return { x: coords.x, y: coords.y };
      }

      // artboard default [-1..1]
      return {
        x: (coords.x / coords.width) * 2 - 1,
        y: (coords.y / coords.height) * 2 - 1,
      };
    }

    setNumberInput(name, value) {
      const input = this.inputs[name];
      if (input && input.type === 'number') {
        input.value = value;
        logDebug(this.debug, 'Number input', name, value);
      }
    }

    setBooleanInput(name, value) {
      const input = this.inputs[name];
      if (input && input.type === 'boolean') {
        input.value = !!value;
        logDebug(this.debug, 'Boolean input', name, value);
      }
    }

    fireTrigger(name) {
      const input = this.inputs[name];
      if (input && input.type === 'trigger' && typeof input.fire === 'function') {
        input.fire();
        logDebug(this.debug, 'Trigger fired', name);
      }
    }

    syncCanvasSize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.container.getBoundingClientRect();
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;
      this.rive?.resizeToCanvas();
    }

    observeResize() {
      this.resizeObserver = new ResizeObserver(() => this.syncCanvasSize());
      this.resizeObserver.observe(this.container);
    }

    showFallback() {
      if (this.container) {
        this.container.classList.add('thefunction-rive-error');
      }
    }
  }

  function bootstrap() {
    globalConfigs.forEach((config) => new RiveInstance(config));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();
