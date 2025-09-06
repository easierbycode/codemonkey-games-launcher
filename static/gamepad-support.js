/**
 * Advanced Gamepad Support System
 * Works in both launcher and in-game contexts
 * Features Steam-like Controller Configurator
 */

class GamepadManager {
  constructor() {
    this.MAX_PLAYERS = 4;
    this.controllers = {};
    this.buttonState = {};
    this.analogState = {};
    this.isRunning = false;
    // Testing mode (visualize presses on configurator SVG)
    this.testingMode = false;
    this.testingController = 'all'; // 'all' or specific controller index (number or string)
    // OSD navigation state
    this.osdFocusIndex = -1;
    this.wasOSDOpen = false;
    // Game Menu navigation state
    this.gameMenuFocusIndex = -1;
    this.wasGameMenuOpen = false;

    // Detect Gamepad Button state
    this._detecting = false; // { ui: { selectEl, buttonEl, hintEl } } | false
    this._detectSnapshot = {}; // controllerIndex -> [bool]
    
    // Default controller mapping (Standard Gamepad API)
    this.defaultMapping = {
      dpad: {
        up: { gamepadButton: 12, keyboardKey: 'ArrowUp', keyCode: 38 },
        down: { gamepadButton: 13, keyboardKey: 'ArrowDown', keyCode: 40 },
        left: { gamepadButton: 14, keyboardKey: 'ArrowLeft', keyCode: 37 },
        right: { gamepadButton: 15, keyboardKey: 'ArrowRight', keyCode: 39 }
      },
      face: {
        btnBottom: { gamepadButton: 0, keyboardKey: ' ', keyCode: 32 }, // A/Cross
        btnRight: { gamepadButton: 1, keyboardKey: 'c', keyCode: 67 }, // B/Circle  
        btnLeft: { gamepadButton: 2, keyboardKey: 'c', keyCode: 67 }, // X/Square
        btnTop: { gamepadButton: 3, keyboardKey: ' ', keyCode: 32 } // Y/Triangle
      },
      shoulder: {
        leftShoulder: { gamepadButton: 4, keyboardKey: 'q', keyCode: 81 },
        rightShoulder: { gamepadButton: 5, keyboardKey: 'e', keyCode: 69 },
        leftTrigger: { gamepadButton: 6, keyboardKey: 'r', keyCode: 82 },
        rightTrigger: { gamepadButton: 7, keyboardKey: 't', keyCode: 84 }
      },
      special: {
        select: { gamepadButton: 8, keyboardKey: 'Backspace', keyCode: 8 },
        start: { gamepadButton: 9, keyboardKey: 'Enter', keyCode: 13 },
        leftStick: { gamepadButton: 10, keyboardKey: 'f', keyCode: 70 },
        rightStick: { gamepadButton: 11, keyboardKey: 'g', keyCode: 71 },
        home: { gamepadButton: 16, keyboardKey: 'h', keyCode: 72 }
      }
    };
    
    // Load saved mapping or use default
    this.currentMapping = this.loadMapping();
    
    this.init();
  }
  
  init() {
    // Event listeners for gamepad connection/disconnection
    window.addEventListener('gamepadconnected', (e) => this.onGamepadConnected(e));
    window.addEventListener('gamepaddisconnected', (e) => this.onGamepadDisconnected(e));
    
    // Start the polling loop
    this.startPolling();
    
    // Initialize button state tracking
    this.resetButtonStates();
  }
  
