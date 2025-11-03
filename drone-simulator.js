// Drone Flight Simulator
// Main application logic

class Joystick {
    constructor(containerId, stickId) {
        this.container = document.getElementById(containerId);
        this.stick = document.getElementById(stickId);
        this.active = false;
        this.centerX = 0;
        this.centerY = 0;
        this.maxDistance = 40; // Maximum distance from center
        this.currentX = 0;
        this.currentY = 0;
        this.normalizedX = 0; // -1 to 1
        this.normalizedY = 0; // -1 to 1
        
        this.init();
    }
    
    init() {
        // Calculate center position
        const rect = this.container.getBoundingClientRect();
        this.centerX = rect.width / 2;
        this.centerY = rect.height / 2;
        
        // Mouse events
        this.stick.addEventListener('mousedown', this.onStart.bind(this));
        document.addEventListener('mousemove', this.onMove.bind(this));
        document.addEventListener('mouseup', this.onEnd.bind(this));
        
        // Touch events
        this.stick.addEventListener('touchstart', this.onStart.bind(this), { passive: false });
        document.addEventListener('touchmove', this.onMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.onEnd.bind(this));
    }
    
    onStart(e) {
        e.preventDefault();
        this.active = true;
        this.stick.classList.add('active');
    }
    
    onMove(e) {
        if (!this.active) return;
        
        e.preventDefault();
        
        // Get pointer position
        const clientX = e.clientX || (e.touches && e.touches[0].clientX);
        const clientY = e.clientY || (e.touches && e.touches[0].clientY);
        
        // Calculate position relative to container
        const rect = this.container.getBoundingClientRect();
        let x = clientX - rect.left - this.centerX;
        let y = clientY - rect.top - this.centerY;
        
        // Limit to max distance
        const distance = Math.sqrt(x * x + y * y);
        if (distance > this.maxDistance) {
            const angle = Math.atan2(y, x);
            x = Math.cos(angle) * this.maxDistance;
            y = Math.sin(angle) * this.maxDistance;
        }
        
        // Update position
        this.currentX = x;
        this.currentY = y;
        
        // Normalize values (-1 to 1)
        this.normalizedX = x / this.maxDistance;
        this.normalizedY = -y / this.maxDistance; // Invert Y axis
        
        // Update visual position
        this.stick.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    }
    
    onEnd(e) {
        if (!this.active) return;
        
        this.active = false;
        this.stick.classList.remove('active');
        
        // Return to center with smooth animation
        this.currentX = 0;
        this.currentY = 0;
        this.normalizedX = 0;
        this.normalizedY = 0;
        
        this.stick.style.transform = 'translate(-50%, -50%)';
    }
    
    getValues() {
        return {
            x: this.normalizedX,
            y: this.normalizedY
        };
    }
}

