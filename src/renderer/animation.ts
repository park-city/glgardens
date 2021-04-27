// ensure requestAnimationFrame exists
if (!window.requestAnimationFrame) {
    const win = window as any;
    win.requestAnimationFrame = win.webkitRequestAniationFrame
        || win.mozRequestAnimationFrame
        || ((f: () => void) => setTimeout(f, 16));
}

export interface AnimationTarget {
    update(dt: number): void;
}

/// An animator manages an animation loop and dispatches update events to its registered objects
/// every frame.
class Animator {
    /// Update targets.
    targets = new Set<AnimationTarget>();

    /// The current loop ID. Used to prevent multiple animation loops running simultaneously.
    currentLoopID = 0;

    /// True if the animation loop is running.
    running = false;

    /// The timestamp of the previous iteration of the animation loop. Used to calculate delta time.
    /// Will be set when the animation loop starts.
    prevTime = 0;

    /// Global animation speed.
    animationSpeed = 1;

    /// Registers an object with the animator. This object must have a function member named
    /// `update`. That function will then be called with the elapsed time in seconds.
    register (target: AnimationTarget) {
        this.targets.add(target);
        this.start();
    }

    /// Unregisters an object. Does nothing if it was never registered.
    unregister (target: AnimationTarget) {
        this.targets.delete(target);
    }

    /// Starts the animation loop if it isn’t already running.
    /// Calling this function directly should generally be unnecessary.
    start () {
        if (this.running) return;
        this.running = true;
        this.currentLoopID++;
        this.prevTime = Date.now();
        this.animationLoop(this.currentLoopID);
    }

    /// Stops the animation loop.
    /// Calling this function directly should generally be unnecessary.
    stop () {
        this.running = false;
    }

    /// The animation loop function; should not be called directly.
    animationLoop (loopID: number) {
        // check if the loop should be running in the first place
        if (loopID != this.currentLoopID || !this.running) return;

        // if no targets are present, stop
        if (!this.targets.size) {
            this.stop();
            return;
        }

        // schedule the next loop iteration
        window.requestAnimationFrame(() => this.animationLoop(loopID));

        // dispatch
        const now = Date.now();
        const deltaTime = (now - this.prevTime) / 1000 * this.animationSpeed;
        this.prevTime = now;

        for (const target of this.targets) {
            target.update(deltaTime);
        }
    }
}

/// The global animator.
export const globalAnimator = new Animator();

window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // suspend animations when the tab is no longer visible
        globalAnimator.stop();
    } else {
        globalAnimator.start();
    }
});

/// Calculates spring position and velocity for any given condition.
///
/// equations copied from
/// http://people.physics.tamu.edu/agnolet/Teaching/Phys_221/MathematicaWebPages/4_DampedHarmonicOsc
/// illator.pdf
export class SpringSolver {
    target = 0;
    dampingRatio: number;
    friction: number;

    // internal spring parameters
    initialValueOffset = 0;
    initialVelocity = 0;
    undampedAngularFrequency = 0;
    dampedAngularFrequency = 0;
    angularOffset = 0;
    amplitudeFactor = 0;
    dampedFriction = 0;
    a1 = 0;
    a2 = 0;

    /// Creates a new spring with the given damping ratio and period.
    constructor (dampingRatio: number, period: number) {
        this.dampingRatio = dampingRatio;
        this.friction = dampingRatio * (4 * Math.PI / period);
        this.init(0, 0);
    }

    /// Sets internal parameters for the given initial velocity.
    init (initialValue: number, initialVelocity: number) {
        if (this.target === null) {
            // uncontrolled “spring”
            this.initialValueOffset = initialValue + (this.friction === 0
                ? 0
                : initialVelocity / this.friction);
            this.initialVelocity = initialVelocity;
            return;
        }

        initialValue -= this.target;

        this.undampedAngularFrequency = this.dampingRatio === 0
            ? 0
            : this.friction / this.dampingRatio / 2;
        this.dampedAngularFrequency =
            this.undampedAngularFrequency * Math.sqrt(1 - this.dampingRatio ** 2),
            this.angularOffset = Math.atan2(
                2 * initialVelocity + this.friction * initialValue,
                2 * initialValue * this.dampedAngularFrequency,
            );
        this.amplitudeFactor = Math.abs(initialValue) < 1e-5
            ? Math.sign(initialVelocity) * initialVelocity / this.dampedAngularFrequency
            : initialValue / Math.cos(this.angularOffset);
        this.dampedFriction = Math.max(
            // approximate zero because lim is too expensive to compute
            1e-5,
            Math.sqrt((this.friction / 2) ** 2 - this.undampedAngularFrequency ** 2) * 2,
        );
        this.a1 = (-2 * initialVelocity + initialValue * (-this.friction + this.dampedFriction))
            / (2 * this.dampedFriction);
        this.a2 = (2 * initialVelocity + initialValue * (this.friction + this.dampedFriction))
            / (2 * this.dampedFriction);
    }

    /// Retargets the spring; setting the start value to the current value and retaining velocity.
    /// Time will be reset to zero.
    ///
    /// @param {number} t - the pivot time, at which the retargeting occurs
    /// @param {number} newTarget - the new target position
    retarget (t: number, newTarget: number) {
        const value = this.getValue(t);
        const velocity = this.getVelocity(t);
        this.target = newTarget;
        this.init(value, velocity);
    }

    /// Resets the velocity to a new value.
    /// Time will be reset to zero.
    ///
    /// @param {number} t - the pivot time, at which the resetting occurs
    /// @param {number} newVelocity - the new velocity
    resetVelocity (t: number, newVelocity: number) {
        const value = this.getValue(t);
        this.init(value, newVelocity);
    }