  startPolling() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.poll();
  }
  
  stopPolling() {
    this.isRunning = false;
  }
  
  poll() {
    if (!this.isRunning) return;

    this.scanGamepads();
    // If in detect mode, capture the next newly-pressed button
    this.handleDetectionTick();
    this.processInputs();

    // While configurator is open and testing enabled, update SVG highlights
    try {
      if (this.isConfiguratorOpen && this.isConfiguratorOpen() && this.testingMode) {
        this.updateTestingVisual();
      }
    } catch (_) {}

    requestAnimationFrame(() => this.poll());
  }
  
  scanGamepads() {
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        if (gamepads[i].index in this.controllers) {
          this.controllers[gamepads[i].index] = gamepads[i];
        } else {
          this.addGamepad(gamepads[i]);
        }
      }
    }
  }
  
  onGamepadConnected(event) {
    console.log('Gamepad connected:', event.gamepad);
    this.addGamepad(event.gamepad);
    this.refreshTestingControllerOptionsIfOpen();
  }
  
  onGamepadDisconnected(event) {
    console.log('Gamepad disconnected:', event.gamepad);
    this.removeGamepad(event.gamepad);
    this.refreshTestingControllerOptionsIfOpen();
  }
  
  addGamepad(gamepad) {
    this.controllers[gamepad.index] = gamepad;
    
    // Initialize button state for all expected buttons
    this.buttonState[gamepad.index] = {
      // D-pad states
      dpadLeft: false,
      dpadRight: false,
      dpadUp: false,
      dpadDown: false,
      // Face button states
      faceSouth: false,
      faceNorth: false,
      faceEast: false,
      faceWest: false,
      // Special states
      osdCombo: false,
      // Analog stick digital states
      leftStick: { left: false, right: false, up: false, down: false },
      rightStick: { left: false, right: false, up: false, down: false }
    };
    
    this.analogState[gamepad.index] = { leftStick: { x: 0, y: 0 }, rightStick: { x: 0, y: 0 } };
    
    console.log(`Gamepad ${gamepad.index} (${gamepad.id}) added and initialized`);
    this.refreshTestingControllerOptionsIfOpen();
  }
  
  removeGamepad(gamepad) {
    delete this.controllers[gamepad.index];
    delete this.buttonState[gamepad.index];
    delete this.analogState[gamepad.index];
    this.refreshTestingControllerOptionsIfOpen();
  }
  
  resetButtonStates() {
    for (let controllerIndex in this.controllers) {
      this.buttonState[controllerIndex] = {};
    }
  }
  
  processInputs() {
    for (let controllerIndex in this.controllers) {
      const controller = this.controllers[controllerIndex];
      // Snapshot previous button state to detect rising edges reliably within this frame
      const prevButtonState = { ...(this.buttonState[controllerIndex] || {}) };

      // Detect OSD open/close edge to initialize focus
      const osdOpen = this.isOSDOpen();
      if (osdOpen && !this.wasOSDOpen) {
        // OSD just opened
        this.initOSDFocus();
      }
      this.wasOSDOpen = osdOpen;

      // Detect Game Menu open/close edge to initialize focus
      const gameMenuOpen = this.isGameMenuOpen ? this.isGameMenuOpen() : false;
      if (gameMenuOpen && !this.wasGameMenuOpen) {
        this.initGameMenuFocus();
      }
      this.wasGameMenuOpen = gameMenuOpen;

      // Process all mapped buttons
      this.processButtonGroup('dpad', controller, controllerIndex, prevButtonState);
      this.processButtonGroup('face', controller, controllerIndex, prevButtonState);
      this.processButtonGroup('shoulder', controller, controllerIndex, prevButtonState);
      this.processButtonGroup('special', controller, controllerIndex, prevButtonState);
      
      // Process analog sticks
      this.processAnalogSticks(controller, controllerIndex);
      
      // Handle launcher-specific controls
      this.processLauncherControls(controller, controllerIndex, prevButtonState);
      
      // Handle OSD controls
      this.processOSDControls(controller, controllerIndex, prevButtonState);
      // Handle Game Menu controls
      this.processGameMenuControls(controller, controllerIndex, prevButtonState);
    }
  }
  
  processButtonGroup(groupName, controller, controllerIndex, prevButtonState) {
    const group = this.currentMapping[groupName];
    if (!group) return;

    for (let buttonName in group) {
      const mapping = group[buttonName];
      const button = controller.buttons[mapping.gamepadButton];

      if (button) {
        const wasPressed = prevButtonState[buttonName] || false;
        const isPressed = button.pressed;

        const swallow = this.shouldSwallowFor(controllerIndex);

        // Button press (rising edge)
        if (isPressed && !wasPressed) {
          // While testing (for this controller), swallow inputs entirely (no actions)
          if (swallow) {
            // no-op: allow state update below for visualization
          }
          // B closes controller configurator if open; otherwise fall through
          else if (this.isConfiguratorOpen && this.isConfiguratorOpen() && groupName === 'face' && buttonName === 'btnRight') {
            try { this.closeConfigurator(); } catch (_) {}
            this.buttonState[controllerIndex].faceEast = true;
            return;
          }
          // While overlays are open, don't forward most groups to the game
          else if (this.isAnyOverlayOpen && this.isAnyOverlayOpen() && (groupName === 'dpad' || groupName === 'face' || groupName === 'shoulder')) {
            // Latch A/B so releasing after closing overlay won't trigger launcher actions
            if (groupName === 'face' && buttonName === 'btnBottom') this.buttonState[controllerIndex].faceSouth = true;
            if (groupName === 'face' && buttonName === 'btnRight') this.buttonState[controllerIndex].faceEast = true;
            // Overlay-specific handling handled elsewhere
          } else {
            this.dispatchKeyboardEvent('keydown', mapping);
            this.handleSpecialActions(groupName, buttonName, controllerIndex);
          }
        }
        // Button release (falling edge)
        else if (!isPressed && wasPressed) {
          if (swallow) {
            // swallow
          } else if (this.isAnyOverlayOpen && this.isAnyOverlayOpen() && (groupName === 'dpad' || groupName === 'face' || groupName === 'shoulder')) {
            if (groupName === 'face' && buttonName === 'btnBottom') this.buttonState[controllerIndex].faceSouth = false;
            if (groupName === 'face' && buttonName === 'btnRight') this.buttonState[controllerIndex].faceEast = false;
          } else {
            this.dispatchKeyboardEvent('keyup', mapping);
          }
        }

        this.buttonState[controllerIndex][buttonName] = isPressed;
      }
    }
  }
  
  processAnalogSticks(controller, controllerIndex) {
    // Check if axes exist (some controllers might not have them)
    if (!controller.axes || controller.axes.length < 4) return;
    
    // Left stick (axes 0,1)
    const leftStick = {
      x: this.applyDeadzone(controller.axes[0] || 0),
      y: this.applyDeadzone(controller.axes[1] || 0)
    };
    
    // Right stick (axes 2,3)
    const rightStick = {
      x: this.applyDeadzone(controller.axes[2] || 0),
      y: this.applyDeadzone(controller.axes[3] || 0)
    };
    
    this.analogState[controllerIndex] = { leftStick, rightStick };
    
    // Convert analog to digital for launcher navigation
    this.processAnalogToDigital(leftStick, controllerIndex, 'leftStick');
    this.processAnalogToDigital(rightStick, controllerIndex, 'rightStick');
  }
  
  applyDeadzone(value, deadzone = 0.15) {
    return Math.abs(value) > deadzone ? value : 0;
  }
  
  processAnalogToDigital(stick, controllerIndex, stickName) {
    const threshold = 0.5;
    if (this.shouldSwallowFor(controllerIndex)) {
      // Do not route navigation while testing
      const leftPressed = stick.x < -threshold;
      const rightPressed = stick.x > threshold;
      const upPressed = stick.y < -threshold;
      const downPressed = stick.y > threshold;
      this.buttonState[controllerIndex][stickName] = { left: leftPressed, right: rightPressed, up: upPressed, down: downPressed };
      return;
    }
    const prevState = this.buttonState[controllerIndex][stickName] || {};

    // Horizontal movement
    const leftPressed = stick.x < -threshold;
    const rightPressed = stick.x > threshold;
    const wasLeftPressed = prevState.left || false;
    const wasRightPressed = prevState.right || false;
    
    if (leftPressed && !wasLeftPressed) { this.routeNavigation('left'); }
    if (rightPressed && !wasRightPressed) { this.routeNavigation('right'); }
    
    // Vertical movement
    const upPressed = stick.y < -threshold;
    const downPressed = stick.y > threshold;
    const wasUpPressed = prevState.up || false;
    const wasDownPressed = prevState.down || false;
    
    if (upPressed && !wasUpPressed) { this.routeNavigation('up'); }
    if (downPressed && !wasDownPressed) { this.routeNavigation('down'); }
    
    this.buttonState[controllerIndex][stickName] = {
      left: leftPressed,
      right: rightPressed,
      up: upPressed,
      down: downPressed
    };
  }
  
  processLauncherControls(controller, controllerIndex, prevButtonState) {
    if (document.body.classList.contains('playing')) return; // Skip if in game
    if (this.isAnyOverlayOpen && this.isAnyOverlayOpen()) return; // Skip while overlays are open
    if (this.shouldSwallowFor(controllerIndex)) return; // Swallow while testing for selected controller

    // D-pad navigation
    const dpadMapping = this.currentMapping.dpad;
    if (controller.buttons[dpadMapping.left.gamepadButton]?.pressed &&
        !prevButtonState.dpadLeft) {
      console.log('D-pad LEFT pressed (button', dpadMapping.left.gamepadButton, ')');
      this.handleLauncherNavigation('left');
      this.buttonState[controllerIndex].dpadLeft = true;
    } else if (!controller.buttons[dpadMapping.left.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].dpadLeft = false;
    }

    if (controller.buttons[dpadMapping.right.gamepadButton]?.pressed &&
        !prevButtonState.dpadRight) {
      console.log('D-pad RIGHT pressed (button', dpadMapping.right.gamepadButton, ')');
      this.handleLauncherNavigation('right');
      this.buttonState[controllerIndex].dpadRight = true;
    } else if (!controller.buttons[dpadMapping.right.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].dpadRight = false;
    }

    // Face button actions
    const faceMapping = this.currentMapping.face;
    if (controller.buttons[faceMapping.btnBottom.gamepadButton]?.pressed &&
        !prevButtonState.faceSouth) {
      console.log('Face btnBottom (A) pressed (button', faceMapping.btnBottom.gamepadButton, ')');
      this.handleLauncherAction('select');
      this.buttonState[controllerIndex].faceSouth = true;
    } else if (!controller.buttons[faceMapping.btnBottom.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].faceSouth = false;
    }

    // Start button - show game menu
    const specialMapping = this.currentMapping.special;
    if (controller.buttons[specialMapping.start.gamepadButton]?.pressed &&
        !prevButtonState.startPressed) {
      console.log('Start button pressed (button', specialMapping.start.gamepadButton, ')');
      this.handleStartButton();
      this.buttonState[controllerIndex].startPressed = true;
    } else if (!controller.buttons[specialMapping.start.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].startPressed = false;
    }
  }
  
  processOSDControls(controller, controllerIndex, prevButtonState) {
    if (this.shouldSwallowFor(controllerIndex)) return; // Swallow while testing for selected controller
    const selectPressed = controller.buttons[this.currentMapping.special.select.gamepadButton]?.pressed;
    const downPressed = controller.buttons[this.currentMapping.dpad.down.gamepadButton]?.pressed;

    // Open OSD: Select + DPad Down
    if (!this.isOSDOpen()) {
      if (selectPressed && downPressed && !prevButtonState.osdCombo) {
        if (window.toggleOSD) {
          window.toggleOSD(true);
          // Defer focus init until after DOM updates
          setTimeout(() => this.initOSDFocus(), 0);
        }
        this.buttonState[controllerIndex].osdCombo = true;
      } else if (!(selectPressed && downPressed)) {
        this.buttonState[controllerIndex].osdCombo = false;
      }
      return;
    }

    // When OSD is open: navigate and act
    const dpadMapping = this.currentMapping.dpad;
    const faceMapping = this.currentMapping.face;

    // Navigation: Up/Down
    if (controller.buttons[dpadMapping.up.gamepadButton]?.pressed && !prevButtonState.dpadUp) {
      this.handleOSDNavigation('up');
      this.buttonState[controllerIndex].dpadUp = true;
    } else if (!controller.buttons[dpadMapping.up.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].dpadUp = false;
    }

    if (controller.buttons[dpadMapping.down.gamepadButton]?.pressed && !prevButtonState.dpadDown) {
      this.handleOSDNavigation('down');
      this.buttonState[controllerIndex].dpadDown = true;
    } else if (!controller.buttons[dpadMapping.down.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].dpadDown = false;
    }

    // Activate: A (btnBottom)
    if (controller.buttons[faceMapping.btnBottom.gamepadButton]?.pressed && !prevButtonState.faceSouth) {
      this.activateFocusedOSDItem();
      this.buttonState[controllerIndex].faceSouth = true;
    } else if (!controller.buttons[faceMapping.btnBottom.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].faceSouth = false;
    }

    // Back/Close: B (btnRight)
    if (controller.buttons[faceMapping.btnRight.gamepadButton]?.pressed && !prevButtonState.faceEast) {
      if (window.toggleOSD) window.toggleOSD(false);
      this.buttonState[controllerIndex].faceEast = true;
    } else if (!controller.buttons[faceMapping.btnRight.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].faceEast = false;
    }
  }

  processGameMenuControls(controller, controllerIndex, prevButtonState) {
    if (this.shouldSwallowFor(controllerIndex)) return; // Swallow while testing for selected controller
    if (!this.isGameMenuOpen()) return;

    const dpadMapping = this.currentMapping.dpad;
    const faceMapping = this.currentMapping.face;
    const specialMapping = this.currentMapping.special;

    // Navigation: Up/Down
    if (controller.buttons[dpadMapping.up.gamepadButton]?.pressed && !prevButtonState.gmDpadUp) {
      this.handleGameMenuNavigation('up');
      this.buttonState[controllerIndex].gmDpadUp = true;
    } else if (!controller.buttons[dpadMapping.up.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].gmDpadUp = false;
    }

    if (controller.buttons[dpadMapping.down.gamepadButton]?.pressed && !prevButtonState.gmDpadDown) {
      this.handleGameMenuNavigation('down');
      this.buttonState[controllerIndex].gmDpadDown = true;
    } else if (!controller.buttons[dpadMapping.down.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].gmDpadDown = false;
    }

    // Activate: A (btnBottom)
    if (controller.buttons[faceMapping.btnBottom.gamepadButton]?.pressed && !prevButtonState.gmFaceSouth) {
      this.activateFocusedGameMenuItem();
      // Latch so launcher won't trigger until released after close
      this.buttonState[controllerIndex].gmFaceSouth = true;
      this.buttonState[controllerIndex].faceSouth = true;
    } else if (!controller.buttons[faceMapping.btnBottom.gamepadButton]?.pressed) {
      this.buttonState[controllerIndex].gmFaceSouth = false;
      this.buttonState[controllerIndex].faceSouth = false;
    }

    // Back/Close: B (btnRight) or Start
    const bPressed = controller.buttons[faceMapping.btnRight.gamepadButton]?.pressed;
    const startPressed = controller.buttons[specialMapping.start.gamepadButton]?.pressed;
    const closePressed = bPressed || startPressed;
    if (closePressed && !prevButtonState.gmClose) {
      if (window.hideGameMenu) window.hideGameMenu();
      this.buttonState[controllerIndex].gmClose = true;
      // Latch shared flags so launcher won't act until release
      if (bPressed) this.buttonState[controllerIndex].faceEast = true;
      if (startPressed) this.buttonState[controllerIndex].startPressed = true;
    } else if (!closePressed) {
      this.buttonState[controllerIndex].gmClose = false;
      if (!bPressed) this.buttonState[controllerIndex].faceEast = false;
      if (!startPressed) this.buttonState[controllerIndex].startPressed = false;
    }
  }

  // ===== Game Menu helpers =====
  getVisibleGameMenuButtons() {
    const panel = document.querySelector('#game-menu .game-menu-panel');
    if (!panel) return [];
    const buttons = Array.from(panel.querySelectorAll('button'));
    return buttons.filter((btn) => btn.offsetParent !== null && getComputedStyle(btn).display !== 'none');
  }

  initGameMenuFocus() {
    const items = this.getVisibleGameMenuButtons();
    if (items.length === 0) { this.gameMenuFocusIndex = -1; return; }
    if (this.gameMenuFocusIndex < 0 || this.gameMenuFocusIndex >= items.length) {
      this.gameMenuFocusIndex = 0;
    }
    try { items[this.gameMenuFocusIndex]?.focus(); } catch (_) {}
  }

  handleGameMenuNavigation(direction) {
    const items = this.getVisibleGameMenuButtons();
    if (items.length === 0) return;
    if (this.gameMenuFocusIndex < 0) this.gameMenuFocusIndex = 0;

    if (direction === 'up' || direction === 'left') {
      this.gameMenuFocusIndex = (this.gameMenuFocusIndex - 1 + items.length) % items.length;
    } else if (direction === 'down' || direction === 'right') {
      this.gameMenuFocusIndex = (this.gameMenuFocusIndex + 1) % items.length;
    } else {
      return;
    }
    try { items[this.gameMenuFocusIndex].focus(); } catch (_) {}
  }

  activateFocusedGameMenuItem() {
    const items = this.getVisibleGameMenuButtons();
    if (items.length === 0) return;
    if (this.gameMenuFocusIndex < 0) this.gameMenuFocusIndex = 0;
    try { items[this.gameMenuFocusIndex].click(); } catch (_) {}
  }

  // Routing depending on OSD state
  routeNavigation(direction) {
    if (this.isGameMenuOpen && this.isGameMenuOpen()) this.handleGameMenuNavigation(direction);
    else if (this.isOSDOpen()) this.handleOSDNavigation(direction);
    else this.handleLauncherNavigation(direction);
  }
  
  handleLauncherNavigation(direction) {
    console.log('Gamepad navigation:', direction, 'focusIndex exists:', !!window.focusIndex, 'focusedIndex:', window.focusedIndex);
    if (window.focusIndex) {
      switch (direction) {
        case 'left':
          console.log('Navigating left from index', window.focusedIndex);
          window.focusIndex(window.focusedIndex - 1, false);
          break;
        case 'right':
          console.log('Navigating right from index', window.focusedIndex);
          window.focusIndex(window.focusedIndex + 1, false);
          break;
      }
    } else {
      console.warn('window.focusIndex not available for navigation');
    }
  }

  handleLauncherAction(action) {
    console.log('Launcher action:', action, 'focusedIndex:', window.focusedIndex);
    if (action === 'select' && window.focusIndex && window.focusedIndex !== undefined) {
      console.log('Launching game at index', window.focusedIndex);
      window.focusIndex(window.focusedIndex, true); // Launch game
    }
  }

  handleStartButton() {
    console.log('Start button pressed - showing game menu');
    if (window.showGameMenu && window.focusedIndex !== undefined) {
      const game = window.games ? window.games[window.focusedIndex] : null;
      if (game) {
        window.showGameMenu(game);
      }
    }
  }

  // ===== OSD helpers =====
  isOSDOpen() {
    const el = document.getElementById('osd');
    return !!el && !el.classList.contains('hidden');
  }

  // ===== Overlay helpers =====
  isGameMenuOpen() {
    const el = document.getElementById('game-menu');
    return !!el && !el.classList.contains('hidden');
  }

  isAnyOverlayOpen() {
    return this.isOSDOpen() || this.isGameMenuOpen();
  }

  // Minimal check for controller configurator visibility
  isConfiguratorOpen() {
    const el = document.querySelector('.controller-configurator');
    return !!el && el.classList.contains('visible');
  }

  // Testing is active only when toggle is on and configurator is open
  isTestingActive() {
    return !!this.testingMode && (this.isConfiguratorOpen && this.isConfiguratorOpen());
  }

  // Swallow inputs for ALL controllers while testing is active
  // Rationale: During live button testing, no controller should
  // navigate the launcher or close overlays (e.g., via B). The
  // controller selection only affects visualization aggregation,
  // not input routing. This prevents other controllers from
  // interacting with the launcher while testing a single controller.
  shouldSwallowFor(controllerIndex) {
    return !!(this.isTestingActive && this.isTestingActive());
  }

  getVisibleOSDButtons() {
    const panel = document.querySelector('#osd .osd-panel');
    if (!panel) return [];
    const buttons = Array.from(panel.querySelectorAll('button'));
    return buttons.filter((btn) => btn.offsetParent !== null && getComputedStyle(btn).display !== 'none');
  }

  initOSDFocus() {
    const items = this.getVisibleOSDButtons();
    if (items.length === 0) { this.osdFocusIndex = -1; return; }
    // Prefer to keep focus within bounds, else reset to first
    if (this.osdFocusIndex < 0 || this.osdFocusIndex >= items.length) {
      this.osdFocusIndex = 0;
    }
    try { items[this.osdFocusIndex]?.focus(); } catch (_) {}
  }

  handleOSDNavigation(direction) {
    const items = this.getVisibleOSDButtons();
    if (items.length === 0) return;
    if (this.osdFocusIndex < 0) this.osdFocusIndex = 0;

    if (direction === 'up' || direction === 'left') {
      this.osdFocusIndex = (this.osdFocusIndex - 1 + items.length) % items.length;
    } else if (direction === 'down' || direction === 'right') {
      this.osdFocusIndex = (this.osdFocusIndex + 1) % items.length;
    } else {
      return;
    }
    try { items[this.osdFocusIndex].focus(); } catch (_) {}
  }

  activateFocusedOSDItem() {
    const items = this.getVisibleOSDButtons();
    if (items.length === 0) return;
    if (this.osdFocusIndex < 0) this.osdFocusIndex = 0;
    try { items[this.osdFocusIndex].click(); } catch (_) {}
  }
  
  handleSpecialActions(groupName, buttonName, controllerIndex) {
    // Handle special controller actions
    if (groupName === 'special') {
      switch (buttonName) {
        case 'home':
          // Toggle fullscreen
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
          } else {
            document.exitFullscreen();
          }
          break;
      }
    }
  }
  
  dispatchKeyboardEvent(eventType, mapping) {
    // Only dispatch to games when in playing mode and no overlay is open
    if (!document.body.classList.contains('playing')) return;
    if (this.isAnyOverlayOpen && this.isAnyOverlayOpen()) return;

    const iframe = document.querySelector('iframe#gameframe');

    // Build a KeyboardEvent and force legacy keyCode/which/charCode for engines that still use them
    const key = mapping.keyboardKey;
    const code = key === ' ' ? 'Space' : (key.length === 1 ? `Key${key.toUpperCase()}` : key);

    const evt = new KeyboardEvent(eventType, {
      key,
      code,
      bubbles: true,
      cancelable: true,
      composed: true,
    });

    // Force read-only props via defineProperty so games checking keyCode/which see expected values
    const setLegacyProps = (e, code) => {
      try {
        Object.defineProperty(e, 'keyCode', { get: () => code });
        Object.defineProperty(e, 'which', { get: () => code });
        Object.defineProperty(e, 'charCode', { get: () => code });
      } catch (_) { /* ignore */ }
    };
    setLegacyProps(evt, mapping.keyCode);

    // Some engines only react to keypress for character keys like Space; synthesize it too
    const makePress = () => {
      const press = new KeyboardEvent('keypress', { key, code, bubbles: true, cancelable: true, composed: true });
      setLegacyProps(press, mapping.keyCode);
      return press;
    };

    const targets = [];
    try {
      if (iframe && iframe.contentDocument) {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;
        const active = doc.activeElement;
        // Prefer focused element, then canvas, then document/window
        const canvas = doc.querySelector('canvas');
        if (active && typeof active.dispatchEvent === 'function') targets.push(active);
        if (canvas) targets.push(canvas);
        if (doc) targets.push(doc);
        if (win) targets.push(win);
        // Also dispatch to iframe element itself as a last resort
        targets.push(iframe);
      }
    } catch (error) {
      console.warn('Cross-origin iframe, will dispatch on main document:', error);
    }
    if (targets.length === 0) targets.push(document);

    console.log(`Dispatching ${eventType} event:`, { key, keyCode: mapping.keyCode, targetCount: targets.length });

    // Dispatch keydown/keyup sequence, plus a keypress for character keys
    for (const t of targets) {
      try { t.dispatchEvent(evt); } catch (_) {}
      if (key === ' ' && eventType === 'keydown') {
        try { t.dispatchEvent(makePress()); } catch (_) {}
      }
    }
  }
  
  // Controller Configuration System
  openControllerConfigurator() {
    this.createConfiguratorUI();
  }
  
  createConfiguratorUI() {
    // Remove existing configurator
    const existingConfig = document.querySelector('.controller-configurator');
    if (existingConfig) {
      existingConfig.remove();
    }
    
    const configurator = document.createElement('div');
    configurator.className = 'controller-configurator';
    configurator.innerHTML = this.getConfiguratorHTML();
    
    document.body.appendChild(configurator);
    
    // Add event listeners
    this.attachConfiguratorListeners(configurator);
    
    // Show with animation
    setTimeout(() => configurator.classList.add('visible'), 50);
  }
  
  getConfiguratorHTML() {
    return `
      <div class="configurator-overlay">
        <div class="configurator-panel">
          <div class="configurator-header">
            <h2>Controller Layout</h2>
            <button class="close-btn" onclick="gamepadManager.closeConfigurator()">&times;</button>
          </div>
          
          <div class="configurator-content">
            <div class="controller-visual">
              <svg viewBox="0 0 400 250" class="controller-svg">
                <!-- Controller outline -->
                <path d="M80 120 Q60 100 40 120 Q20 140 40 160 L80 160 Q100 180 120 180 L280 180 Q300 180 320 160 L360 160 Q380 140 360 120 Q340 100 320 120 L80 120 Z" 
                      fill="#2a2a2a" stroke="#555" stroke-width="2"/>
                
                <!-- D-Pad -->
                <g class="dpad-group" transform="translate(100, 140)">
                  <rect x="-15" y="-5" width="30" height="10" fill="#444" class="dpad-horizontal"/>
                  <rect x="-5" y="-15" width="10" height="30" fill="#444" class="dpad-vertical"/>
                  <circle cx="0" cy="-12" r="8" fill="#555" class="config-btn dpad-up" data-group="dpad" data-button="up"></circle>
                  <circle cx="0" cy="12" r="8" fill="#555" class="config-btn dpad-down" data-group="dpad" data-button="down"></circle>
                  <circle cx="-12" cy="0" r="8" fill="#555" class="config-btn dpad-left" data-group="dpad" data-button="left"></circle>
                  <circle cx="12" cy="0" r="8" fill="#555" class="config-btn dpad-right" data-group="dpad" data-button="right"></circle>
                </g>
                
                <!-- Face buttons -->
                <g class="face-buttons-group" transform="translate(300, 140)">
                  <circle cx="0" cy="-20" r="12" fill="#555" class="config-btn face-north" data-group="face" data-button="btnTop"></circle>
                  <circle cx="0" cy="20" r="12" fill="#555" class="config-btn face-south" data-group="face" data-button="btnBottom"></circle>
                  <circle cx="-20" cy="0" r="12" fill="#555" class="config-btn face-west" data-group="face" data-button="btnLeft"></circle>
                  <circle cx="20" cy="0" r="12" fill="#555" class="config-btn face-east" data-group="face" data-button="btnRight"></circle>
                  <!-- Button labels -->
                  <text x="0" y="-16" text-anchor="middle" fill="white" font-size="10">Y</text>
                  <text x="0" y="24" text-anchor="middle" fill="white" font-size="10">A</text>
                  <text x="-20" y="4" text-anchor="middle" fill="white" font-size="10">X</text>
                  <text x="20" y="4" text-anchor="middle" fill="white" font-size="10">B</text>
                </g>
                
                <!-- Shoulder buttons -->
                <g class="shoulder-buttons">
                  <rect x="60" y="80" width="40" height="15" rx="7" fill="#555" class="config-btn shoulder-left" data-group="shoulder" data-button="leftShoulder"></rect>
                  <rect x="300" y="80" width="40" height="15" rx="7" fill="#555" class="config-btn shoulder-right" data-group="shoulder" data-button="rightShoulder"></rect>
                  <rect x="60" y="60" width="40" height="15" rx="7" fill="#444" class="config-btn trigger-left" data-group="shoulder" data-button="leftTrigger"></rect>
                  <rect x="300" y="60" width="40" height="15" rx="7" fill="#444" class="config-btn trigger-right" data-group="shoulder" data-button="rightTrigger"></rect>
                  <text x="80" y="91" text-anchor="middle" fill="white" font-size="8">LB</text>
                  <text x="320" y="91" text-anchor="middle" fill="white" font-size="8">RB</text>
                  <text x="80" y="71" text-anchor="middle" fill="white" font-size="8">LT</text>
                  <text x="320" y="71" text-anchor="middle" fill="white" font-size="8">RT</text>
                </g>
                
                <!-- Special buttons -->
                <g class="special-buttons">
                  <rect x="160" y="120" width="20" height="10" rx="5" fill="#555" class="config-btn special-select" data-group="special" data-button="select"></rect>
                  <rect x="220" y="120" width="20" height="10" rx="5" fill="#555" class="config-btn special-start" data-group="special" data-button="start"></rect>
                  <text x="170" y="127" text-anchor="middle" fill="white" font-size="7">SEL</text>
                  <text x="230" y="127" text-anchor="middle" fill="white" font-size="7">STR</text>
                </g>
                
                <!-- Analog sticks -->
                <circle cx="140" cy="180" r="18" fill="#444" stroke="#666" stroke-width="2"></circle>
                <circle cx="260" cy="180" r="18" fill="#444" stroke="#666" stroke-width="2"></circle>
                <circle cx="140" cy="180" r="8" fill="#555" class="config-btn stick-left" data-group="special" data-button="leftStick"></circle>
                <circle cx="260" cy="180" r="8" fill="#555" class="config-btn stick-right" data-group="special" data-button="rightStick"></circle>
              </svg>
            </div>
            
            <div class="configurator-sidebar">
              <div class="mapping-info">
                <h3>Button Mapping</h3>
                <div class="current-mapping" id="current-mapping-display">
                  <p>Click a button to configure it</p>
                </div>
              </div>
              
              <div class="mapping-form" id="mapping-form" style="display: none;">
                <h4>Configure <span id="config-button-name"></span></h4>
                <div class="form-group">
                  <label>Keyboard Key:</label>
                  <input type="text" id="keyboard-key-input" placeholder="Press a key..." readonly>
                  <button type="button" id="detect-key-btn">Detect Key</button>
                </div>
                <div class="form-group">
                  <label>Gamepad Button:</label>
                  <select id="gamepad-button-select">
                    <option value="0">Button 0 (A/Cross)</option>
                    <option value="1">Button 1 (B/Circle)</option>
                    <option value="2">Button 2 (X/Square)</option>
                    <option value="3">Button 3 (Y/Triangle)</option>
                    <option value="4">Left Shoulder</option>
                    <option value="5">Right Shoulder</option>
                    <option value="6">Left Trigger</option>
                    <option value="7">Right Trigger</option>
                    <option value="8">Select</option>
                    <option value="9">Start</option>
                    <option value="10">Left Stick</option>
                    <option value="11">Right Stick</option>
                    <option value="12">D-Pad Up</option>
                    <option value="13">D-Pad Down</option>
                    <option value="14">D-Pad Left</option>
                    <option value="15">D-Pad Right</option>
                    <option value="16">Home</option>
                  </select>
                  <button type="button" id="detect-gamepad-btn">Detect Gamepad Button</button>
                  <div id="detect-gp-hint" style="margin-top:6px;color:#bdc3c7;font-size:12px;display:none;">Press any gamepad button...</div>
                </div>
                <div class="form-actions">
                  <button type="button" id="save-mapping-btn">Save</button>
                  <button type="button" id="reset-mapping-btn">Reset to Default</button>
                </div>
              </div>

              <div class="testing-section" id="testing-section">
                <h3>Button Testing</h3>
                <div class="form-group inline">
                  <label for="btn-testing-toggle">Live Testing:</label>
                  <label class="switch">
                    <input type="checkbox" id="btn-testing-toggle" />
                    <span class="slider"></span>
                  </label>
                </div>
                <div class="form-group inline">
                  <label for="testing-controller-select">Controller:</label>
                  <select id="testing-controller-select">
                    <option value="all">All Connected</option>
                  </select>
                </div>
                <p class="testing-hint">When enabled, pressed controls light up on the diagram. Choose a controller to test or leave as All.</p>
              </div>
            </div>
          </div>
          
          <div class="configurator-footer">
            <button class="reset-all-btn" onclick="gamepadManager.resetAllMappings()">Reset All</button>
            <button class="save-close-btn" onclick="gamepadManager.saveAndClose()">Save & Close</button>
          </div>
        </div>
      </div>
    `;
  }
  
  attachConfiguratorListeners(configurator) {
    // Button configuration listeners
    const configButtons = configurator.querySelectorAll('.config-btn');
    configButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const group = e.target.dataset.group;
        const button = e.target.dataset.button;
        this.selectButtonForConfig(group, button, e.target);
      });
    });
    
    // Key detection
    const detectKeyBtn = configurator.querySelector('#detect-key-btn');
    const keyInput = configurator.querySelector('#keyboard-key-input');
    
    detectKeyBtn.addEventListener('click', () => {
      this.startKeyDetection(keyInput);
    });
    
    // Save mapping
    const saveMappingBtn = configurator.querySelector('#save-mapping-btn');
    saveMappingBtn.addEventListener('click', () => {
      this.saveCurrentMapping();
    });
    
    // Reset single mapping
    const resetMappingBtn = configurator.querySelector('#reset-mapping-btn');
    resetMappingBtn.addEventListener('click', () => {
      this.resetCurrentMapping();
    });

    // Detect Gamepad Button
    const detectGpBtn = configurator.querySelector('#detect-gamepad-btn');
    const detectHint = configurator.querySelector('#detect-gp-hint');
    const gpSelect = configurator.querySelector('#gamepad-button-select');
    detectGpBtn?.addEventListener('click', () => {
      if (!this.configSelection) return;
      this.startGamepadButtonDetection({ selectEl: gpSelect, buttonEl: detectGpBtn, hintEl: detectHint });
    });

    // When selecting a gamepad button from dropdown, display its default keyboard key
    gpSelect?.addEventListener('change', (e) => {
      const idx = parseInt(gpSelect.value, 10);
      const defKey = this.getDefaultKeyForGamepadIndex(idx) || '';
      if (defKey) {
        keyInput.value = defKey;
      }
    });

    // Button Testing toggle
    const testingToggle = configurator.querySelector('#btn-testing-toggle');
    if (testingToggle) {
      testingToggle.checked = !!this.testingMode;
      testingToggle.addEventListener('change', () => {
        this.setTestingMode(!!testingToggle.checked);
      });
    }

    // Populate controller select for testing
    this.updateTestingControllerDropdown();
    const testingControllerSelect = configurator.querySelector('#testing-controller-select');
    if (testingControllerSelect) {
      testingControllerSelect.value = String(this.testingController);
      testingControllerSelect.addEventListener('change', () => {
        const val = testingControllerSelect.value;
        this.testingController = val === 'all' ? 'all' : String(parseInt(val, 10));
        // Refresh visuals immediately to reflect filter
        try { this.updateTestingVisual(); } catch (_) {}
      });
    }
  }
  
  selectButtonForConfig(group, button, element) {
    // Highlight selected button
    const allButtons = document.querySelectorAll('.config-btn');
    allButtons.forEach(btn => btn.classList.remove('selected'));
    element.classList.add('selected');
    
    // Show mapping form
    const mappingForm = document.querySelector('#mapping-form');
    const mappingDisplay = document.querySelector('#current-mapping-display');
    const buttonNameSpan = document.querySelector('#config-button-name');
    
    mappingDisplay.style.display = 'none';
    mappingForm.style.display = 'block';
    buttonNameSpan.textContent = `${group.toUpperCase()} ${button.toUpperCase()}`;
    
    // Populate current values
    const currentMapping = this.currentMapping[group][button];
    document.querySelector('#keyboard-key-input').value = currentMapping.keyboardKey;
    document.querySelector('#gamepad-button-select').value = currentMapping.gamepadButton;
    
    // Store current selection
    this.configSelection = { group, button };
  }
  
  startKeyDetection(input) {
    input.value = 'Press any key...';
    input.focus();
    
    const handler = (e) => {
      e.preventDefault();
      input.value = e.key;
      document.removeEventListener('keydown', handler);
    };
    
    document.addEventListener('keydown', handler);
  }
  
  saveCurrentMapping() {
    if (!this.configSelection) return;
    
    const { group, button } = this.configSelection;
    const keyboardKey = document.querySelector('#keyboard-key-input').value;
    const gamepadButton = parseInt(document.querySelector('#gamepad-button-select').value);
    
    // Update mapping
    this.currentMapping[group][button].keyboardKey = keyboardKey;
    this.currentMapping[group][button].keyCode = this.getKeyCode(keyboardKey);
    this.currentMapping[group][button].gamepadButton = gamepadButton;
    
    // Save to localStorage
    this.saveMapping();
    
    alert('Mapping saved!');
  }
  
  resetCurrentMapping() {
    if (!this.configSelection) return;
    
    const { group, button } = this.configSelection;
    const defaultMapping = this.defaultMapping[group][button];
    
    // Reset to default
    this.currentMapping[group][button] = { ...defaultMapping };
    
    // Update UI
    document.querySelector('#keyboard-key-input').value = defaultMapping.keyboardKey;
    document.querySelector('#gamepad-button-select').value = defaultMapping.gamepadButton;
    
    this.saveMapping();
  }
  
  resetAllMappings() {
    if (confirm('Reset all controller mappings to default?')) {
      this.currentMapping = JSON.parse(JSON.stringify(this.defaultMapping));
      this.saveMapping();
      this.closeConfigurator();
    }
  }
  
  saveAndClose() {
    this.saveMapping();
    this.closeConfigurator();
  }
  
  closeConfigurator() {
    const configurator = document.querySelector('.controller-configurator');
    if (configurator) {
      configurator.classList.remove('visible');
      setTimeout(() => configurator.remove(), 300);
    }
    // Stop detect mode if active
    try { this.cancelGamepadButtonDetection(); } catch (_) {}
    // Turn off testing visuals
    try { this.setTestingMode(false); } catch (_) {}
  }
  
  // ===== Button Testing (visualize pressed controls) =====
  setTestingMode(enabled) {
    this.testingMode = !!enabled;
    const root = document.querySelector('.controller-configurator');
    if (root) root.classList.toggle('testing-active', this.testingMode);
    if (!this.testingMode) this.clearTestingVisual();
  }

  updateTestingControllerDropdown() {
    const select = document.querySelector('.controller-configurator #testing-controller-select');
    if (!select) return;
    const prev = String(this.testingController);
    // Clear options
    while (select.firstChild) select.removeChild(select.firstChild);
    const addOpt = (value, label) => {
      const opt = document.createElement('option');
      opt.value = String(value);
      opt.textContent = label;
      select.appendChild(opt);
    };
    addOpt('all', 'All Connected');
    const indices = Object.keys(this.controllers).map(k => parseInt(k, 10)).sort((a,b)=>a-b);
    for (const idx of indices) {
      const gp = this.controllers[idx];
      const id = gp && gp.id ? gp.id : 'Gamepad';
      const label = `#${idx} — ${id}`;
      addOpt(idx, label);
    }
    // Restore previous selection if still present
    const values = Array.from(select.options).map(o => o.value);
    const next = values.includes(prev) ? prev : 'all';
    this.testingController = next;
    select.value = next;
  }

  refreshTestingControllerOptionsIfOpen() {
    if (this.isConfiguratorOpen && this.isConfiguratorOpen()) {
      this.updateTestingControllerDropdown();
    }
  }

  clearTestingVisual() {
    try {
      const els = document.querySelectorAll('.controller-configurator .controller-svg .config-btn');
      els.forEach(el => el.classList.remove('testing-pressed'));
    } catch (_) {}
  }

  updateTestingVisual() {
    const root = document.querySelector('.controller-configurator');
    if (!root) return;
    const pressed = this.getAggregatedPressedState();

    const map = [
      { sel: '.dpad-up', key: 'up' },
      { sel: '.dpad-down', key: 'down' },
      { sel: '.dpad-left', key: 'left' },
      { sel: '.dpad-right', key: 'right' },
      { sel: '.face-north', key: 'btnTop' },
      { sel: '.face-south', key: 'btnBottom' },
      { sel: '.face-west', key: 'btnLeft' },
      { sel: '.face-east', key: 'btnRight' },
      { sel: '.shoulder-left', key: 'leftShoulder' },
      { sel: '.shoulder-right', key: 'rightShoulder' },
      { sel: '.trigger-left', key: 'leftTrigger' },
      { sel: '.trigger-right', key: 'rightTrigger' },
      { sel: '.special-select', key: 'select' },
      { sel: '.special-start', key: 'start' },
      { sel: '.stick-left', key: 'leftStick' },
      { sel: '.stick-right', key: 'rightStick' },
    ];

    for (const m of map) {
      const el = root.querySelector(m.sel);
      if (!el) continue;
      if (pressed[m.key]) el.classList.add('testing-pressed');
      else el.classList.remove('testing-pressed');
    }
  }

  getAggregatedPressedState() {
    const init = () => false;
    const names = {
      up: init(), down: init(), left: init(), right: init(),
      btnTop: init(), btnBottom: init(), btnLeft: init(), btnRight: init(),
      leftShoulder: init(), rightShoulder: init(), leftTrigger: init(), rightTrigger: init(),
      select: init(), start: init(), leftStick: init(), rightStick: init(),
    };
    const target = this.testingController;
    const indices = target === 'all' ? Object.keys(this.controllers) : [String(target)];
    for (let idx of indices) {
      const bs = this.buttonState[idx] || {};
      for (let k in names) {
        if (Object.prototype.hasOwnProperty.call(bs, k)) names[k] = !!(names[k] || bs[k]);
      }
    }
    return names;
  }
  
  getKeyCode(key) {
    // Map common keys to keyCodes
    const keyCodeMap = {
      'Enter': 13, 'Escape': 27, ' ': 32, 'Backspace': 8, 'Tab': 9,
      'ArrowUp': 38, 'ArrowDown': 40, 'ArrowLeft': 37, 'ArrowRight': 39,
      'a': 65, 'b': 66, 'c': 67, 'd': 68, 'e': 69, 'f': 70, 'g': 71, 'h': 72,
      'i': 73, 'j': 74, 'k': 75, 'l': 76, 'm': 77, 'n': 78, 'o': 79, 'p': 80,
      'q': 81, 'r': 82, 's': 83, 't': 84, 'u': 85, 'v': 86, 'w': 87, 'x': 88,
      'y': 89, 'z': 90
    };
    
    return keyCodeMap[key] || key.charCodeAt(0);
  }
  
  saveMapping() {
    localStorage.setItem('gamepadMapping', JSON.stringify(this.currentMapping));
  }
  
  loadMapping() {
    const saved = localStorage.getItem('gamepadMapping');
    let mapping = saved ? JSON.parse(saved) : JSON.parse(JSON.stringify(this.defaultMapping));
    // Migrate old face button keys (north/east/south/west) to new names
    try {
      if (mapping && mapping.face) {
        const f = mapping.face;
        const needsMigration = 'north' in f || 'east' in f || 'south' in f || 'west' in f;
        if (needsMigration) {
          mapping.face = {
            btnTop: f.north || this.defaultMapping.face.btnTop,
            btnRight: f.east || this.defaultMapping.face.btnRight,
            btnBottom: f.south || this.defaultMapping.face.btnBottom,
            btnLeft: f.west || this.defaultMapping.face.btnLeft,
          };
        }
      }
    } catch (_) { /* ignore migration errors */ }
    return mapping;
  }
}

