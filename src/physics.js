import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';

const g = 9.81;

export function createBallState(initialX = 0, initialZ = 6, frictionCoefficient = 0.08)
{
    return {
        position: new THREE.Vector2(initialX, initialZ),
        previousPosition: new THREE.Vector2(initialX, initialZ),
        velocity: new THREE.Vector2(0, 0),
        // Level 3 rolling physics
        angularSpeed: 0,
        frictionCoefficient: frictionCoefficient,
        isRolling: false,
        isMoving: false,
        hasCollided: false,
        collisionPoint: null
    };
}

export function createPinState(initialX = 0, initialZ = -6)
{
    return {
        position: new THREE.Vector2(initialX, initialZ),
        velocity: new THREE.Vector2(0, 0),
        isMoving: false,
        angularSpeed: 0,
        fallAxis: new THREE.Vector3(1, 0, 0),
        fallAngle: 0,
        maxFallAngle: Math.PI / 2,
        isFalling: false,
        laneFriction: 2.0
    };
}

export function startBall(ballState, initialVelocityX = 0, initialVelocityZ = -5, initialAngularSpeed = 0)
{
    ballState.velocity.set(initialVelocityX, initialVelocityZ);
    ballState.angularSpeed = initialAngularSpeed;
    ballState.isMoving = ballState.velocity.lengthSq() > 0;
    ballState.isRolling = false;
}

export function resetBall(ballState, initialX = 0, initialZ = 6)
{
    ballState.position.set(initialX, initialZ);
    ballState.previousPosition.set(initialX, initialZ);
    ballState.velocity.set(0, 0);
    ballState.isMoving = false;
    ballState.hasCollided = false;
    ballState.collisionPoint = null;
    ballState.angularSpeed = 0;
    ballState.isRolling = false;
}

export function resetPin(pinState, initialX = 0, initialZ = -6)
{
    pinState.position.set(initialX, initialZ);
    pinState.velocity.set(0, 0);
    pinState.isMoving = false;
    pinState.angularSpeed = 0;
    pinState.fallAxis.set(1, 0, 0);
    pinState.fallAngle = 0;
    pinState.isFalling = false;
}

export function updateBallMotion(ballState, dt, ballRadius)
{
    if (!ballState.isMoving) return;

    ballState.previousPosition.copy(ballState.position);



    const speed = ballState.velocity.length();
    if (speed <= 1e-6)
    {
        ballState.velocity.set(0, 0);
        ballState.angularSpeed = 0;
        ballState.isMoving = false;
        return;
    }

    const rollingSpeed = ballState.angularSpeed * ballRadius;
    const slipSpeed = speed - rollingSpeed;

    const direction = ballState.velocity.clone().normalize();

    // If slip is almost zero, treat as rolling.
    if (Math.abs(slipSpeed) < 0.02)
    {
        ballState.isRolling = true;

        // Simple rolling resistance, much weaker than sliding friction
        const rollingResistance = 0.15;
        const newSpeed = Math.max(0, speed - rollingResistance * dt);

        ballState.velocity.copy(direction).multiplyScalar(newSpeed);
        ballState.angularSpeed = newSpeed / ballRadius;

        if (newSpeed <= 1e-4)
        {
            ballState.velocity.set(0, 0);
            ballState.angularSpeed = 0;
            ballState.isMoving = false;
        }

        ballState.position.addScaledVector(ballState.velocity, dt);
        return;
    }

    ballState.isRolling = false;

    const mu = ballState.frictionCoefficient;
    const linearDeceleration = mu * g;
    const angularAcceleration = (5 / 2) * (mu * g / ballRadius);

    let newSpeed;
    let newAngularSpeed;

    if (slipSpeed > 0)
    {
        // Ball center is moving faster than surface rotation.
        // Friction slows translation and increases spin.
        newSpeed = Math.max(0, speed - linearDeceleration * dt);
        newAngularSpeed = ballState.angularSpeed + angularAcceleration * dt;

        if (newSpeed < newAngularSpeed * ballRadius)
        {
            newSpeed = (speed + (2 / 5) * ballRadius * ballState.angularSpeed) / (1 + 2 / 5);
            newAngularSpeed = newSpeed / ballRadius;
            ballState.isRolling = true;
        }
    } else
    {
        // Ball has too much spin compared to translation.
        // Friction increases translation and reduces spin.
        newSpeed = speed + linearDeceleration * dt;
        newAngularSpeed = Math.max(0, ballState.angularSpeed - angularAcceleration * dt);

        if (newSpeed > newAngularSpeed * ballRadius)
        {
            newSpeed = (speed + (2 / 5) * ballRadius * ballState.angularSpeed) / (1 + 2 / 5);
            newAngularSpeed = newSpeed / ballRadius;
            ballState.isRolling = true;
        }
    }

    ballState.velocity.copy(direction).multiplyScalar(newSpeed);
    ballState.angularSpeed = newAngularSpeed;

    ballState.position.addScaledVector(ballState.velocity, dt);
}

