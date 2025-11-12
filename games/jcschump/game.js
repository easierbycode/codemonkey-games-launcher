class GameState {
    constructor() {
        this.score = 0;
        this.level = 1;
        this.difficulty = 1;
        this.lives = 3;
        this.killsInLevel = 0;
        this.killsRequiredForBoss = 30;
        this.isBossFight = false;
        this.bossHealth = 0;
        this.maxBossHealth = 0;
        this.lastExtraLifeScore = 0;
        this.nextLifeRequirement = 2500;  // Initial requirement
        this.powerUps = {
            doubleScore: 0,
            speedBoost: 0,
            shield: 0,
            rapidFire: 0,
            multiShot: 0
        };
        this.achievements = [];
        this.enemySpeed = 3;
        this.isGiantMode = false;
        this.isSpaceInvaderLevel = false;
        
        // Tutorial state
        this.isTutorial = true;
        this.tutorialStep = 0;
        this.tutorialComplete = false;
        
        // Permanent power-ups
        this.permanentPowerUps = {
            doubleBullets: false,
            tripleShot: false,
            wideShot: false,
            rapidFire: false
        };
        
        // Enemy progression
        this.enemyBaseSpeed = 3;
        this.enemySpeedMultiplier = 1;
    }

    addScore(points) {
        this.score += points;
        
        // Check for extra life with increasing requirements
        if (this.score >= this.nextLifeRequirement) {
            this.lives++;
            this.lastExtraLifeScore = this.score;
            this.nextLifeRequirement *= 2;  // Double points needed for next life
            
            // Create visual cue for extra life
            const gameCanvas = document.getElementById('game-canvas');
            const notification = document.createElement('div');
            notification.textContent = 'Extra Life!';
            notification.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #4CAF50;
                font-size: 24px;
                font-weight: bold;
                animation: fadeOut 2s forwards;
            `;
            gameCanvas.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
        }
        
        this.checkLevelUp();
        this.updateUI();
    }

    checkLevelUp() {
        // Remove the automatic level up based on score
        // Now levels progress based on killing the boss
        if (this.isBossFight) {
            return;
        }

        // Check if we've killed enough enemies to trigger boss
        if (this.killsInLevel >= this.killsRequiredForBoss) {
            this.startBossFight();
        }
    }

    startBossFight() {
        this.isBossFight = true;
        this.bossHealth = 100 * this.level; // Boss health scales with level
        this.maxBossHealth = this.bossHealth;
        this.showBossWarning();
    }

    showBossWarning() {
        const gameCanvas = document.getElementById('game-canvas');
        const warning = document.createElement('div');
        warning.textContent = 'WARNING: BOSS APPROACHING';
        warning.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #FF0000;
            font-size: 36px;
            font-weight: bold;
            text-shadow: 0 0 10px #FF0000;
            animation: flash 1s infinite;
        `;
        gameCanvas.appendChild(warning);
        
        setTimeout(() => {
            warning.remove();
            window.gameInstance.spawnBoss();
        }, 3000);
    }

    completeBossFight() {
        this.isBossFight = false;
        this.level++;
        this.killsInLevel = 0;
        this.killsRequiredForBoss = Math.min(50, 30 + (this.level - 1) * 5);
        this.difficulty *= 1.2;
        this.showLevelComplete();
    }

    showLevelComplete() {
        const gameCanvas = document.getElementById('game-canvas');
        const complete = document.createElement('div');
        complete.textContent = `LEVEL ${this.level - 1} COMPLETE!`;
        complete.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: #FFD700;
            font-size: 36px;
            font-weight: bold;
            text-shadow: 0 0 10px #FFD700;
        `;
        gameCanvas.appendChild(complete);
        setTimeout(() => complete.remove(), 3000);
    }

    showLevelAnnouncement() {
        const gameCanvas = document.getElementById('game-canvas');
        const announcement = document.createElement('div');
        announcement.textContent = `STAGE ${this.level}`;
        announcement.style.cssText = `
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            color: #FFD700;
            font-size: 32px;
            font-weight: bold;
            text-shadow: 0 0 10px #FFD700;
            pointer-events: none;
            top: -60px;
            transition: top 3s ease-in;
        `;
        
        gameCanvas.appendChild(announcement);
        
        setTimeout(() => {
            announcement.style.top = gameCanvas.clientHeight + 'px';
        }, 100);

        setTimeout(() => {
            announcement.remove();
        }, 3100);
    }

    showSpaceInvaderAnnouncement() {
        const gameCanvas = document.getElementById('game-canvas');
        const announcement = document.createElement('div');
        announcement.textContent = 'BONUS LEVEL!';
        announcement.style.cssText = `
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            color: #FF4081;
            font-size: 32px;
            font-weight: bold;
            text-shadow: 0 0 10px #FF4081;
            pointer-events: none;
            top: -60px;
            transition: top 2s ease-in;
        `;
        
        gameCanvas.appendChild(announcement);
        setTimeout(() => {
            announcement.style.top = gameCanvas.clientHeight + 'px';
        }, 100);
        setTimeout(() => announcement.remove(), 2100);
    }

    loseLife() {
        this.lives--;
        // Reset temporary power-ups on death
        this.resetTemporaryPowerUps();
        this.updateUI();
        return this.lives <= 0;
    }

    updateUI() {
        document.getElementById('score').textContent = `Score: ${this.score}`;
        document.getElementById('level').textContent = `Level: ${this.level}`;
        document.getElementById('lives').textContent = `Lives: ${this.lives}`;
    }

    startTutorial() {
        const messages = [
            "Use Arrow Keys to Move",
            "Press Space to Shoot",
            "Destroy the Enemy to Continue",
            "Collect Power-ups to Upgrade Your Ship",
            "Power-ups Last Until Death",
            "Watch Out for Pink Enemies - They Shoot Back!",
            "Ready for Your First Boss?"
        ];

        this.showTutorialMessage(messages[this.tutorialStep]);
    }

    showTutorialMessage(message) {
        const gameCanvas = document.getElementById('game-canvas');
        const tutorialBox = document.createElement('div');
        tutorialBox.style.cssText = `
            position: absolute;
            top: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 15px 25px;
            border-radius: 10px;
            border: 2px solid #4CAF50;
            font-size: 20px;
            text-align: center;
            z-index: 1000;
        `;
        tutorialBox.textContent = message;
        gameCanvas.appendChild(tutorialBox);
        
        setTimeout(() => tutorialBox.remove(), 4000);
    }

    advanceTutorial() {
        this.tutorialStep++;
        if (this.tutorialStep >= 7) {
            this.completeTutorial();
        } else {
            this.startTutorial();
        }
    }

    completeTutorial() {
        this.isTutorial = false;
        this.tutorialComplete = true;
        this.showTutorialMessage("Tutorial Complete! Good Luck!");
    }

    resetTemporaryPowerUps() {
        // Keep permanent power-ups, reset temporary ones
        window.gameInstance.doubleBullets = this.permanentPowerUps.doubleBullets;
        window.gameInstance.tripleShot = this.permanentPowerUps.tripleShot;
        window.gameInstance.wideShot = this.permanentPowerUps.wideShot;
        window.gameInstance.rapidFire = this.permanentPowerUps.rapidFire;
    }
}

class Game {
    constructor() {
        // Initialize audio context
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        window.gameInstance = this;
        
        // Load background music
        this.bgm = new Audio('bgm.mp3');
        this.bgm.loop = true;
        
        this.showTitleScreen();
        this.powerUps = [];
        this.doubleBullets = false;
        this.stars = [];
        this.lastStarTime = 0;
        this.ufo = null;
        this.ufoHits = 0;
        this.lastUfoTime = 0;
        this.companionShip = null;
        this.invaderDirection = 1;
        this.invaderStepDown = false;
        this.rainbowInterval = null;
        this.tripleShot = false;
        this.wideShot = false;
        this.rapidFire = false;
        this.shootingInterval = 125; // Base shooting interval
    }

    createPlayer() {
        const player = document.createElement('div');
        player.className = 'player';
        player.style.cssText = `
            left: 100px;
            top: 300px;
            width: 40px;
            height: 50px;
            background-image: url('ship.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            position: absolute;
        `;
        this.canvas.appendChild(player);
        return player;
    }

    startNewGame() {
        // Clear everything first
        this.clearGame();
        
        // Start playing background music
        this.bgm.currentTime = 0;
        this.bgm.play().catch(e => console.log('BGM autoplay prevented:', e));
        
        // Initialize fresh game state
        this.gameState = new GameState();
        this.gameState.updateUI();
        
        // Setup game elements
        this.canvas = document.getElementById('game-canvas');
        this.player = this.createPlayer();
        this.bullets = [];
        this.enemies = [];
        this.isShooting = false;
        this.touchPos = null;
        this.lastShotTime = 0;
        this.invulnerable = false;

        // Setup new event listeners
        this.setupEventListeners();
        
        // Start fresh game loop
        this.startGameLoop();
        
        // Start tutorial if it's the first level
        if (this.gameState.isTutorial) {
            this.gameState.startTutorial();
            this.setupTutorialLevel();
        }
    }

    clearGame() {
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
        
        // Stop background music
        this.bgm.pause();
        
        const canvas = document.getElementById('game-canvas');
        canvas.innerHTML = '';
        
        // Remove all event listeners
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        
        // Reset UI
        document.getElementById('score').textContent = 'Score: 0';
        document.getElementById('level').textContent = 'Level: 1';
        document.getElementById('lives').textContent = 'Lives: 3';
        this.stars.forEach(star => star.element.remove());
        this.stars = [];
    }

    // Add this new method to create explosion sound
    playExplosionSound() {
        const oscillator1 = this.audioContext.createOscillator();
        const oscillator2 = this.audioContext.createOscillator();
        const noiseBuffer = this.createNoiseBuffer();
        const noiseNode = this.audioContext.createBufferSource();
        
        const gainNode1 = this.audioContext.createGain();
        const gainNode2 = this.audioContext.createGain();
        const noiseGain = this.audioContext.createGain();
        
        oscillator1.connect(gainNode1);
        oscillator2.connect(gainNode2);
        noiseNode.connect(noiseGain);
        gainNode1.connect(this.audioContext.destination);
        gainNode2.connect(this.audioContext.destination);
        noiseGain.connect(this.audioContext.destination);
        
        oscillator1.type = 'square';
        oscillator2.type = 'sawtooth';
        noiseNode.buffer = noiseBuffer;
        
        oscillator1.frequency.setValueAtTime(50, this.audioContext.currentTime); // Lower frequency
        oscillator2.frequency.setValueAtTime(25, this.audioContext.currentTime); // Even lower
        
        oscillator1.frequency.exponentialRampToValueAtTime(20, this.audioContext.currentTime + 0.2);
        oscillator2.frequency.exponentialRampToValueAtTime(10, this.audioContext.currentTime + 0.2);
        
        gainNode1.gain.setValueAtTime(0.5, this.audioContext.currentTime); // Increased gain
        gainNode2.gain.setValueAtTime(0.4, this.audioContext.currentTime);
        noiseGain.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        
        gainNode1.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);
        
        oscillator1.start();
        oscillator2.start();
        noiseNode.start();
        
        oscillator1.stop(this.audioContext.currentTime + 0.2);
        oscillator2.stop(this.audioContext.currentTime + 0.2);
        noiseNode.stop(this.audioContext.currentTime + 0.2);
    }

    // Add helper method for creating noise
    createNoiseBuffer() {
        const bufferSize = this.audioContext.sampleRate * 0.15;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        return buffer;
    }

    showTitleScreen() {
        // Clear everything
        if (this.gameLoop) {
            clearInterval(this.gameLoop);
            this.gameLoop = null;
        }
        
        // Reset all game elements
        this.bullets = [];
        this.enemies = [];
        this.isShooting = false;
        this.touchPos = null;
        this.lastShotTime = 0;
        this.invulnerable = false;
        
        // Clear all event listeners
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        
        // Reset UI
        document.getElementById('score').textContent = 'Score: 0';
        document.getElementById('level').textContent = 'Level: 1';
        document.getElementById('lives').textContent = 'Lives: 3';
        
        // Clear canvas
        const canvas = document.getElementById('game-canvas');
        canvas.innerHTML = '';
        
        // Create and show title screen
        const titleScreen = document.createElement('div');
        titleScreen.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
        `;
        titleScreen.innerHTML = `
            <h1>Bad Ass Space Shmup</h1>
            <button id="startButton" style="
                padding: 10px 20px;
                font-size: 20px;
                background-color: #e94560;
                color: white;
                border: none;
                cursor: pointer;
                margin-top: 20px;
            ">Start Game</button>
        `;
        
        canvas.appendChild(titleScreen);
        
        // Add start button listener
        document.getElementById('startButton').onclick = () => {
            // Create completely new game instance
            window.gameInstance = new Game();
            window.gameInstance.startNewGame();
        };
    }

    setupEventListeners() {
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.touchPos = { x: touch.clientX, y: touch.clientY };
            this.isShooting = true;
        }, { passive: false });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.touchPos = { x: touch.clientX, y: touch.clientY };
            this.updatePlayerPosition();
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.isShooting = false;
            this.touchPos = null;
        }, { passive: false });

        // Fix keyboard controls with proper boundary calculations
        window.addEventListener('keydown', (e) => {
            const playerRect = this.player.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            const speed = 20;

            switch(e.key) {
                case 'ArrowLeft':
                    this.player.style.left = `${Math.max(0, playerRect.left - canvasRect.left - speed)}px`;
                    break;
                case 'ArrowRight':
                    this.player.style.left = `${Math.min(canvasRect.width - playerRect.width, playerRect.left - canvasRect.left + speed)}px`;
                    break;
                case 'ArrowUp':
                    this.player.style.top = `${Math.max(0, playerRect.top - canvasRect.top - speed)}px`;
                    break;
                case 'ArrowDown':
                    this.player.style.top = `${Math.min(canvasRect.height - playerRect.height, playerRect.top - canvasRect.top + speed)}px`;
                    break;
                case ' ': // Spacebar
                    this.isShooting = true;
                    break;
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.key === ' ') { // Spacebar
                this.isShooting = false;
            }
        });
    }

    updatePlayerPosition() {
        if (!this.touchPos) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const x = Math.max(0, Math.min(this.touchPos.x - rect.left - 20, this.canvas.clientWidth - 40));
        const y = Math.max(0, Math.min(this.touchPos.y - rect.top - 25, this.canvas.clientHeight - 50));
        
        this.player.style.left = `${x}px`;
        this.player.style.top = `${y}px`;
    }

    createBullet(offsetX = 0) {
        const bullet = document.createElement('div');
        bullet.className = 'bullet';
        const playerRect = this.player.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
    
        const playerCenterX = playerRect.left - canvasRect.left + (playerRect.width / 2);
    
        bullet.style.cssText = `
            position: absolute;
            width: 6px;
            height: 15px;
            background-color: #00ff00;
            border-radius: 3px;
            left: ${playerCenterX + offsetX}px;
            top: ${playerRect.top - canvasRect.top}px;
        `;
    
        this.canvas.appendChild(bullet);
        return bullet;
    }
    

    createEnemy() {
        const enemy = document.createElement('div');
        enemy.className = 'enemy';
        enemy.style.left = `${Math.random() * (this.canvas.clientWidth - 30)}px`;
        enemy.style.top = '-30px';
        enemy.dataset.id = Date.now();
        enemy.dataset.hasFired = 'false';
        enemy.dataset.type = 'triangle';
        this.canvas.appendChild(enemy);
        return enemy;
    }

    checkCollision(elem1, elem2) {
        const rect1 = elem1.getBoundingClientRect();
        const rect2 = elem2.getBoundingClientRect();
        return !(
            rect1.right < rect2.left ||
            rect1.left > rect2.right ||
            rect1.bottom < rect2.top ||
            rect1.top > rect2.bottom
        );
    }
    
    

    createParticleExplosion(x, y) {
        const particleCount = 12;
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.style.cssText = `
                position: absolute;
                width: 6px;
                height: 6px;
                background-color: #4CAF50;
                border-radius: 50%;
                left: ${x}px;
                top: ${y}px;
                pointer-events: none;
            `;
            
            // Random angle and speed for chaotic movement
            const angle = Math.random() * Math.PI * 2;
            const speed = 3 + Math.random() * 7; // Random speed between 3 and 10
            const velocity = {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            };
            
            this.canvas.appendChild(particle);
            particles.push({ 
                element: particle, 
                velocity,
                life: 1 + Math.random() * 0.5 // Random lifetime
            });
        }

        const animateParticles = () => {
            particles.forEach((particle, index) => {
                particle.life -= 0.02;
                
                if (particle.life <= 0) {
                    particle.element.remove();
                    particles.splice(index, 1);
                    return;
                }

                const currentLeft = parseFloat(particle.element.style.left);
                const currentTop = parseFloat(particle.element.style.top);
                
                particle.element.style.left = `${currentLeft + particle.velocity.x}px`;
                particle.element.style.top = `${currentTop + particle.velocity.y}px`;
                particle.element.style.opacity = particle.life;
                
                // Add rotation for more dynamic effect
                particle.element.style.transform = `rotate(${currentTop * 2}deg)`;
            });

            if (particles.length > 0) {
                requestAnimationFrame(animateParticles);
            }
        };

        requestAnimationFrame(animateParticles);
    }

    playerHit() {
        if (this.invulnerable) return;
        
        // Vibrate if supported (200ms vibration)
        if ('vibrate' in navigator) {
            navigator.vibrate(200);
        }
        
        // Create explosion at player position
        const playerRect = this.player.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
        this.createPlayerExplosion(
            playerRect.left - canvasRect.left + playerRect.width / 2,
            playerRect.top - canvasRect.top + playerRect.height / 2
        );
        
        // Shake screen
        this.shakeScreen();
        
        this.invulnerable = true;
        this.player.style.visibility = 'hidden';
        
        const isGameOver = this.gameState.loseLife();
        if (isGameOver) {
            // Simply reload the page instead of showing title screen
            window.location.reload();
            return;
        }

        // Show player after short delay
        setTimeout(() => {
            this.player.style.visibility = 'visible';
            
            // Start flashing
            let flashCount = 0;
            const flashInterval = setInterval(() => {
                this.player.style.visibility = this.player.style.visibility === 'hidden' ? 'visible' : 'hidden';
                flashCount++;
                if (flashCount >= 10) { // 5 full flashes (10 toggles)
                    clearInterval(flashInterval);
                    this.player.style.visibility = 'visible';
                }
            }, 250); // Flash every 250ms
            
            // End invulnerability after 2.5 seconds
            setTimeout(() => {
                this.invulnerable = false;
                clearInterval(flashInterval);
                this.player.style.visibility = 'visible';
            }, 2500);
        }, 500); // Show player after 500ms
    }

    createShooterEnemy() {
        const enemy = document.createElement('div');
        enemy.className = 'shooter-enemy';
        enemy.dataset.direction = Math.random() < 0.5 ? '1' : '-1'; // Random direction
        enemy.style.left = enemy.dataset.direction === '1' ? '-30px' : `${this.canvas.clientWidth + 30}px`;
    
        // Restrict vertical spawn to above halfway point
        const canvasHeight = this.canvas.clientHeight;
        const maxY = canvasHeight / 2; // Halfway point
        enemy.style.top = `${Math.random() * maxY}px`;
    
        this.canvas.appendChild(enemy);
        return enemy;
    }
    
    

    createEnemyBullet(x, y) {
        const bullet = document.createElement('div');
        bullet.className = 'enemy-bullet flashing';
        bullet.style.left = `${x}px`;
        bullet.style.top = `${y}px`;
        this.canvas.appendChild(bullet);
        
        // Return bullet with downward-only velocity
        return {
            element: bullet,
            velocity: {
                x: 0,  // No horizontal movement
                y: 7   // Only move downward
            }
        };
    }

    createEnemyProjectile(enemy) {
        const enemyRect = enemy.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
    
        const bullet = document.createElement('div');
        bullet.className = 'enemy-bullet';
        bullet.style.cssText = `
            position: absolute;
            width: 8px;
            height: 16px;
            background-color: #ff4081; /* Pink color */
            border-radius: 4px;
            left: ${enemyRect.left - canvasRect.left + enemyRect.width / 2 - 4}px;
            top: ${enemyRect.top - canvasRect.top + enemyRect.height}px;
        `;
    
        this.canvas.appendChild(bullet);
    
        // Add to enemy bullets array with downward velocity
        this.enemyBullets.push({
            element: bullet,
            velocity: { x: 0, y: 5 }, // Downward movement
        });
    }
    
    handlePowerUpCollection(powerUp) {
        switch (powerUp.type) {
            case 'double':
                this.doubleBullets = true;
                // Disable power-up after 10 seconds
                setTimeout(() => {
                    this.doubleBullets = false;
                }, 10000);
                break;
            case 'companion':
                this.createCompanionShip();
                break;
        }
    }

    spawnPowerUp(x, y) {
        const availablePowerUps = ['double', 'companion'];
    
        // Filter out power-ups the player already has
        const activePowerUps = [];
        if (this.doubleBullets) activePowerUps.push('double');
        if (this.companionShip) activePowerUps.push('companion');
    
        const possiblePowerUps = availablePowerUps.filter((type) => !activePowerUps.includes(type));
    
        // If no power-ups can be dropped, return
        if (possiblePowerUps.length === 0) return;
    
        // Randomly choose a power-up from the remaining options
        const chosenPowerUp = possiblePowerUps[Math.floor(Math.random() * possiblePowerUps.length)];
    
        // Create and position the power-up
        const powerUp = document.createElement('div');
        powerUp.className = `power-up ${chosenPowerUp}-powerup`;
        powerUp.dataset.type = chosenPowerUp;
        powerUp.style.cssText = `
            position: absolute;
            width: 20px;
            height: 20px;
            background-color: ${chosenPowerUp === 'double' ? '#FFD700' : '#4CAF50'};
            border-radius: 50%;
            left: ${x}px;
            top: ${y}px;
        `;
    
        this.canvas.appendChild(powerUp);
    
        // Add to power-ups array
        this.powerUps.push({
            element: powerUp,
            type: chosenPowerUp,
        });
    }
    
    

    startGameLoop() {
        this.enemyBullets = [];
    
        this.gameLoop = setInterval(() => {
            this.updatePlayerPosition();
    
            // Update companion ship movement
            this.updateCompanionShip();
    
            // Player shooting logic
            if (this.isShooting && Date.now() - this.lastShotTime > this.shootingInterval) {
                this.shoot();
                this.lastShotTime = Date.now();
            }
    
            // Update player bullets
            this.bullets.forEach((bullet, bulletIndex) => {
                const currentTop = parseFloat(bullet.style.top);
                bullet.style.top = `${currentTop - 10}px`; // Move bullet upward
    
                // Remove bullets that go off-screen
                if (currentTop < -10) {
                    bullet.remove();
                    this.bullets.splice(bulletIndex, 1);
                    return;
                }
    
                // Check for collisions with enemies
                this.enemies.forEach((enemy, enemyIndex) => {
                    if (this.checkCollision(bullet, enemy)) {
                        // Create explosion effect
                        const enemyRect = enemy.getBoundingClientRect();
                        const canvasRect = this.canvas.getBoundingClientRect();
                        this.createParticleExplosion(
                            enemyRect.left - canvasRect.left + enemyRect.width / 2,
                            enemyRect.top - canvasRect.top + enemyRect.height / 2
                        );
    
                        // Remove bullet and enemy
                        bullet.remove();
                        this.bullets.splice(bulletIndex, 1);
                        enemy.remove();
                        this.enemies.splice(enemyIndex, 1);
    
                        // Add score
                        this.gameState.addScore(100);
                        this.gameState.killsInLevel++;
    
                        // Randomly spawn a power-up
                        if (Math.random() < 0.2) { // 20% chance to spawn a power-up
                            this.spawnPowerUp(
                                enemyRect.left - canvasRect.left,
                                enemyRect.top - canvasRect.top
                            );
                        }
    
                        return; // Exit loop for this enemy
                    }
                });
    
                // Check for collisions with the boss
                if (this.boss && this.gameState.isBossFight) {
                    if (this.checkCollision(bullet, this.boss)) {
                        const bossRect = this.boss.getBoundingClientRect();
                        const canvasRect = this.canvas.getBoundingClientRect();
                        this.createParticleExplosion(
                            bossRect.left - canvasRect.left + Math.random() * bossRect.width,
                            bossRect.top - canvasRect.top + Math.random() * bossRect.height
                        );
    
                        bullet.remove();
                        this.bullets.splice(bulletIndex, 1);
    
                        // Damage the boss
                        this.gameState.bossHealth -= 1;
                        this.bossHealthBar.style.width = `${(this.gameState.bossHealth / this.gameState.maxBossHealth) * 100}%`;
    
                        // Check if boss is defeated
                        if (this.gameState.bossHealth <= 0) {
                            this.defeatBoss();
                        }
    
                        return; // Exit loop for this bullet
                    }
                }
            });
    
            // Update enemy bullets
            this.enemyBullets.forEach((bullet, bulletIndex) => {
                const currentLeft = parseFloat(bullet.element.style.left);
                const currentTop = parseFloat(bullet.element.style.top);
    
                bullet.element.style.left = `${currentLeft + bullet.velocity.x}px`;
                bullet.element.style.top = `${currentTop + bullet.velocity.y}px`; // Move bullet in its velocity direction
    
                // Remove bullets that are off-screen
                if (
                    currentTop > this.canvas.clientHeight ||
                    currentTop < 0 ||
                    currentLeft > this.canvas.clientWidth ||
                    currentLeft < 0
                ) {
                    bullet.element.remove();
                    this.enemyBullets.splice(bulletIndex, 1);
                    return;
                }
    
            });
    
            // Update power-ups
            this.powerUps.forEach((powerUp, powerUpIndex) => {
                const currentTop = parseFloat(powerUp.element.style.top);
    
                // Move power-up downward
                powerUp.element.style.top = `${currentTop + 2}px`;
    
                // Remove power-ups that go off-screen
                if (currentTop > this.canvas.clientHeight + 20) {
                    powerUp.element.remove();
                    this.powerUps.splice(powerUpIndex, 1);
                    return;
                }
    
                // Check collision with player
                if (this.checkCollision(this.player, powerUp.element)) {
                    this.handlePowerUpCollection(powerUp);
                    powerUp.element.remove();
                    this.powerUps.splice(powerUpIndex, 1);
                }
            });
    
            // Boss shooting logic
            if (this.boss && this.gameState.isBossFight) {
                if (Math.random() < 0.02) {
                    this.createBossBullet();
                }
            }
    
            // Update enemies
            if (!this.gameState.isBossFight && Math.random() < 0.03) {
                if (Math.random() < 0.3) {
                    this.enemies.push(this.createShooterEnemy());
                } else {
                    this.enemies.push(this.createEnemy());
                }
            }
    
            this.enemies.forEach((enemy, enemyIndex) => {
                const currentLeft = parseInt(enemy.style.left);
                const currentTop = parseInt(enemy.style.top);
                const isShooter = enemy.className === 'shooter-enemy';
    
                if (isShooter) {
                    const direction = parseInt(enemy.dataset.direction) || 1;
                    const speed = 3 * this.gameState.difficulty;
                    enemy.style.left = `${currentLeft + direction * speed}px`;
    
                    if (!enemy.dataset.hasFired || enemy.dataset.hasFired === 'false') {
                        if (Math.random() < 0.01) {
                            this.createEnemyProjectile(enemy);
                            enemy.dataset.hasFired = 'true';
                            setTimeout(() => (enemy.dataset.hasFired = 'false'), 2000); // Cooldown
                        }
                    }
    
                    if (currentLeft < -30 || currentLeft > this.canvas.clientWidth + 30) {
                        enemy.remove();
                        this.enemies.splice(enemyIndex, 1);
                    }
                } else {
                    enemy.style.top = `${currentTop + 2 * this.gameState.difficulty}px`;
    
                    if (currentTop > this.canvas.clientHeight + 30) {
                        enemy.remove();
                        this.enemies.splice(enemyIndex, 1);
                    }
                }

                if (this.checkCollision(this.player, enemy)) {
                    this.playerHit();
                    enemy.remove();
                    this.enemies.splice(enemyIndex, 1);
                }
            });
    

                // Update boss position
                this.updateBoss();
            }, 1000 / 60);
    
            
    
        
    }
    
    
    
    
    
    
    
    
    

    shakeScreen(intensity = 20, duration = 500) {
        const gameContainer = document.getElementById('game-container');
        let start = null;
        
        const shake = (timestamp) => {
            if (!start) start = timestamp;
            const progress = timestamp - start;
            
            if (progress < duration) {
                const x = Math.random() * intensity - intensity / 2;
                const y = Math.random() * intensity - intensity / 2;
                gameContainer.style.transform = `translate(${x}px, ${y}px)`;
                requestAnimationFrame(shake);
            } else {
                gameContainer.style.transform = 'translate(0, 0)';
            }
        };
        
        requestAnimationFrame(shake);
    }

    createPlayerExplosion(x, y) {
        const particleCount = 20;  // More particles for player explosion
        const particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            let particle = document.createElement('div');
            particle.style.cssText = `
                position: absolute;
                width: 8px;
                height: 8px;
                background-color: #e94560;
                border-radius: 50%;
                left: ${x}px;
                top: ${y}px;
                pointer-events: none;
            `;
            
            const angle = (i / particleCount) * Math.PI * 2;
            const speed = 3 + Math.random() * 3;  // Randomized speed
            const velocity = {
                x: Math.cos(angle) * speed,
                y: Math.sin(angle) * speed
            };
            
            this.canvas.appendChild(particle);
            particles.push({ element: particle, velocity, life: 1 });
        }

        const animateParticles = () => {
            particles.forEach((particle, index) => {
                particle.life -= 0.02;
                particle.velocity.y += 0.1; // Add gravity effect
                
                if (particle.life <= 0) {
                    particle.element.remove();
                    particles.splice(index, 1);
                    return;
                }

                const currentLeft = parseFloat(particle.element.style.left);
                const currentTop = parseFloat(particle.element.style.top);
                
                particle.element.style.left = `${currentLeft + particle.velocity.x}px`;
                particle.element.style.top = `${currentTop + particle.velocity.y}px`;
                particle.element.style.opacity = particle.life;
            });

            if (particles.length > 0) {
                requestAnimationFrame(animateParticles);
            }
        };

        requestAnimationFrame(animateParticles);
    }

    createPowerUp(type = 'double') {
        const powerUp = document.createElement('div');
        powerUp.className = `power-up ${type}-powerup`;
        powerUp.dataset.type = type;
        powerUp.style.left = `${Math.random() * (this.canvas.clientWidth - 20)}px`;
        powerUp.style.top = '-20px';
        this.canvas.appendChild(powerUp);
        return powerUp;
    }
    

    createStar() {
        const star = document.createElement('div');
        const isColoredStar = Math.random() < 0.15; // 15% chance for colored star
        const color = isColoredStar ? 
            '#FFD700' : // All colored stars are now yellow (FFD700)
            'rgba(255, 255, 255, 0.8)';
        
        star.style.cssText = `
            position: absolute;
            width: 2px;
            height: 2px;
            background-color: ${color};
            border-radius: 50%;
            pointer-events: none;
            left: ${Math.random() * this.canvas.clientWidth}px;
            top: -5px;
        `;
        this.canvas.appendChild(star);
        return {
            element: star,
            speed: 1 + Math.random() * 2,
            opacity: 0.3 + Math.random() * 0.7
        };
    }

    updateStars() {
        // Create new stars less frequently (every 100ms instead of 50ms)
        if (Date.now() - this.lastStarTime > 100) {
            this.stars.push(this.createStar());
            this.lastStarTime = Date.now();
        }

        // Use for loop for better performance when removing elements
        for (let i = this.stars.length - 1; i >= 0; i--) {
            const star = this.stars[i];
            const currentTop = parseFloat(star.element.style.top);
            
            if (currentTop > this.canvas.clientHeight) {
                star.element.remove();
                this.stars.splice(i, 1);
            } else {
                star.element.style.top = `${currentTop + star.speed}px`;
                star.element.style.opacity = star.opacity;
            }
        }

        // Limit maximum number of stars
        if (this.stars.length > 50) {
            const excess = this.stars.length - 50;
            for (let i = 0; i < excess; i++) {
                this.stars[i].element.remove();
            }
            this.stars.splice(0, excess);
        }
    }

    createUFO() {
        const ufo = document.createElement('div');
        ufo.className = 'ufo';
        ufo.style.left = '-60px';  // Start off-screen
        ufo.style.top = '50px';    // Near top of screen
        this.canvas.appendChild(ufo);
        this.ufo = ufo;
        this.ufoHits = 0;
    }

    updateUFO() {
        if (!this.ufo) {
            // Randomly spawn UFO (about every 30 seconds on average)
            if (Math.random() < 0.0005 && Date.now() - this.lastUfoTime > 15000) {
                this.createUFO();
                this.lastUfoTime = Date.now();
            }
            return;
        }

        // Move UFO
        const currentLeft = parseFloat(this.ufo.style.left);
        this.ufo.style.left = `${currentLeft + 2}px`;

        // Remove UFO when it goes off screen
        if (currentLeft > this.canvas.clientWidth + 60) {
            this.ufo.remove();
            this.ufo = null;
        }
    }

    playUFOExplosionSound() {
        const oscillator1 = this.audioContext.createOscillator();
        const oscillator2 = this.audioContext.createOscillator();
        const oscillator3 = this.audioContext.createOscillator();
        
        const gainNode1 = this.audioContext.createGain();
        const gainNode2 = this.audioContext.createGain();
        const gainNode3 = this.audioContext.createGain();
        
        oscillator1.connect(gainNode1);
        oscillator2.connect(gainNode2);
        oscillator3.connect(gainNode3);
        
        gainNode1.connect(this.audioContext.destination);
        gainNode2.connect(this.audioContext.destination);
        gainNode3.connect(this.audioContext.destination);
        
        oscillator1.type = 'sine';
        oscillator2.type = 'square';
        oscillator3.type = 'sawtooth';
        
        oscillator1.frequency.setValueAtTime(440, this.audioContext.currentTime);
        oscillator2.frequency.setValueAtTime(220, this.audioContext.currentTime);
        oscillator3.frequency.setValueAtTime(110, this.audioContext.currentTime);
        
        oscillator1.frequency.exponentialRampToValueAtTime(880, this.audioContext.currentTime + 0.1);
        oscillator2.frequency.exponentialRampToValueAtTime(440, this.audioContext.currentTime + 0.1);
        oscillator3.frequency.exponentialRampToValueAtTime(220, this.audioContext.currentTime + 0.1);
        
        gainNode1.gain.setValueAtTime(0.3, this.audioContext.currentTime);
        gainNode2.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        gainNode3.gain.setValueAtTime(0.2, this.audioContext.currentTime);
        
        gainNode1.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        gainNode2.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        gainNode3.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
        
        oscillator1.start();
        oscillator2.start();
        oscillator3.start();
        
        oscillator1.stop(this.audioContext.currentTime + 0.3);
        oscillator2.stop(this.audioContext.currentTime + 0.3);
        oscillator3.stop(this.audioContext.currentTime + 0.3);
    }

    createCompanionShip() {
        // Remove the old companion ship if it exists
        if (this.companionShip) {
            this.companionShip.remove();
        }
    
        // Create the companion ship element
        this.companionShip = document.createElement('div');
        this.companionShip.className = 'companion-ship';
        this.companionShip.style.cssText = `
            width: 40px;
            height: 50px;
            background-image: url('ship.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            position: absolute;
        `;
        this.canvas.appendChild(this.companionShip);
    
        // Position the companion ship near the player
        const playerRect = this.player.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
    
        this.companionShip.style.left = `${playerRect.left - canvasRect.left + 60}px`; // Offset to the right of the player
        this.companionShip.style.top = `${playerRect.top - canvasRect.top}px`;
    
        return this.companionShip;
    }
    
    
    

    updateCompanionShip() {
        if (this.companionShip) {
            const playerRect = this.player.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            const offset = 60; // Distance between player and companion
    
            this.companionShip.style.left = `${playerRect.left - canvasRect.left + offset}px`;
            this.companionShip.style.top = `${playerRect.top - canvasRect.top}px`;
        }
    }
    
    
    

    createGiantPowerUp() {
        const powerUp = document.createElement('div');
        powerUp.className = 'power-up giant-powerup';
        powerUp.style.left = `${Math.random() * (this.canvas.clientWidth - 20)}px`;
        powerUp.style.top = '-20px';
        this.canvas.appendChild(powerUp);
        return powerUp;
    }

    activateGiantMode() {
        this.gameState.isGiantMode = true;
        this.player.style.transform = 'scale(2)';
        
        // Start rainbow effect
        let hue = 0;
        this.rainbowInterval = setInterval(() => {
            hue = (hue + 10) % 360;
            this.player.style.filter = `hue-rotate(${hue}deg) brightness(1.5)`;
        }, 50);

        // End giant mode after 10 seconds
        setTimeout(() => {
            this.gameState.isGiantMode = false;
            this.player.style.transform = 'scale(1)';
            this.player.style.filter = 'none';
            clearInterval(this.rainbowInterval);
        }, 10000);
    }

    createSpaceInvader(row, col) {
        const invader = document.createElement('div');
        invader.className = 'space-invader';
        invader.style.left = `${col * 60}px`;
        invader.style.top = `${row * 50}px`;
        this.canvas.appendChild(invader);
        return invader;
    }

    updateSpaceInvaders() {
        if (!this.gameState.isSpaceInvaderLevel) return;

        let shouldStepDown = false;
        const invaders = document.querySelectorAll('.space-invader');
        
        // Check boundaries
        invaders.forEach(invader => {
            const rect = invader.getBoundingClientRect();
            if (this.invaderDirection > 0 && rect.right > this.canvas.clientWidth ||
                this.invaderDirection < 0 && rect.left < 0) {
                shouldStepDown = true;
            }
        });

        // Move invaders
        invaders.forEach(invader => {
            if (shouldStepDown) {
                invader.style.top = `${parseInt(invader.style.top) + 50}px`;
                this.invaderDirection *= -1;
            } else {
                invader.style.left = `${parseInt(invader.style.left) + (20 * this.invaderDirection)}px`;
            }
        });
    }

    createSmokeParticle() {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: absolute;
            width: 4px;
            height: 4px;
            background-color: rgba(200, 200, 200, 0.5);
            border-radius: 50%;
            pointer-events: none;
        `;
        return particle;
    }

    updatePlayerSmoke() {
        if (Math.random() < 0.3) { // 30% chance each frame
            const playerRect = this.player.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            
            const particle = this.createSmokeParticle();
            const x = playerRect.left - canvasRect.left + playerRect.width / 2;
            const y = playerRect.bottom - canvasRect.top;
            
            particle.style.left = `${x}px`;
            particle.style.top = `${y}px`;
            
            this.canvas.appendChild(particle);
            
            // Animate smoke particle
            let opacity = 0.5;
            let size = 4;
            
            const animate = () => {
                opacity -= 0.02;
                size += 0.2;
                
                if (opacity <= 0) {
                    particle.remove();
                    return;
                }
                
                particle.style.opacity = opacity;
                particle.style.width = `${size}px`;
                particle.style.height = `${size}px`;
                particle.style.transform = `translate(-${size/2}px, -${size/2}px)`;
                
                requestAnimationFrame(animate);
            };
            
            requestAnimationFrame(animate);
        }
    }

    // Add new method for companion ship bullets
    createCompanionBullet(x, y) {
        const bullet = document.createElement('div');
        bullet.className = 'companion-bullet';
        bullet.style.cssText = `
            position: absolute;
            width: 6px;
            height: 15px;
            background-color: #00FF00; // Green color for companion bullets
            border-radius: 3px;
            left: ${x}px;
            top: ${y}px;
        `;
    
        this.canvas.appendChild(bullet);
        return bullet;
    }
    

    spawnBoss() {
        const boss = document.createElement('div');
        boss.className = 'boss';
        boss.style.cssText = `
            position: absolute;
            width: 160px;
            height: 160px;
            background-image: url('boss.png');
            background-size: contain;
            background-repeat: no-repeat;
            background-position: center;
            top: -180px;
            left: 50%;
            transform: translateX(-50%);
        `;
        this.canvas.appendChild(boss);
        this.boss = boss;
        
        // Add health bar with improved styling
        const healthBar = document.createElement('div');
        healthBar.className = 'boss-health';
        healthBar.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            width: 80%;
            height: 25px;
            background-color: rgba(0, 0, 0, 0.7);
            border: 3px solid #888;
            border-radius: 12px;
            overflow: hidden;
        `;
        
        const healthFill = document.createElement('div');
        healthFill.style.cssText = `
            width: 100%;
            height: 100%;
            background: linear-gradient(to right, #ff0000, #ff4444);
            transition: width 0.3s;
            border-radius: 8px;
        `;
        healthBar.appendChild(healthFill);
        this.canvas.appendChild(healthBar);
        this.bossHealthBar = healthFill;
    }

    
    
    updateBoss() {
        if (!this.boss || !this.gameState.isBossFight) return;
        
        if (this.checkCollision(this.player, this.boss)) {
            this.playerHit();
        }
    
        const currentTime = Date.now();
        if (currentTime - this.lastBossUpdateTime < this.bossUpdateInterval) {
            return;
        }
        this.lastBossUpdateTime = currentTime;
    
        // Boss movement logic (e.g., sine wave pattern)
        const time = Date.now() / 1000;
        const centerX = this.canvas.clientWidth / 2;
        const amplitude = this.canvas.clientWidth / 3;
        const x = centerX + Math.sin(time) * amplitude;
    
        this.boss.style.left = `${x}px`;
    
        // Ensure boss moves into the screen
        if (parseFloat(this.boss.style.top) < 50) {
            this.boss.style.top = `${parseFloat(this.boss.style.top) + 2}px`;
        }
    }
    

    createBossBullet() {
        const bossRect = this.boss.getBoundingClientRect();
        const playerRect = this.player.getBoundingClientRect();
        const canvasRect = this.canvas.getBoundingClientRect();
    
        // Calculate the angle from the boss to the player
        const dx = (playerRect.left + playerRect.width / 2) - (bossRect.left + bossRect.width / 2);
        const dy = (playerRect.top + playerRect.height / 2) - (bossRect.top + bossRect.height / 2);
        const magnitude = Math.sqrt(dx * dx + dy * dy); // Normalize the vector
        const speed = 7; // Bullet speed
        const velocity = {
            x: (dx / magnitude) * speed,
            y: (dy / magnitude) * speed,
        };
    
        // Create the bullet
        const bullet = document.createElement('div');
        bullet.className = 'boss-bullet';
        bullet.style.cssText = `
            position: absolute;
            width: 15px;
            height: 15px;
            background-color: #FF0000;
            border-radius: 50%;
            left: ${bossRect.left - canvasRect.left + bossRect.width / 2}px;
            top: ${bossRect.top - canvasRect.top + bossRect.height}px;
        `;
    
        this.canvas.appendChild(bullet);
    
        // Add bullet to the enemy bullets array with velocity
        this.enemyBullets.push({
            element: bullet,
            velocity,
        });
    }
    
    

    defeatBoss() {
        // Create multiple explosions
        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                if (this.boss) {
                    const bossRect = this.boss.getBoundingClientRect();
                    const canvasRect = this.canvas.getBoundingClientRect();
                    this.createParticleExplosion(
                        bossRect.left - canvasRect.left + Math.random() * bossRect.width,
                        bossRect.top - canvasRect.top + Math.random() * bossRect.height
                    );
                }
            }, i * 100);
        }

        // Remove boss and health bar
        this.boss.remove();
        this.boss = null;
        if (this.bossHealthBar) {
            this.bossHealthBar.parentElement.remove();
            this.bossHealthBar = null;
        }

        // Award score and complete level
        this.gameState.addScore(10000 * this.gameState.level);
        this.gameState.completeBossFight();
    }

    setupTutorialLevel() {
        // Clear existing enemies
        this.enemies.forEach(enemy => enemy.remove());
        this.enemies = [];
        
        // Spawn enemies based on tutorial step
        switch(this.gameState.tutorialStep) {
            case 2: // First enemy encounter
                this.spawnTutorialEnemy();
                break;
            case 3: // Power-up tutorial
                this.spawnTutorialPowerUp();
                break;
            case 5: // Shooter enemy tutorial
                this.spawnTutorialShooterEnemy();
                break;
        }
    }

    spawnTutorialEnemy() {
        const enemy = this.createEnemy();
        enemy.style.top = '100px';
        this.enemies.push(enemy);
    }

    spawnTutorialPowerUp() {
        const powerUp = this.createPowerUp('double');
        powerUp.style.top = '100px';
        powerUp.style.left = '50%';
        this.powerUps.push({
            element: powerUp,
            type: 'double'
        });
    }

    spawnTutorialShooterEnemy() {
        const enemy = this.createShooterEnemy();
        enemy.style.top = '100px';
        this.enemies.push(enemy);
    }

    // Modify power-up collection
    handlePowerUpCollection(powerUp) {
        switch (powerUp.type) {
            case 'double':
                this.doubleBullets = true;
                // Disable power-up after 10 seconds
                setTimeout(() => {
                    this.doubleBullets = false;
                }, 10000);
                break;
            case 'companion':
                this.createCompanionShip();
                break;
        }
    }
    
    

    shoot() {
        // Player bullets
        if (this.doubleBullets) {
            this.bullets.push(this.createBullet(-10)); // Left bullet
            this.bullets.push(this.createBullet(10));  // Right bullet
        } else {
            this.bullets.push(this.createBullet(0));   // Single bullet
        }
    
        // Companion bullets
        if (this.companionShip) {
            const companionRect = this.companionShip.getBoundingClientRect();
            const canvasRect = this.canvas.getBoundingClientRect();
            const companionCenterX = companionRect.left - canvasRect.left + companionRect.width / 2;
            const companionTop = companionRect.top - canvasRect.top;
    
            if (this.doubleBullets) {
                // Companion fires double bullets
                this.bullets.push(this.createCompanionBullet(companionCenterX - 10, companionTop)); // Left bullet
                this.bullets.push(this.createCompanionBullet(companionCenterX + 10, companionTop)); // Right bullet
            } else {
                // Companion fires single bullet
                this.bullets.push(this.createCompanionBullet(companionCenterX, companionTop));
            }
        }
    }
    
    
    
    
}

// Initialize game
window.addEventListener('load', () => {
    window.gameInstance = new Game();
});
