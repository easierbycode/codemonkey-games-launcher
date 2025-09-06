// modules are defined as an array
// [ module function, map of requires ]
//
// map of requires is short require name -> numeric require
//
// anything defined in a previous bundle is accessed via the
// orig method which is the require for previous bundles
parcelRequire = (function (modules, cache, entry, globalName) {
  // Save the require from previous bundle to this closure if any
  var previousRequire = typeof parcelRequire === 'function' && parcelRequire;
  var nodeRequire = typeof require === 'function' && require;

  function newRequire(name, jumped) {
    if (!cache[name]) {
      if (!modules[name]) {
        // if we cannot find the module within our internal map or
        // cache jump to the current global require ie. the last bundle
        // that was added to the page.
        var currentRequire = typeof parcelRequire === 'function' && parcelRequire;
        if (!jumped && currentRequire) {
          return currentRequire(name, true);
        }

        // If there are other bundles on this page the require from the
        // previous one is saved to 'previousRequire'. Repeat this as
        // many times as there are bundles until the module is found or
        // we exhaust the require chain.
        if (previousRequire) {
          return previousRequire(name, true);
        }

        // Try the node require function if it exists.
        if (nodeRequire && typeof name === 'string') {
          return nodeRequire(name);
        }

        var err = new Error('Cannot find module \'' + name + '\'');
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }

      localRequire.resolve = resolve;
      localRequire.cache = {};

      var module = cache[name] = new newRequire.Module(name);

      modules[name][0].call(module.exports, localRequire, module, module.exports, this);
    }

    return cache[name].exports;

    function localRequire(x){
      return newRequire(localRequire.resolve(x));
    }

    function resolve(x){
      return modules[name][1][x] || x;
    }
  }

  function Module(moduleName) {
    this.id = moduleName;
    this.bundle = newRequire;
    this.exports = {};
  }

  newRequire.isParcelRequire = true;
  newRequire.Module = Module;
  newRequire.modules = modules;
  newRequire.cache = cache;
  newRequire.parent = previousRequire;
  newRequire.register = function (id, exports) {
    modules[id] = [function (require, module) {
      module.exports = exports;
    }, {}];
  };

  var error;
  for (var i = 0; i < entry.length; i++) {
    try {
      newRequire(entry[i]);
    } catch (e) {
      // Save first error but execute all entries
      if (!error) {
        error = e;
      }
    }
  }

  if (entry.length) {
    // Expose entry point to Node, AMD or browser globals
    // Based on https://github.com/ForbesLindesay/umd/blob/master/template.js
    var mainExports = newRequire(entry[entry.length - 1]);

    // CommonJS
    if (typeof exports === "object" && typeof module !== "undefined") {
      module.exports = mainExports;

    // RequireJS
    } else if (typeof define === "function" && define.amd) {
     define(function () {
       return mainExports;
     });

    // <script>
    } else if (globalName) {
      this[globalName] = mainExports;
    }
  }

  // Override the current require with this new one
  parcelRequire = newRequire;

  if (error) {
    // throw error from earlier, _after updating parcelRequire_
    throw error;
  }

  return newRequire;
})({"DFGu":[function(require,module,exports) {
"use strict"; // Gamepad support

var MAX_PLAYERS = 2;
var haveEvents = 'ongamepadconnected' in window;
var controllers = {}; // D-PAD AND BUTTONS
// (U, D, L, R, B, A, START)

var buttons = {
  U: 12,
  D: 13,
  L: 14,
  R: 15,
  B: 2,
  A: 0,
  S: 9
};
var buttonValues = Object.values(buttons);
var buttonKeys = Object.keys(buttons); // KeyboardEvent keyCode mappings by gamepad
// i.e. - keyCodes[0] maps to the first gamepad,
// pressing (S)TART triggers a keypress for 83 (SPACE)

var keyCodes = [{
  U: 87,
  D: 83,
  L: 65,
  R: 68,
  B: 67,
  A: 32,
  S: 13 //(ENTER)  //83

}, {
  U: 87,
  D: 83,
  L: 65,
  R: 68
}];
var pendingKeyupEvents = Array(MAX_PLAYERS).fill({
  U: null,
  D: null,
  L: null,
  R: null,
  B: null,
  A: null,
  S: null
});

function connecthandler(e) {
  console.log('.. adding gamepad:');
  console.log(e.gamepad);
  addgamepad(e.gamepad);
}

function addgamepad(gamepad) {
  controllers[gamepad.index] = gamepad;
  requestAnimationFrame(updateStatus);
}

function disconnecthandler(e) {
  removegamepad(e.gamepad);
}

function removegamepad(gamepad) {
  delete controllers[gamepad.index];
}

function updateStatus() {
  if (!haveEvents) {
    scangamepads();
  }

  for (var controllerIdx = 0; controllerIdx < Object.keys(controllers).length; controllerIdx++) {
    var controller = controllers[+Object.keys(controllers)[controllerIdx]]; // HOME / PS button - enter fullscreen

    if (controller.buttons[16].pressed) {
      if (!document.fullscreen) {
        document.getElementsByTagName('canvas')[0].requestFullscreen();
      }
    }

    for (var i = 0; i < buttonValues.length; i++) {
      var buttonKey = buttonKeys[i];
      var val = controller.buttons[buttonValues[i]];
      var pressed = val.pressed;
      var pendingKeyupEvent = pendingKeyupEvents[controllerIdx][buttonKey];

      if (pressed) {
        var keyCode = keyCodes[controllerIdx][buttonKey]; // if button is still pressed (pendingKeyupEvent),
        // don't create / dispatch duplicate events

        if (pendingKeyupEvent && pendingKeyupEvent.keyCode === keyCode) continue;
        var event = document.createEvent('event');
        var keyupEvent = document.createEvent('event');
        event.initEvent('keydown', true, true);
        keyupEvent.initEvent('keyup', true, true);
        event.keyCode = keyCode;
        keyupEvent.keyCode = keyCode;
        document.getElementsByTagName('canvas')[0].dispatchEvent(event);
        pendingKeyupEvents[controllerIdx][buttonKey] = keyupEvent;
      } else if (pendingKeyupEvent) {
        document.getElementsByTagName('canvas')[0].dispatchEvent(pendingKeyupEvent);
        pendingKeyupEvents[controllerIdx][buttonKey] = null;
      }
    }
  }

  requestAnimationFrame(updateStatus);
}

function scangamepads() {
  var gamepads = navigator.getGamepads();

  for (var i = 0; i < gamepads.length; i++) {
    if (gamepads[i]) {
      if (gamepads[i].index in controllers) {
        controllers[gamepads[i].index] = gamepads[i];
      } else {
        addgamepad(gamepads[i]);
      }
    }
  }
}

window.addEventListener("gamepadconnected", connecthandler);
window.addEventListener("gamepaddisconnected", disconnecthandler);
if (!haveEvents) scangamepads();
},{}]},{},["DFGu"], null)
//# sourceMappingURL=/mario/gamepad-support.e17685ba.js.map