export function updatePinMotion(pinState, dt)
{
    if (!pinState.isMoving) return;

    const speed = pinState.velocity.length();

    if (speed <= 1e-5)
    {
        pinState.velocity.set(0, 0);
        pinState.isMoving = false;
        return;
    }

    const direction = pinState.velocity.clone().normalize();

    const oldSpeed = speed;
    const newSpeed = Math.max(0, oldSpeed - pinState.laneFriction * g * dt);

    pinState.velocity.copy(direction).multiplyScalar(newSpeed);
    pinState.position.addScaledVector(pinState.velocity, dt);

    pinState.isMoving = newSpeed > 1e-5;
}

const tempMovement = new THREE.Vector2();
const startToCenter = new THREE.Vector2();

export function detectBallPinCollision(ballState, ballRadius, pinState, pinRadius)
{
    const r = ballRadius + pinRadius;
    const rSq = r * r;

    const start = ballState.previousPosition;
    const end = ballState.position;
    const center = pinState.position;

    const minX = Math.min(start.x, end.x) - r;
    const maxX = Math.max(start.x, end.x) + r;
    const minZ = Math.min(start.y, end.y) - r;
    const maxZ = Math.max(start.y, end.y) + r;

    if (
        center.x < minX || center.x > maxX ||
        center.y < minZ || center.y > maxZ
    )
    {
        return { collided: false, timeOfImpact: null };
    }

    tempMovement.copy(end).sub(start);
    const a = tempMovement.dot(tempMovement);

    // Ball did not move this frame
    if (a === 0)
    {
        const distanceSq = start.distanceToSquared(center);

        return {
            collided: distanceSq <= rSq,
            timeOfImpact: distanceSq <= rSq ? 0 : null
        };
    }

    // Project pin center onto ball movement segment
    startToCenter.copy(start).sub(center);

    const b = 2 * startToCenter.dot(tempMovement);
    const c = startToCenter.dot(startToCenter) - rSq;

    const discriminant = b * b - 4 * a * c;

    if (discriminant < 0)
    {
        return {
            collided: false,
            timeOfImpact: null
        };
    }

    const sqrtD = Math.sqrt(discriminant);

    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);

    let t = null;

    if (t1 >= 0 && t1 <= 1)
    {
        t = t1;
    } else if (t2 >= 0 && t2 <= 1)
    {
        t = t2;
    }

    return {
        collided: t !== null,
        timeOfImpact: t
    };
}

const collisionNormal = new THREE.Vector2();
const relativeVelocity = new THREE.Vector2();
const impulseVector = new THREE.Vector2();

const pinImpulse3D = new THREE.Vector3();
const contactOffset3D = new THREE.Vector3();
const angularImpulse3D = new THREE.Vector3();
const zeroImpulse = new THREE.Vector2(0, 0);

export function resolve2DCollision(ballState, pinState, ballMass, pinMass, restitution)
{
    // Normal from pin center to ball center
    collisionNormal.copy(ballState.position).sub(pinState.position);
    // collisionNormal.copy(pinState.position).sub(ballState.position);

    const distanceSq = collisionNormal.lengthSq();

    if (distanceSq === 0)
    {
        // Avoid division by zero if centers are exactly equal
        collisionNormal.set(0, 1);
        // collisionNormal.set(0, -1);
    } else
    {
        collisionNormal.normalize();
    }

    // Relative velocity of ball compared to pin
    relativeVelocity.copy(ballState.velocity).sub(pinState.velocity);

    const velocityAlongNormal = relativeVelocity.dot(collisionNormal);

    // If velocityAlongNormal > 0, objects are separating already
    if (
        velocityAlongNormal > 0
        // velocityAlongNormal <= 0
    )
    {
        return {
            pinImpulse: zeroImpulse
        };
    }

    const invBallMass = 1 / ballMass;
    const invPinMass = 1 / pinMass;

    const impulseMagnitude =
        -(1 + restitution) * velocityAlongNormal /
        (invBallMass + invPinMass);

    // const impulseMagnitude =
    //     (1 + restitution) * velocityAlongNormal /
    //     (invBallMass + invPinMass);

    impulseVector.copy(collisionNormal).multiplyScalar(impulseMagnitude);

    // Apply impulse
    ballState.velocity.addScaledVector(impulseVector, invBallMass);
    // ballState.velocity.addScaledVector(impulseVector, -invBallMass);
    pinState.velocity.addScaledVector(impulseVector, -invPinMass);
    // pinState.velocity.addScaledVector(impulseVector, invPinMass);

    ballState.isMoving = ballState.velocity.lengthSq() > 1e-8;
    pinState.isMoving = pinState.velocity.lengthSq() > 1e-8;

    return {
        pinImpulse: impulseVector.clone().multiplyScalar(-1)
        // pinImpulse: impulseVector.clone()
    };
}

