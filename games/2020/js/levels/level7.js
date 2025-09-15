import AudioManager from '../audio.js'
import Constants from '../constants.js'
import Properties from '../properties.js'
import Outro from './outro.js'
import {
    addBounceTween, clearScene, fadeInOutTitle, hideControls,
    playerSpriteJump, playerSpriteRun, playerSpriteStand, processCorona, processMask, hitPlayer
} from '../helpers.js'

// Helper: safely get current animation key across Phaser versions
function getCurrentAnimKey(obj) {
    if (!obj || !obj.anims) return null
    // Prefer currentAnim.key when available
    if (obj.anims.currentAnim && obj.anims.currentAnim.key) {
        return obj.anims.currentAnim.key
    }
    // Fallback to getName if provided by this Phaser version
    if (typeof obj.anims.getName === 'function') {
        return obj.anims.getName()
    }
    // As a last resort, try getCurrentKey if it exists (newer Phaser)
    if (typeof obj.anims.getCurrentKey === 'function') {
        return obj.anims.getCurrentKey()
    }
    return null
}

// Additional processing of sprites from tilemap
const PRE_PROCESSING = {
    '7-smoke': processSmoke,
    '7-firework1': processFirework,
    '7-firework2': processFirework,
    '7-firework3': processFirework
}
const POST_PROCESSING = {
    'c-corona': corona => processCorona(corona, false, false),
    'c-mask': processMask,
    '7-home': processHome,
    '3-home-wall1': processHomeWall,
    '3-home-wall2': wall => wall.setDepth(Constants.DEPTH.important),
    '3-owl': processOwl,
    '7-vaccine': processVaccine,
    '7-ufo-ship': processUfoShip
}
// Intervals
const SYRINGE_INTERVAL = 700
const SYRINGE_MS_PER_PIXEL = 1
const SYRINGE_DISTANCE_FROM_WIDTH = 0.6
const CORONA_INTEREVAL = 2400
const CORONA_MS_PER_PIXEL = 2.4
const CORONA_Y_DURATION = 600
// Corona Y offsets from foreground
const CORONA_OFFSETS_Y = [16, 64, 128]
// Corona tween configurations
const CORONA_TWEEN_PARAMS = [
    { yDelta: 0, ease: undefined }, // No Y delta – horizontal tweeen
    { yDelta: 104, ease: 'Cubic.easeOut' },
    // { yDelta: 96, ease: 'Sine.easeInOut' },
    { yDelta: 192, ease: 'Sine.easeInOut' }
]
// Sequence of corona actions to be looped
const CORONA_ACTIONS = [
    // No top straight corona (2, 0) amd bottom jumpy one (0, 1)
    { offsetY: CORONA_OFFSETS_Y[0], tweenParams: CORONA_TWEEN_PARAMS[0] },
    { offsetY: CORONA_OFFSETS_Y[2], tweenParams: CORONA_TWEEN_PARAMS[2] },
    // { offsetY: CORONA_OFFSETS_Y[1], tweenParams: CORONA_TWEEN_PARAMS[1] },
    // { offsetY: CORONA_OFFSETS_Y[0], tweenParams: CORONA_TWEEN_PARAMS[2] },
    // { offsetY: CORONA_OFFSETS_Y[2], tweenParams: CORONA_TWEEN_PARAMS[1] },
    { offsetY: CORONA_OFFSETS_Y[1], tweenParams: CORONA_TWEEN_PARAMS[0] },
    // { offsetY: CORONA_OFFSETS_Y[1], tweenParams: CORONA_TWEEN_PARAMS[2] }
]
// Bush which needs to be in front of the home
const HOME_BUSH_ID = 743