// ===== Detect Gamepad Button feature =====
GamepadManager.prototype.startGamepadButtonDetection = function(uiRefs) {
  // Snapshot current pressed state so we only pick up new presses
  this._detectSnapshot = {};
  for (let idx in this.controllers) {
    try {
      const gp = this.controllers[idx];
      this._detectSnapshot[idx] = Array.from(gp.buttons || []).map(b => !!(b && b.pressed));
    } catch (_) { this._detectSnapshot[idx] = []; }
  }
  this._detecting = { ui: uiRefs };
  try { uiRefs.buttonEl.disabled = true; } catch (_) {}
  try { uiRefs.hintEl.style.display = ''; } catch (_) {}
};

GamepadManager.prototype.cancelGamepadButtonDetection = function() {
  if (this._detecting && this._detecting.ui) {
    const { buttonEl, hintEl } = this._detecting.ui;
    try { if (buttonEl) buttonEl.disabled = false; } catch (_) {}
    try { if (hintEl) hintEl.style.display = 'none'; } catch (_) {}
  }
  this._detecting = false;
  this._detectSnapshot = {};
};

GamepadManager.prototype.handleDetectionTick = function() {
  if (!this._detecting) return;
  // If configurator closed, cancel detection
  if (!(this.isConfiguratorOpen && this.isConfiguratorOpen())) {
    this.cancelGamepadButtonDetection();
    return;
  }
  for (let idx in this.controllers) {
    const gp = this.controllers[idx];
    const snap = this._detectSnapshot[idx] || [];
    const buttons = gp && gp.buttons ? gp.buttons : [];
    for (let i = 0; i < buttons.length; i++) {
      const pressed = !!(buttons[i] && buttons[i].pressed);
      if (pressed && !snap[i]) {
        // Assign detected button to the UI select and show the default key
        try {
          const selectEl = this._detecting.ui && this._detecting.ui.selectEl;
          if (selectEl) selectEl.value = String(i);
          const defKey = this.getDefaultKeyForGamepadIndex(i);
          const keyInput = document.querySelector('#keyboard-key-input');
          if (keyInput && defKey) keyInput.value = defKey;
        } catch (_) {}
        this.cancelGamepadButtonDetection();
        return;
      }
    }
  }
};