class DroneSimulator {
    constructor() {
        // DOM elements
        this.drone = document.getElementById('drone');
        this.connectButton = document.getElementById('connect-button');
        this.statusDot = document.getElementById('status-dot');
        this.statusText = document.getElementById('status-text');
        this.propellerSound = document.getElementById('propeller-sound');
        this.instructions = document.getElementById('instructions');
        this.startButton = document.getElementById('start-button');
        
        // Telemetry displays
        this.throttleDisplay = document.getElementById('throttle-value');
        this.yawDisplay = document.getElementById('yaw-value');
        this.pitchDisplay = document.getElementById('pitch-value');
        this.rollDisplay = document.getElementById('roll-value');
        
        // Joysticks
        this.leftJoystick = null;
        this.rightJoystick = null;
        
        // Drone state
        this.connected = false;
        this.position = { x: 0, y: 0, z: 0 }; // x: horizontal, y: vertical, z: depth
        this.rotation = { yaw: 0, pitch: 0, roll: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        
        // Physics constants
        this.maxSpeed = 3;
        this.acceleration = 0.15;
        this.friction = 0.92;
        this.rotationSpeed = 3;
        
        // Boundaries (percentage of screen)
        this.boundaries = {
            minX: -40,
            maxX: 40,
            minY: -30,
            maxY: 30
        };
        
        // Animation
        this.animationId = null;
        
        this.init();
    }
    
    init() {
        // Initialize joysticks
        this.leftJoystick = new Joystick('left-joystick-container', 'left-stick');
        this.rightJoystick = new Joystick('right-joystick-container', 'right-stick');
        
        // Event listeners
        this.startButton.addEventListener('click', () => {
            this.instructions.classList.add('hidden');
        });
        
        this.connectButton.addEventListener('click', () => {
            this.toggleConnection();
        });
        
        // Start animation loop
        this.animate();
    }
    
    toggleConnection() {
        this.connected = !this.connected;
        
        if (this.connected) {
            this.connectButton.textContent = '🚁 DISCONNECT DRONE';
            this.connectButton.classList.add('connected');
            this.statusDot.classList.add('connected');
            this.statusText.textContent = 'CONNECTED';
            this.drone.classList.add('flying');
            
            // Try to play sound (may be blocked by browser)
            this.propellerSound.play().catch(err => {
                console.log('Audio playback prevented:', err);
            });
        } else {
            this.connectButton.textContent = '🚁 CONNECT DRONE';
            this.connectButton.classList.remove('connected');
            this.statusDot.classList.remove('connected');
            this.statusText.textContent = 'DISCONNECTED';
            this.drone.classList.remove('flying');
            this.propellerSound.pause();
            
            // Reset drone position
            this.resetDrone();
        }
    }
    
    resetDrone() {
        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { yaw: 0, pitch: 0, roll: 0 };
        this.velocity = { x: 0, y: 0, z: 0 };
        this.updateDroneTransform();
    }
    
    updatePhysics() {
        if (!this.connected) return;
        
        // Get joystick values
        const leftStick = this.leftJoystick.getValues();
        const rightStick = this.rightJoystick.getValues();
        
        // Left stick: Throttle (Y) and Yaw (X)
        const throttle = leftStick.y; // -1 to 1
        const yaw = leftStick.x; // -1 to 1
        
        // Right stick: Pitch (Y) and Roll (X)
        const pitch = rightStick.y; // -1 to 1
        const roll = rightStick.x; // -1 to 1
        
        // Update rotation
        this.rotation.yaw += yaw * this.rotationSpeed;
        this.rotation.pitch = pitch * 20; // Tilt angle
        this.rotation.roll = roll * 20; // Tilt angle
        
        // Keep yaw in 0-360 range
        if (this.rotation.yaw > 360) this.rotation.yaw -= 360;
        if (this.rotation.yaw < 0) this.rotation.yaw += 360;
        
        // Calculate movement based on rotation and pitch/roll
        const yawRad = (this.rotation.yaw * Math.PI) / 180;
        
        // Vertical movement (throttle)
        this.velocity.y += throttle * this.acceleration;
        
        // Forward/backward movement (pitch)
        this.velocity.z += pitch * this.acceleration * Math.cos(yawRad);
        this.velocity.x += pitch * this.acceleration * Math.sin(yawRad);
        
        // Left/right strafe (roll)
        this.velocity.x += roll * this.acceleration * Math.cos(yawRad);
        this.velocity.z -= roll * this.acceleration * Math.sin(yawRad);
        
        // Apply friction
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        this.velocity.z *= this.friction;
        
        // Limit speed
        const speed = Math.sqrt(
            this.velocity.x * this.velocity.x +
            this.velocity.y * this.velocity.y +
            this.velocity.z * this.velocity.z
        );
        
        if (speed > this.maxSpeed) {
            const scale = this.maxSpeed / speed;
            this.velocity.x *= scale;
            this.velocity.y *= scale;
            this.velocity.z *= scale;
        }
        
        // Update position
        this.position.x += this.velocity.x;
        this.position.y += this.velocity.y;
        this.position.z += this.velocity.z;
        
        // Apply boundaries
        this.position.x = Math.max(this.boundaries.minX, Math.min(this.boundaries.maxX, this.position.x));
        this.position.y = Math.max(this.boundaries.minY, Math.min(this.boundaries.maxY, this.position.y));
        
        // Update telemetry
        this.updateTelemetry(throttle, yaw, pitch, roll);
        
        // Update drone visual
        this.updateDroneTransform();
    }
    
    updateDroneTransform() {
        // Calculate scale based on Z position (depth)
        const scale = 1 + (this.position.z * 0.01);
        
        // Apply transform
        this.drone.style.transform = `
            translate(calc(-50% + ${this.position.x}vw), calc(-50% + ${-this.position.y}vh))
            rotateZ(${this.rotation.yaw}deg)
            rotateX(${this.rotation.pitch}deg)
            rotateY(${this.rotation.roll}deg)
            scale(${scale})
        `;
    }
    
    updateTelemetry(throttle, yaw, pitch, roll) {
        // Update telemetry displays
        this.throttleDisplay.textContent = `${Math.round(throttle * 100)}%`;
        this.yawDisplay.textContent = `${Math.round(this.rotation.yaw)}°`;
        this.pitchDisplay.textContent = `${Math.round(pitch * 100)}%`;
        this.rollDisplay.textContent = `${Math.round(roll * 100)}%`;
    }
    
    animate() {
        this.updatePhysics();
        this.animationId = requestAnimationFrame(() => this.animate());
    }
}

// Initialize simulator when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const simulator = new DroneSimulator();
});