// Syringe group and collider
let syringeGroup, syringeCollider
// Shoot and corona interval
let coronaInterval, shootingInterval
// Home and fireworks sprite
let home, fireworks
// Home walls
let homeWalls
// Parameter for the current corona action
let currentCoronaAction
// Egg collider
let eggCollider
// Owl and collider
let owl, owlPlayerCollider, owlGroundCollider
let owlFlyX = 61574.5
let owlFlyY = 238
// Owl tweens
let owlBounceTween, owlFlyTween
// Owl shoot/recover timers
let owlShootTimer, owlRecoverTimer
// Owl baby group and colliders
let owlBabyGroup, owlBabyPlayerCollider, owlBabyWallCollider
// Wall collider
let wallCollider
// Ufo ray beam
let ray


export default {
    preloadLevel: function() {
        // Clear scene and init objects
        clearScene()
        initSyringeGroup()
        fireworks = []
        homeWalls = []
        currentCoronaAction = 0
        // Load sprites for Level 7
        Properties.map.getObjectLayer('level7').objects.forEach(object => {
            if (object.name in PRE_PROCESSING) {
                PRE_PROCESSING[object.name](object)
            } else {
                // Add sprite
                let sprite = Properties.addMapImage(object)
                // Post processing
                if (object.name in POST_PROCESSING) {
                    POST_PROCESSING[object.name](sprite)
                }
                // Check for home bush
                if (object.id == HOME_BUSH_ID) {
                    sprite.setDepth(Constants.DEPTH.foregroundMain + 0.5)
                }
            }
        })

        // Owl baby group has collider with wall created above
        initOwlBabyGroup()

        // Init fireworks sound
        AudioManager.base.fireworks = Properties.scene.sound.add('fireworks', { loop: false, volume: 0.3 })

        // Destroy owlBaby on world bounds
        Properties.scene.physics.world.on('worldbounds', (body) => {
            if (body.gameObject.texture.key == '3-owl-baby') {
                // Remove all its tweens
                Properties.scene.tweens.killTweensOf(body.gameObject)
                // Destroy sprite
                owlBabyGroup.remove(body.gameObject, true, true)
            }
        })
    },
    checkpoint15: function() {
        // Update checkpoint
        Properties.checkpoint = 15
        // Clear passed objects
        clearScene()
        // Play main theme full
        AudioManager.setMain('full')
        // Yandex.Metrika
        ym(70640851, 'reachGoal', 'CHECKPOINT_15')
    },
    checkpoint16: function() {
        // Update checkpoint
        Properties.checkpoint = 16
        // Clear passed objects
        clearScene()
        // Play main theme full
        AudioManager.setMain('full')
        // Yandex.Metrika
        ym(70640851, 'reachGoal', 'CHECKPOINT_16')
    },
    showTitle: function() {
        fadeInOutTitle('COVID SECOND WAVE', null, 3000)
    },
    startCorona: function() {
        addCoronaAttack(CORONA_INTEREVAL)
        // Add instantly first corona
        addCorona()
    },
    removeCorona: function() {
        // Stop corona attack
        coronaInterval.remove()
    },
    removeSyringe: function() {
        // Stop syringe shooting and corona attack
        shootingInterval.remove()
    },
    gameWin: function() {
        // Stop theme
        AudioManager.fadeOut(AudioManager.currentMain, 1500)
        // Disable player input
        Properties.inputEnabled = false
        // Hide controls
        hideControls()
        // If player is jumping - unset velocity and wait until it lands
        if (!Properties.playerStands()) {
            // Save current velocity to use later
            let velocityX = Properties.player.body.velocity.x
            // Reset velocity
            Properties.player.setVelocityX(0)
            // Wait for player to land
            let interval = Properties.scene.time.addEvent({
                delay: 25,
                loop: true,
                callback: () => {
                    if (Properties.playerStands()) {
                        interval.remove()
                        // Set velocity back
                        Properties.player.setVelocityX(velocityX)
                        playerSpriteRun()
                        // Finish after landed and started running
                        finishGame()
                    }
                }
            })
        } else {
            finishGame()
        }
        // Yandex.Metrika
        ym(70640851, 'reachGoal', 'GAME_WIN')
    },
    clear: function() {
        if (syringeCollider && syringeCollider.active) { syringeCollider.destroy() }
        if (syringeGroup && syringeGroup.active) { syringeGroup.destroy() }
    },
    // To defeat boss, must jump on his head 5 times
    boss: function() {
        // Set home to be behind the player
        home.setDepth(Constants.DEPTH.foregroundMain)

        // Owl wakes up
        owl.anims.play('3-owl-wake')

        owl.fly()

        // drop 3 eggs
        owlShootTimer = Properties.scene.time.addEvent({
            paused: true,
            delay: 3500,
            callback: () => {
                owl.shoot()
            },
            repeat: -1
        })

        // hatch babies when they hit ground

        // babies attack

        // while babies attack, owl flies up off screen, comes back w/ worms he drops on you

    }
}