GamepadManager.prototype.getDefaultKeyForGamepadIndex = function(idx) {
  // Search defaultMapping to find the first entry with matching gamepadButton
  const groups = ['dpad', 'face', 'shoulder', 'special'];
  for (const g of groups) {
    const group = this.defaultMapping[g] || {};
    for (const name in group) {
      const m = group[name];
      if (m && m.gamepadButton === idx) return m.keyboardKey;
    }
  }
  return '';
};

// CSS for Controller Configurator
const configuratorCSS = `
.controller-configurator {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 10000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.controller-configurator.visible {
  opacity: 1;
  pointer-events: all;
}

.configurator-overlay {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(5px);
  display: flex;
  justify-content: center;
  align-items: center;
}

.configurator-panel {
  background: linear-gradient(135deg, #1e2328 0%, #2c3e50 100%);
  border-radius: 12px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  width: 90vw;
  max-width: 1000px;
  height: 80vh;
  display: flex;
  flex-direction: column;
  border: 1px solid #34495e;
}

.configurator-header {
  padding: 20px;
  border-bottom: 1px solid #34495e;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  border-radius: 12px 12px 0 0;
}

.configurator-header h2 {
  color: #ecf0f1;
  margin: 0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-weight: 600;
}

.close-btn {
  background: #e74c3c;
  border: none;
  color: white;
  font-size: 24px;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.close-btn:hover {
  background: #c0392b;
}

.configurator-content {
  flex: 1;
  display: flex;
  padding: 20px;
  gap: 20px;
  overflow: hidden;
}

.controller-visual {
  flex: 2;
  background: #34495e;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.controller-svg {
  max-width: 100%;
  max-height: 100%;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2));
}

.config-btn {
  cursor: pointer;
  transition: all 0.2s ease;
}

.config-btn:hover {
  fill: #3498db;
  transform: scale(1.1);
}

.config-btn.selected {
  fill: #e74c3c;
  stroke: #fff;
  stroke-width: 2;
}

.configurator-sidebar {
  flex: 1;
  background: #2c3e50;
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.mapping-info h3 {
  color: #ecf0f1;
  margin: 0 0 15px 0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.current-mapping p {
  color: #bdc3c7;
  margin: 0;
}

.mapping-form h4 {
  color: #ecf0f1;
  margin: 0 0 15px 0;
}

.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  color: #bdc3c7;
  margin-bottom: 5px;
  font-size: 14px;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 8px;
  border: 1px solid #34495e;
  border-radius: 4px;
  background: #1e2328;
  color: #ecf0f1;
  font-size: 14px;
}

.form-group button {
  margin-top: 5px;
  padding: 6px 12px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.2s;
}

.form-group button:hover {
  background: #2980b9;
}

.form-actions {
  display: flex;
  gap: 10px;
}

.form-actions button {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

/* Inline form group (for testing toggle) */
.form-group.inline {
  display: flex;
  align-items: center;
  gap: 10px;
}

.testing-section h3 {
  color: #ecf0f1;
  margin: 0 0 10px 0;
}

.testing-hint {
  color: #bdc3c7;
  font-size: 12px;
  margin: 6px 0 0 0;
}

/* Toggle switch */
.switch {
  position: relative;
  display: inline-block;
  width: 46px;
  height: 24px;
}

.switch input { display: none; }

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: #7f8c8d;
  transition: .2s;
  border-radius: 24px;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .2s;
  border-radius: 50%;
}

input:checked + .slider {
  background-color: #27ae60;
}

input:checked + .slider:before {
  transform: translateX(22px);
}

/* Visual highlight for pressed buttons during testing */
.controller-configurator.testing-active .controller-svg .config-btn.testing-pressed {
  fill: #2ecc71 !important;
  stroke: #ecf0f1;
  stroke-width: 2;
  filter: drop-shadow(0 0 6px rgba(46, 204, 113, 0.8));
}

#save-mapping-btn {
  background: #27ae60;
  color: white;
}

#save-mapping-btn:hover {
  background: #219a52;
}

#reset-mapping-btn {
  background: #f39c12;
  color: white;
}

#reset-mapping-btn:hover {
  background: #e67e22;
}

.configurator-footer {
  padding: 20px;
  border-top: 1px solid #34495e;
  display: flex;
  justify-content: space-between;
  background: #1e2328;
  border-radius: 0 0 12px 12px;
}

.reset-all-btn,
.save-close-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.2s;
}

.reset-all-btn {
  background: #e74c3c;
  color: white;
}

.reset-all-btn:hover {
  background: #c0392b;
}

.save-close-btn {
  background: #27ae60;
  color: white;
}

.save-close-btn:hover {
  background: #219a52;
}
`;

// Inject CSS
const styleSheet = document.createElement('style');
styleSheet.textContent = configuratorCSS;
document.head.appendChild(styleSheet);

// Initialize global gamepad manager
window.gamepadManager = new GamepadManager();

// Expose to launcher
window.openControllerConfig = () => window.gamepadManager.openControllerConfigurator();

console.log('Advanced Gamepad Support System initialized');