    resetDampingRatio (t: number, newDampingRatio: number) {
        const value = this.getValue(t);
        const velocity = this.getVelocity(t);
        this.dampingRatio = newDampingRatio;
        this.init(value, velocity);
    }

    resetFriction (t: number, newFriction: number) {
        const value = this.getValue(t);
        const velocity = this.getVelocity(t);
        this.friction = newFriction;
        this.init(value, velocity);
    }

    resetPeriod (t: number, newPeriod: number) {
        this.resetFriction(t, this.dampingRatio * (4 * Math.PI / newPeriod));
    }

    resetValue (t: number, newValue: number) {
        const velocity = this.getVelocity(t);
        this.init(newValue, velocity);
    }

    getValue (t: number) {
        if (this.target === null) {
            if (this.friction === 0) return this.initialValueOffset + t * this.initialVelocity;

            // no target means the only active part of the equation is v' = -cv
            // => solution: v = k * e^(-cx); integral: x = -k * e^(-cx) / c + C
            return this.initialValueOffset - this.initialVelocity
                * Math.exp(-t * this.friction) / this.friction;
        }

        let value;
        if (this.dampingRatio < 1) {
            // underdamped
            value = this.amplitudeFactor * Math.exp(-t * this.friction / 2)
                * Math.cos(this.dampedAngularFrequency * t - this.angularOffset);
        } else {
            // critically damped or overdamped
            value = this.a1 * Math.exp(t * (-this.friction - this.dampedFriction) / 2)
                + this.a2 * Math.exp(t * (-this.friction + this.dampedFriction) / 2);
        }
        return value + this.target;
    }

    getVelocity (t: number) {
        if (this.target === null) {
            return this.initialVelocity * Math.exp(-t * this.friction);
        }

        if (this.dampingRatio < 1) {
            // underdamped
            return this.amplitudeFactor * (-this.friction / 2 * Math.exp(-t * this.friction / 2)
                * Math.cos(this.dampedAngularFrequency * t - this.angularOffset)
                - this.dampedAngularFrequency * Math.exp(-t * this.friction / 2)
                * Math.sin(this.dampedAngularFrequency * t - this.angularOffset));
        } else {
            // critically damped or overdamped
            return this.a1 * (-this.friction - this.dampedFriction) / 2
                * Math.exp(t * (-this.friction - this.dampedFriction) / 2)
                + this.a2 * (-this.friction + this.dampedFriction) / 2
                * Math.exp(t * (-this.friction + this.dampedFriction) / 2);
        }
    }
}

/// Simulates spring physics.
export class Spring {
    /// Tolerance below which the spring will be considered stationary.
    tolerance = 1 / 1000;

    /// If true, the spring will stop animating automatically once it’s done (also see tolerance).
    stopAutomatically = true;

    /// If true, the spring won’t move but will still fire update events.
    /// Useful e.g. when the user is dragging something controlled by a spring.
    locked = false;

    private inner: SpringSolver;
    private t = 0;

    /// Creates a new spring.
    constructor(dampingRatio: number, period: number, initial?: number) {
        this.inner = new SpringSolver(dampingRatio, period);

        if (initial) {
            this.inner.resetValue(0, initial);
            this.inner.retarget(0, initial);
        }
    }

    get time() {
        return this.t;
    }

    resetTime() {
        this.t = 0;
    }

    get value() {
        return this.inner.getValue(this.time);
    }

    set value(value) {
        this.inner.resetValue(this.time, value);
        this.resetTime();
    }

    get velocity() {
        return this.inner.getVelocity(this.time);
    }

    set velocity(value) {
        this.inner.resetVelocity(this.time, value);
        this.resetTime();
    }

    get target() {
        return this.inner.target;
    }

    set target(value) {
        if (this.inner.target === value) return;
        this.inner.retarget(this.time, value);
        this.resetTime();
    }

    /// Updates the spring.
    ///
    /// Will emit an 'update' event with the current value.
    update(elapsed: number) {
        if (!this.locked) this.t += elapsed;

        if (this.stopAutomatically && !this.wantsUpdate) {
            this.finish();
        }
    }

    /// Returns true if the spring should not be considered stopped.
    get wantsUpdate() {
        if (this.target === null) return Math.abs(this.velocity) > this.tolerance;
        return Math.abs(this.value - this.target) + Math.abs(this.velocity) > this.tolerance;
    }

    /// Will finish the animation by immediately jumping to the end.
    finish() {
        this.velocity = 0;
        if (this.target === null) return;
        this.value = this.target;
   }

    /// Returns the damping ratio.
    get dampingRatio() {
        return this.inner.dampingRatio;
    }

    /// Returns the period.
    get period() {
        return this.inner.dampingRatio * 4 * Math.PI / this.inner.friction;
    }

    setDampingRatioAndPeriod(dampingRatio: number, period: number) {
        this.inner.resetDampingRatio(this.time, dampingRatio);
        this.inner.resetPeriod(0, period);
        this.resetTime();
    }

    /// Sets the period.
    set period(period: number) {
        this.setDampingRatioAndPeriod(this.dampingRatio, period);
    }

    /// Sets the damping ratio.
    set dampingRatio(dampingRatio: number) {
        this.setDampingRatioAndPeriod(dampingRatio, this.period);
    }
}

export function lerp(a: number, b: number, t: number) {
    return t * (b - a) + a;
}
export function clamp(x: number, l: number, h: number) {
    return Math.max(l, Math.min(x, h));
}