function initOwlBabyGroup() {
    // Define group
    owlBabyGroup = Properties.scene.physics.add.group({ allowGravity: false })
    // Define collider with player
    owlBabyPlayerCollider = Properties.scene.physics.add.overlap(
        Properties.player,
        owlBabyGroup,
        (p, o) => {
            if (o.body.touching.up && p.body.touching.down) {
                // Jump
                let velocityY = Constants.VELOCITY_Y_FROM_HEIGHT * p.displayHeight
                p.setVelocityY(velocityY * 1.25)
                // Set jump animation
                playerSpriteJump()
                // Update state
                Properties.playerState.jumping = true
            } else {
                hitPlayer()
                Properties.gameOver()
            }
        }
    )

    // Define collider with wall
    owlBabyWallCollider = Properties.scene.physics.add.collider(
        homeWalls[0],
        owlBabyGroup,
        (w, o) => {
            o.flipX = !o.flipX
            o.body.setVelocityX(-150)
        }
    )
}


function initSyringeGroup() {
    // Define group
    syringeGroup = Properties.scene.physics.add.group({ allowGravity: false })
    // Define collider with coronas
    syringeCollider = Properties.scene.physics.add.overlap(
        syringeGroup,
        Properties.coronaGroup,
        (s, c) => {
            // Remove tweens
            Properties.scene.tweens.killTweensOf(s)
            Properties.scene.tweens.killTweensOf(c)
            // Destroy both
            s.destroy()
            c.destroy()
        }
    )
}

function processSmoke(object) {
    let smoke = Properties.scene.add.sprite(object.x, object.y, object.name)
    smoke.setOrigin(0, 1).setDepth(Constants.DEPTH.foregroundMain)
    Properties.scene.anims.create({
        key: object.name,
        frames: object.name,
        frameRate: 6,
        repeat: -1
    })
    smoke.anims.play(object.name)
}

function processFirework(object) {
    let firework = Properties.scene.add.sprite(object.x, object.y, object.name)
    // Create animation
    Properties.scene.anims.create({
        key: object.name,
        frames: object.name,
        frameRate: 10,
        repeat: 1,
        hideOnComplete: true
    })
    // Save name
    firework.setName(object.name)
    // Properties
    firework.setOrigin(0, 1).setAlpha(0).setDepth(Constants.DEPTH.foregroundSecondary)
    // Add to array
    fireworks.push(firework)
}

function processHome(sprite) {
    home = sprite
    // Set depth important at first, so corona is behind
    home.setDepth(Constants.DEPTH.important)
}


function processHomeWall(wall) {
    // Set depth
    wall.setDepth(Constants.DEPTH.important)
    // Enable physics
    Properties.scene.physics.add.existing(wall)
    // Enable wall
    wall.body.enable = true
    // Wall collider
    wallCollider = Properties.scene.physics.add.collider(Properties.player, wall)
    // Disable gravity and make immovable by other objects
    wall.body.setImmovable(true)
    wall.body.setAllowGravity(false)
    // Add to array
    homeWalls.push(wall)
}


function processVaccine(vaccine) {
    // Define physics
    Properties.scene.physics.add.existing(vaccine)
    // Disallow gravity
    vaccine.body.setAllowGravity(false)
    // Add bounce
    addBounceTween(vaccine)
    // Set collider
    let collider = Properties.scene.physics.add.overlap(Properties.player, vaccine, () => {
        // Destroy vaccine and collider
        vaccine.destroy()
        collider.destroy()
        // Start shooting
        startSyringeShooting()
    })
}

