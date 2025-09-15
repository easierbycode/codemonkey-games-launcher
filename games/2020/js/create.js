import AudioManager from './audio.js'
import Constants from './constants.js'
import Properties from './properties.js'
import { initAnimations } from './animations.js'
import { catchCorona, showControls } from './helpers.js'
import { moveToEvent } from './timeline.js'
import Level0 from './levels/level0.js'

const INFO_POPUP = document.getElementById('modalInfo')

export function initObjects() {
    // Reset game
    Properties.reset()
    // Update world gravity
    this.physics.world.gravity.y = Constants.GRAVITY_FROM_HEIGHT * Properties.sceneSize.height
    // Set tile size
    this.physics.world.TILE_BIAS = 64

    // Init animations
    initAnimations()
    // Create audio
    createAudio.call(this)
    // create FPS text
    createFPSText.call(this)
    // Create map with objects
    createMap.call(this)
    // Create text
    createTitleText.call(this)
    // Create player
    createPlayer.call(this)
    // Init interactions between objects (physics)
    initPhysics.call(this)
    // Init keyboard events
    initKeyboard.call(this)
    // Init gamepad
    initGamepad.call(this)

    if (!Constants.DEBUG) {
        let urlCheckpoint = parseInt(new URL(window.location.href).searchParams.get('checkpoint'))
        if (!Properties.gameIsLoaded && urlCheckpoint) {
            Properties.checkpoint = urlCheckpoint
        }
        // Shift timeline to the current level if not debugging
        moveToEvent(Constants.CHECKPOINTS[Properties.checkpoint])
    } else {
        // Move the debug point
        moveToEvent(Constants.DEBUG_POINT)
    }

    // Show mobile controls
    showControls()

    if (Properties.checkpoint === 0) {
        // Add infinite flying bird for the zero level
        let birdInterval = this.time.addEvent({
            delay: Constants.DURATION.bird,
            startAt: Constants.DURATION.bird,
            loop: true,
            callback: Level0.addBird
        })
        // Check every 100ms player movement to remove bird
        let playerX = Properties.player.x
        let movementInterval = this.time.addEvent({
            delay: 300,
            startAt: 300,
            loop: true,
            callback: () => {
                if (playerX !== Properties.player.x) {
                    movementInterval.remove()
                    birdInterval.remove()
                }
            }
        })
    }

    if (Constants.IS_TOUCH_DEVICE) {
        createTouchEvents()
        addInfoButton.call(this)
    }

    if (!Properties.gameIsLoaded) {
        // Yandex.Metrika
        ym(70640851, 'reachGoal', 'GAME_LOADED')
        // Update loading state
        Properties.gameIsLoaded = true
    }
}

function createAudio() {
    // Main themes
    AudioManager.base['main-full'] = this.sound.add('main1', { loop: true, volume: Constants.VOLUME.main })
    AudioManager.base['main-short'] = this.sound.add('main2', { loop: true, volume: Constants.VOLUME.main })
    AudioManager.base['main-beats'] = this.sound.add('main3', { loop: true, volume: Constants.VOLUME.main })
    AudioManager.unsetMain()
}

function createMap() {
    // Create tilemap
    let map = this.add.tilemap('game')
    let tileset = map.addTilesetImage('tileset', 'tileset')
    // Save to properties
    Properties.map = map
    // Foreground
    // Phaser 3.90+: use createLayer (replaces createStaticLayer / createDynamicLayer)
    let foreground = map.createLayer('foreground', tileset, 0, 0)
    foreground.setDepth(Constants.DEPTH.foregroundMain)
    // Update camera and world bounds
    Properties.camera.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
    // Fill events from the map and sort by X position
    Properties.timelineEvents = map.getObjectLayer('events').objects.map(event => ({
        x: event.x,
        name: event.name
    })).sort((e1, e2) => e1.x - e2.x)
}

function createTitleText() {
    // Positions and font size
    let posX = Properties.sceneSize.width / 2, posY = 100
    // Title text
    Properties.titleText = this.add.bitmapText(posX, posY, 'light')
    // Set origin
    Properties.titleText.setOrigin(0.5, Properties.titleText.originY)
    // Set depth and not affected by camera
    Properties.titleText.setDepth(Constants.DEPTH.important).setScrollFactor(0)
}

function createFPSText() {
    if (this.game.config.physics.arcade.debug) {
        Properties.fpsText = this.add.text(10, 0, 'FPS: --', {
            font: 'bold 26px Arial',
            fill: '#ffffff'
        }).setDepth(Constants.DEPTH.important).setScrollFactor(0)
    }
}

function createPlayer() {
    // Player position
    let positionX = 0, positionY = Properties.foregroundY() * 0.8
    // Create player with physics body
    let player = this.physics.add.sprite(positionX, positionY, 'player-idle')
    // Set colliding with world bounds
    player.setCollideWorldBounds(true)
    // Update body size
    // player.setBodySize(player.width * 0.6, player.height * 0.9)
    player.setBodySize(56, 91)
    // player.setOffset(player.width * 0.2, player.height * 0.1)
    player.setOffset(14, 41, false)
    // Set depth – foreground main
    player.setDepth(Constants.DEPTH.important)
    // Animate fall
    player.anims.play('fall')
    // Save globally
    Properties.player = player
}

