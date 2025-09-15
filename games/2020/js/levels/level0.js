import AudioManager from '../audio.js'
import Constants from '../constants.js'
import Properties from '../properties.js'
import { fadeInOutTitle, playerSpriteThrow } from '../helpers.js'

// Additional processing of sprites from tilemap
const PROCESSING = {
    '0-ball': saveBall,
    '0-claire': saveClaire,
    '0-candle': updateCandle,
}

// Tennis ball sprite
let ball
// Claire sprite
let claire


export default {
    preloadLevel: function() {
        Properties.map.getObjectLayer('level0').objects.forEach(image => {
            let sprite = Properties.addMapImage(image)

            if (image.name in PROCESSING)  PROCESSING[image.name](sprite)
        })
        // Intro music
        AudioManager.base.intro = Properties.scene.sound.add('intro', { loop: true })
    },
    checkpoint0: function() {
        // Set initial checkpoint
        Properties.checkpoint = 0
        // Play theme
        AudioManager.fadeIn('intro', Constants.VOLUME.intro)
        // Yandex.Metrika
        ym(70640851, 'reachGoal', 'CHECKPOINT_0')
    },
    addBird: function() {
        // Add bird to a distance from player's position
        let initialY = Properties.sceneSize.height * 0.2
        let initialX = Properties.player.x + Properties.sceneSize.width
        let bird = Properties.scene.add.sprite(initialX, initialY, '0-bird').setScale(2)
        // Create animation for the bird
        if (!Properties.scene.anims.exists('0-bird')) {
            Properties.scene.anims.create({
                key: '0-bird',
                frames: Properties.scene.anims.generateFrameNumbers('0-bird', { start: 0, end: 3 }),
                frameRate: 10,
                repeat: -1
            })
        }
        // Play animation
        bird.anims.play('0-bird')
        // Add tween
        let tween = Properties.scene.tweens.add({
            targets: bird,
            x: Properties.player.x - Properties.sceneSize.width * 0.2,
            y: { value: Properties.sceneSize.height * 0.1, ease: 'Cubic.easeInOut' },
            duration: Constants.DURATION.bird,
            onComplete: () => {
                // Destroy bird and animation, stop tween
                bird.destroy()
                tween.stop()
            }
        })
    },
    showTitle: function() {
        fadeInOutTitle('2019')
    },
    throwBall: function() {
        // Get control
        Properties.takeControl()

        Properties.scene.time.delayedCall(500, () => {
            ball.destroy()
            
            playerSpriteThrow()

            Properties.scene.time.delayedCall(500, () => {
                Properties.giveControl()
                // Play animation
                claire.anims.play('0-claire');
                // Move Claire to the right
                claire.body.setVelocityX(600)
            })
        })
    }
}

function saveBall(sprite) {
    ball = sprite
}

function saveClaire(image) {
    let {x,y} = image
    image.destroy()
    claire = Properties.scene.physics.add.sprite(x, y, '0-claire')
    // Set colliding with world bounds
    claire.setCollideWorldBounds(true)
    // Claire collides with the ground
    let foreground = Properties.map.getLayer('foreground').tilemapLayer
    Properties.scene.physics.add.collider(claire, foreground)
    // Set origin and refresh body
    claire.setOrigin(0, 1).refreshBody()
    // Resize
    claire.setScale(3)
    // Flip horizontally
    claire.flipX = true
    // Create animation for Claire
    if (!Properties.scene.anims.exists('0-claire')) {
        Properties.scene.anims.create({
            key: '0-claire',
            frames: Properties.scene.anims.generateFrameNumbers('0-claire', { start: 1, end: 2 }),
            frameRate: 5,
            repeat: -1
        })
    }
}
function updateCandle( candleImage ) {
    let {x, y}          = candleImage
    let candleSprite    = Properties.scene.physics.add.sprite( x, y, '0-candle' )
    candleImage.destroy()
    // Set origin and refresh body
    candleSprite.setOrigin( 0, 1 ).refreshBody()
    candleSprite.body.setAllowGravity( false )
    candleSprite.anims.create({
        key: '0-candle.default',
        frames: Properties.scene.anims.generateFrameNumbers( '0-candle', {start: 4, end: 4} ),
        frameRate: 1
    })
    candleSprite.anims.create({
        key: '0-candle.burn',
        frames: Properties.scene.anims.generateFrameNumbers( '0-candle', {start: 0, end: 3} ),
        frameRate: 10,
        repeat: -1
    })
    candleSprite.play( '0-candle.default' )

    Properties.candle  = candleSprite
}