export function applyPinAngularImpulse(
    pinState,
    pinImpulse2D,
    pinMass,
    pinRadius,
    pinHeight,
    contactHeightFromLaneTop
)
{
    const momentOfInertia =
        (1 / 12) * pinMass * (3 * pinRadius * pinRadius + pinHeight * pinHeight);

    const pinCenterHeight = pinHeight / 2;

    // Vector from pin center of mass to contact point
    contactOffset3D.set(
        0,
        -contactHeightFromLaneTop,
        0
    );

    // Convert 2D impulse x/z into 3D x/y/z
    pinImpulse3D.set(
        pinImpulse2D.x,
        0,
        pinImpulse2D.y
    );

    // Angular impulse = r × J
    angularImpulse3D.copy(contactOffset3D).cross(pinImpulse3D);

    const deltaOmega = angularImpulse3D.length() / (momentOfInertia + pinMass * contactOffset3D.lengthSq());

    if (angularImpulse3D.lengthSq() > 1e-8)
    {
        pinState.fallAxis.copy(angularImpulse3D).normalize();
        pinState.angularSpeed += deltaOmega;
        pinState.isFalling = true;
    }

    if (pinState.angularSpeed * pinState.angularSpeed > 1e-8)
    {
        pinState.isFalling = true;
    }
}

export function updatePinAngularMotion(
    pinState,
    dt,
    pinRadius,
    pinHeight,
    angularDamping = 1.5
)
{
    // if (!pinState.isFalling) return;

    const Icm =
        (1 / 12) * (3 * pinRadius * pinRadius + pinHeight * pinHeight);

    const Ipivot =
        Icm + (pinHeight / 2) * (pinHeight / 2);

    const criticalAngle =
        Math.atan(pinRadius / (pinHeight / 2));

    const angle = pinState.fallAngle;

    let gravityAngularAcceleration = 0;

    if (angle > 1e-5)
    {
        const magnitude =
            (g * (pinHeight / 2) * Math.sin(angle)) / Ipivot;

        if (angle < criticalAngle)
        {
            // restore upright
            gravityAngularAcceleration = -magnitude;
        }
        else
        {
            // continue falling
            gravityAngularAcceleration = magnitude;
        }
    }

    pinState.angularSpeed += gravityAngularAcceleration * dt;

    // damping
    pinState.angularSpeed *= Math.max(0, 1 - angularDamping * dt);

    pinState.fallAngle += pinState.angularSpeed * dt;

    // returned upright
    if (pinState.fallAngle <= 0)
    {
        pinState.fallAngle = 0;
        pinState.angularSpeed = 0;
        pinState.isFalling = false;
        return;
    }
    // // apply gravity torque along stored fall axis
    // pinState.angularVelocity.addScaledVector(
    //     pinState.fallAxis,
    //     gravityAngularAcceleration * dt
    // );

    // // Simple damping
    // const dampingFactor = Math.max(0, 1 - angularDamping * dt);
    // pinState.angularVelocity.multiplyScalar(dampingFactor);
    // const newAngularSpeed = pinState.angularVelocity.length();

    // if (newAngularSpeed <= 1e-4 && angle <= 1e-3)
    // {
    //     pinState.angularVelocity.set(0, 0, 0);
    //     pinState.fallAngle = 0;
    //     pinState.isFalling = false;
    //     return
    // }
    // pinState.fallAngle += newAngularSpeed * dt;

    // // restoring case
    // if (gravityAngularAcceleration < 0)
    // {
    //     pinState.fallAngle = Math.max(0, pinState.fallAngle);
    // }

    // toppled case
    if (pinState.fallAngle >= pinState.maxFallAngle)
    {
        pinState.fallAngle = pinState.maxFallAngle;
        pinState.angularSpeed = 0;
        pinState.isFalling = false;
    }
}

const pinSlideDirection3D = new THREE.Vector3();
const pinFallAxis3D = new THREE.Vector3();

export function applyPinLaneFrictionTorque(pinState, dt, pinHeight)
{
    const speed = pinState.velocity.length();

    if (speed <= 1e-5) return;
    if (pinState.fallAngle >= pinState.maxFallAngle) return;

    // Direction of pin sliding in x-z plane
    pinSlideDirection3D.set(
        pinState.velocity.x,
        0,
        pinState.velocity.y
    ).normalize();

    // Falling axis is perpendicular to sliding direction.
    // This makes the pin fall in the direction it is sliding.
    pinFallAxis3D.set(
        pinSlideDirection3D.z,
        0,
        -pinSlideDirection3D.x
    ).normalize();

    pinState.fallAxis.copy(pinFallAxis3D);

    // Friction helps turn sliding into rotation around the base.
    // Bigger friction -> faster fall.
    const frictionAngularAcceleration =
        pinState.laneFriction / Math.max(pinHeight, 1e-6);

    pinState.angularSpeed += frictionAngularAcceleration * dt;

    pinState.isFalling = true;
}