function addCoronaAttack(intervalDuration) {
    // Set new interval for corona attack
    coronaInterval = Properties.scene.time.addEvent({
        delay: intervalDuration,
        loop: true,
        callback: addCorona
    })
}

function addCorona() {
    let offsetX = 50
    let startX = Properties.camera.scrollX + Properties.sceneSize.width + offsetX
    let endX = Properties.camera.scrollX - offsetX
    // Get current action offset Y and params for tweening
    let { offsetY, tweenParams } = CORONA_ACTIONS[currentCoronaAction]
    let posY = Properties.foregroundY() - offsetY
    let corona = Properties.scene.add.image(startX, posY, 'c-corona')
    corona.setDepth(Constants.DEPTH.foregroundMain)
    processCorona(corona, false, false)
    // Add tween
    tweenBounce(corona, endX, tweenParams.yDelta, tweenParams.ease)
    // Update current action
    currentCoronaAction = (currentCoronaAction + 1) % CORONA_ACTIONS.length
}

function tweenBounce(corona, endX, yDelta, ease) {
    let duration = Math.abs(endX - corona.x) * (CORONA_MS_PER_PIXEL + 0.6 * Properties.ratioPercent())
    let config = {
        targets: corona,
        x: { value: endX, duration },
        onComplete: () => {
            tween.stop()
            corona.destroy()
        }
    }
    // Add Y tween if it is not zero
    if (yDelta) {
        config.y = {
            value: `-=${yDelta}`,
            duration: CORONA_Y_DURATION + 200 * Properties.ratioPercent(),
            ease: ease,
            yoyo: true,
            repeat: 3
        }
    }
    let tween = Properties.scene.tweens.add(config)
}

function startSyringeShooting() {
    // Set interval
    shootingInterval = Properties.scene.time.addEvent({
        delay: SYRINGE_INTERVAL,
        loop: true,
        callback: addSyringe,
        // Shoot immediately
        startAt: SYRINGE_INTERVAL
    })
}

function addOwlBaby(x, y) {
    if (!Properties.scene.anims.exists('3-owl-baby')) {
        Properties.scene.anims.create({
            key: '3-owl-baby',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl-baby', { start: 0, end: 2 }),
            frameRate: 5,
            repeat: -1
        })
    }

    let owlBaby = owlBabyGroup.create(x, y, '3-owl-baby').setScale(5)

    let { x: _x, y: _y, width, height } = Properties.scene.cameras.main.worldView
    let bounds = new Phaser.Geom.Rectangle(_x - 100, _y + 100, width, height)

    owlBaby.body
        .setSize(19, 12)
        .setOffset(0, 3, false)
        .setBoundsRectangle(bounds)


    owlBaby.setCollideWorldBounds(true)
    owlBaby.body.onWorldBounds = true

    owlBaby.setOrigin(0.5, 0).refreshBody()
    owlBaby.anims.play('3-owl-baby')
    addBounceTween(owlBaby)

    // Fly towards player
    let flipX = owlBaby.x < Properties.player.x

    if (flipX) {
        owlBaby.flipX = true
        owlBaby.setVelocityX(150)
    } else {
        owlBaby.setVelocityX(-150)
    }

    return owlBaby
}

function addSyringe() {
    if (!Properties.player.flipX) {
        // Set position and create
        let posX = Properties.player.x + 50, posY = Properties.player.y
        let syringe = Properties.scene.add.sprite(posX, posY, '7-syringe')
        // Add physics
        Properties.scene.physics.add.existing(syringe)
        // Refresh body
        syringe.body.setSize(syringe.width, syringe.height * 0.7)
        // Added to group
        syringeGroup.add(syringe)
        // Syringe speed per 100 pixels
        let distance = Properties.sceneSize.width * SYRINGE_DISTANCE_FROM_WIDTH
        // Add tween
        let tween = Properties.scene.tweens.add({
            targets: syringe,
            x: `+=${distance}`,
            duration: distance * SYRINGE_MS_PER_PIXEL,
            onComplete: function() {
                tween.stop()
                syringe.destroy()
            }
        })
    }
}