function initPhysics() {
    // Create groud group
    Properties.groundGroup = this.physics.add.staticGroup()
    // Set foreground collision by property
    let foreground = Properties.map.getLayer('foreground').tilemapLayer
    foreground.setCollisionByProperty({ collides: true })
    // Player collides with the ground group sprites
    this.physics.add.collider(Properties.player, Properties.groundGroup, () => Properties.landPlayer())
    // Player collides with foreground tiles
    this.physics.add.collider(Properties.player, foreground, () => Properties.landPlayer())
    // Create corona group
    Properties.coronaGroup = this.physics.add.group({ allowGravity: false, immovable: true })
    // Player overlaps with corona
    this.physics.add.overlap(Properties.player, Properties.coronaGroup, (_, corona) => {
        // Process collision
        catchCorona(corona)
    })
}

function initKeyboard() {
    let cursors = this.input.keyboard.createCursorKeys()
    let wad = this.input.keyboard.addKeys('W,A,D')
    // Save keys
    Properties.keyboard.up = cursors.up
    Properties.keyboard.left = cursors.left
    Properties.keyboard.right = cursors.right
    Properties.keyboard.space = cursors.space
    Properties.keyboard.W = wad.W
    Properties.keyboard.A = wad.A
    Properties.keyboard.D = wad.D

    // Properties.joyStick = this.plugins.get('rexvirtualjoystickplugin').add(this, {
    //     x: 120,
    //     y: Properties.sceneSize.height - 100,
    //     radius: 100,
    //     base: this.add.circle(0, 0, 100, 0x888888).setDepth(Constants.DEPTH.important).setAlpha(0.5),
    //     thumb: this.add.circle(0, 0, 50, 0xcccccc).setDepth(Constants.DEPTH.important).setAlpha(0.5),
    //     dir: 'left&right',
    //     forceMin: 16
    // })
}

function initGamepad() {
    this.input.gamepad.once('down', ( gamepad ) => {
        console.log(gamepad)
        Properties.gamepad = gamepad
    })
}

function createTouchEvents() {

    // Properties.joyStick.on('update', () => {
    //     var cursorKeys = Properties.joyStick.createCursorKeys();
    //     // for (var name in cursorKeys) {
    //     for (var name of ['left', 'right']) {
    //         Properties.touches[name] = cursorKeys[name].isDown
    //     }

    //     var joyStick = Properties.joyStick;
    //     if (joyStick.enable && joyStick.force > 100) {
    //         let tolerance = 100 / joyStick.force;
    //         joyStick.setPosition(
    //             joyStick.pointer.position.x - joyStick.forceX * tolerance,
    //             joyStick.pointer.position.y - joyStick.forceY * tolerance
    //         )

    //         joyStick.thumb.x = joyStick.pointer.position.x;
    //         joyStick.thumb.y = joyStick.pointer.position.y;
    //     }
    // })

    let left = document.getElementById('left')
    let right = document.getElementById('right')
    let up = document.getElementById('up')

    for (const control of [left, right, up]) {
    // for (const control of [up]) {
        // Activate on touch start
        control.addEventListener('touchstart', function(e) {
            e.preventDefault()
            this.classList.add('active')
            Properties.touches[control.id] = true
        })
        // Deactivate on touch end
        let endTimeout
        control.addEventListener('touchend', function() {
            this.classList.remove('active')
            clearTimeout(endTimeout)
            endTimeout = setTimeout(() => Properties.touches[control.id] = false, this.id === 'up' ? 300 : 0)
        })
        // Check whether is out when moving
        control.addEventListener('touchmove', function(e) {
            let { clientX, clientY } = e.touches[0]
            if (!touchesElement(this, clientX, clientY)) {
                this.dispatchEvent(new Event('touchend'))
            }
        })
    }
}

function touchesElement(el, pointX, pointY) {
    let { x, y, width, height } = el.getBoundingClientRect()
    return pointX >= x && pointX <= x + width && pointY >= y && pointY <= y + height
}

function addInfoButton() {
    let info = this.add.image(48, 32, 'info').setName('info')
    info.setOrigin(0, 0).setScrollFactor(0).setDepth(Constants.DEPTH.important * 2)
    info.setInteractive()
    info.on('pointerup', () => {
        let removePopup = function() {
            // Hide popup and close event listener
            INFO_POPUP.style.display = 'none'
            INFO_POPUP.children[0].removeEventListener('click', removePopup)
            // Enable input
            Properties.inputEnabled = true
        }
        // Show popup and add close event listener
        INFO_POPUP.style.display = 'flex'
        INFO_POPUP.children[0].addEventListener('click', removePopup)
        // Disable input
        Properties.inputEnabled = false
    })
}