function finishGame() {
    // Wait, stop and start outro
    Properties.scene.time.delayedCall(600, () => {
        Properties.player.setVelocityX(0)
        playerSpriteStand()
    })
    // Show title
    // fadeInOutTitle('CONGRATULATIONS!', 200, 3000)
    // Firework play function
    let showFirework = firework => {
        firework.setAlpha(1)
        firework.anims.play(firework.name)
    }
    // Delayed calls
    Properties.scene.time.delayedCall(600, () => {
        showFirework(fireworks[0])
        AudioManager.play('fireworks')
    })
    Properties.scene.time.delayedCall(1800, () => showFirework(fireworks[1]))
    Properties.scene.time.delayedCall(1000, () => showFirework(fireworks[2]))
    // Wait and start outro
    Properties.scene.time.delayedCall(2000, () => Outro.start())
}


function processOwl(owlImage) {
    let {x, y} = owlImage
    owlImage.destroy()

    owl = Properties.scene.physics.add.sprite(x, y, '3-owl').setScale(5)

    owl.hp = 5

    let shakeConfig = { x: 0, y: 5, repeat: 4 }

    shakeConfig.onStart = () => {
        owlRecoverTimer = Properties.scene.time.addEvent({
            paused: true,
            delay: 4000,
            callback: () => {
                if (owl.hp <= 0)  return;
                Properties.scene.juice.shake(owl, {
                    onComplete: () => {
                        if (owl.hp <= 0)  return;
                        
                        owl.flipY = false
                        owl.anims.play('3-owl-fly-vertical-fast')
    
                        Properties.scene.time.delayedCall(500, () => {
                            owl.fly()
                        })
                    }
                })
            }
        })

        owl.flipY = true
        owl.anims.play('3-owl-hurt')
    }

    shakeConfig.onComplete = () => {
        owlRecoverTimer.paused = false
    }

    // Owl collides with the ground
    let foreground = Properties.map.getLayer('foreground').tilemapLayer
    owlGroundCollider = Properties.scene.physics.add.collider(owl, foreground, (o, f) => {
        Properties.scene.juice.shake(Properties.scene.cameras.main, shakeConfig)
        owlFlyTween.remove()
        owlShootTimer.paused = true
    })

    // Owl collides with player
    owlPlayerCollider = Properties.scene.physics.add.overlap(
        owl,
        Properties.player,
        (o, p) => {
            if (o.anims.isPlaying && getCurrentAnimKey(o) === '3-owl-hurt-fast') {
                // just bounce off if hit owl side while he's hurt (no damage to player)
                // Throw away player and play fall animation
                let velocityX = Properties.player.flipX ? (-100 * -1) : (-100 * 1)
                let velocityY = Constants.VELOCITY_Y_FROM_HEIGHT * p.displayHeight
                Properties.player.setVelocity(velocityX, velocityY)
                // Set jump animation
                playerSpriteJump()
                // Update state
                Properties.playerState.jumping = true
                return
            }
            if (o.anims.isPlaying && getCurrentAnimKey(o) === '3-owl-hurt') {

                if (o.body.touching.up && p.body.touching.down && !o.body.touching.left && !o.body.touching.right) {
                    let shakeYConfig = { x: 0, y: 5, repeat: 4 }
                    
                    Properties.scene.juice.shake(o, shakeYConfig)
                    
                    o.hp -= 1

                    if (navigator.vibrate) {

                        let vibe = []

                        for (var i = o.hp; i > 0; i--) {
                            vibe.push(100, 30)
                        }

                        window.navigator.vibrate(vibe)
                    } 

                    if (o.hp <= 0) {
                        owlRecoverTimer.remove()
                        owl.die()
                    }

                    // Jump
                    let velocityY = Constants.VELOCITY_Y_FROM_HEIGHT * p.displayHeight
                    p.setVelocityY(velocityY * 1.25)
                    // Set jump animation
                    playerSpriteJump()
                    // Update state
                    Properties.playerState.jumping = true
                
                } else {
                    // Disable input
                    Properties.inputEnabled = false

                    // just bounce off if hit owl side while he's hurt (no damage to player)
                    // Throw away player and play fall animation
                    let velocityX = Properties.player.flipX ? (-100 * -1) : (-100 * 1)
                    let velocityY = Constants.VELOCITY_Y_FROM_HEIGHT * p.displayHeight
                    Properties.player.setVelocity(velocityX * 3, velocityY)
                    // Set jump animation
                    playerSpriteJump()
                    // Update state
                    Properties.playerState.jumping = true

                    // Wait and enable input processing
                    Properties.scene.time.delayedCall(500, () => Properties.inputEnabled = true)
                }
            } else {
                hitPlayer()
                Properties.gameOver()
            }
        }
    )

    owl.die = () => {
        owl.flipY = false

        owl.anims.play('3-owl-hurt-fast')

        Properties.scene.tweens.add({
            targets: owl,
            y: homeWalls[0].getTopLeft().y,
            delay: 1000,
            duration: 750,
            onStart: () => {
                // let spinXConfig = { duration: 500, repeat: 3 }
                owl.setOrigin(0.5)
                let spinXConfig = { duration: 250, repeat: 11 }
                Properties.scene.juice.spinX(owl, true, spinXConfig)
            },
            onComplete: () => {
                owlBounceTween = addBounceTween(owl)

                owlFlyTween = Properties.scene.tweens.add({
                    targets: owl,
                    x: homeWalls[0].getTopLeft().x,
                    duration: 2000,
                    onComplete: () => {
                        owlBounceTween.remove()
                        owlGroundCollider.destroy()
                        Properties.scene.juice.shake(Properties.scene.cameras.main)
                        owl.flipY = true
                        owl.body.setAllowGravity(true)

                        homeWalls[0].body.enable = false
                    }
                })
            }
        })
    }

    owl.fly = () => {
        // flies up, then patrols back and forth
        Properties.scene.tweens.add({
            targets: owl,
            x: owlFlyX,
            y: owlFlyY,
            delay: 1000,
            duration: 750,
            onStart: () => { owl.anims.play('3-owl-fly-vertical') },
            onComplete: () => {

                owlShootTimer.paused = false

                owl.anims.play('3-owl-fly-horizontal')
                owlBounceTween = addBounceTween(owl)
                owlFlyTween = Properties.scene.tweens.add({
                    targets: owl,
                    x: owl.x - 500,
                    duration: 3000,
                    yoyo: true,
                    repeat: -1
                })
            }
        })
    }

    owl.groundPound = () => {
        owl.anims.play('3-owl-fly-horizontal-fast')

        owlBounceTween.remove()

        Properties.scene.time.delayedCall(500, () => {
            owl.body.setVelocityY(1200)
        })
    }

    owl.shoot = () => {
        let {x, y} = owl.getBottomCenter()

        let owlBabiesAlive = owlBabyGroup.getFirstAlive()

        if (owlBabiesAlive && Math.random() < 0.5) {
            owl.groundPound()

        } else {
            let egg = Properties.scene.physics.add.sprite(x, y, '3-owl-egg').setScale(5)
            egg.setOrigin(0.5, 0).refreshBody()
            egg.body.setVelocityY(200)
            // Egg collides with the ground
            let foreground = Properties.map.getLayer('foreground').tilemapLayer
            eggCollider = Properties.scene.physics.add.collider(egg, foreground, (egg, foreground) => {
                let {x, y} = egg.getTopCenter()
                addOwlBaby(x, y)
                egg.destroy()
                eggCollider.destroy()
            })
        }
    }

    // remove gravity
    owl.body.setAllowGravity(false)
    // Set origin
    owl.setOrigin(0, 1).refreshBody()

    // Create animations for the owl
    if (!Properties.scene.anims.exists('3-owl-fly-vertical')) {
        Properties.scene.anims.create({
            key: '3-owl-fly-vertical',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl-fly-vertical', { start: 1, end: 4 }),
            frameRate: 10,
            repeat: -1
        })
    }
    if (!Properties.scene.anims.exists('3-owl-fly-vertical-fast')) {
        Properties.scene.anims.create({
            key: '3-owl-fly-vertical-fast',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl-fly-vertical-fast', { start: 0, end: 9 }),
            frameRate: 15,
            repeat: -1
        })
    }
    if (!Properties.scene.anims.exists('3-owl')) {
        Properties.scene.anims.create({
            key: '3-owl',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl', { start: 0, end: 3 }),
            frameRate: 4,
            repeat: -1,
            yoyo: true
        })
    }
    if (!Properties.scene.anims.exists('3-owl-fly-horizontal')) {
        Properties.scene.anims.create({
            key: '3-owl-fly-horizontal',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl-fly-horizontal', { start: 1, end: 4 }),
            frameRate: 10,
            repeat: -1
        })
    }
    if (!Properties.scene.anims.exists('3-owl-fly-horizontal-fast')) {
        Properties.scene.anims.create({
            key: '3-owl-fly-horizontal-fast',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl-fly-horizontal-fast', { start: 1, end: 4 }),
            frameRate: 15,
            repeat: -1
        })
    }
    if (!Properties.scene.anims.exists('3-owl-hurt')) {
        Properties.scene.anims.create({
            key: '3-owl-hurt',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl-hurt', { start: 0, end: 3 }),
            frameRate: 10,
            repeat: -1
        })
    }
    if (!Properties.scene.anims.exists('3-owl-hurt-fast')) {
        Properties.scene.anims.create({
            key: '3-owl-hurt-fast',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl-hurt', { start: 0, end: 3 }),
            frameRate: 20,
            repeat: -1
        })
    }
    if (!Properties.scene.anims.exists('3-owl-wake')) {
        Properties.scene.anims.create({
            key: '3-owl-wake',
            frames: Properties.scene.anims.generateFrameNumbers('3-owl-fly-vertical', { start: 0, end: 0 }),
            frameRate: 10
        })
    }
    // Play animation
    owl.anims.play('3-owl')

    Properties.boss = owl
}


function processUfoShip(ufoImage) {
    // console.log(ufoImage)
    // Properties.physics.scene.add.existing(owlImage)

    addBounceTween(ufoImage)

    Properties.scene.tweens.add({
        targets: [ufoImage],
        x: ufoImage.x - 1197,
        duration: 1500,
        onComplete: () => {
            let {x, y} = ufoImage.getBottomCenter()
            processRay({
                x,
                y,
                name: '0-ray'
            })
        }
    })
}

function processRay(rayObject) {
    ray = Properties.scene.physics.add.sprite(rayObject.x, rayObject.y, rayObject.name).setOrigin(1, 0)

    ray.body.setAllowGravity(false)

    addBounceTween(ray)

    let angleToOwl = Phaser.Math.Angle.BetweenPoints(ray, owl)

    // set height to distance between owl and ufo


    // Fix position for the new origin
    ray.x += ray.width
    ray.y -= ray.height
    // Fix depth
    ray.setDepth(Constants.DEPTH.background)
    // Init animation and play
    Properties.scene.anims.create({
        key: 'o-ray',
        frames: Properties.scene.anims.generateFrameNumbers('o-ray', { start: 0, end: 3 }),
        // frames: 'o-ray',
        frameRate: 10,
        repeat: -1
    })
    ray.anims.play('o-ray')
    // Hide
    // ray.alpha = 0
    ray.alpha = 1


    ray.angle = ray.angle - 1.5


    Properties.scene.tweens.add({
        targets: ray,
        angle: ray.angle + 5,
        scale: ray.scale * 1.2,
        duration: 3000,
        yoyo: true,
        ease: 'Sine.easeInOut',
        loop: -1
    })
}
