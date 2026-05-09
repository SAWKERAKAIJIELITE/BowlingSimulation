import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';

const g = 9.81;

export function createBallState(initialX = 0, initialZ = 6, frictionCoefficient = 0.08)
{
    return {
        position: new THREE.Vector2(initialX, initialZ),
        previousPosition: new THREE.Vector2(initialX, initialZ),
        velocity: new THREE.Vector2(0, 0),
        angularVelocity: new THREE.Vector3(0, 0, 0),
        frictionCoefficient: frictionCoefficient,
        laneFrictionCoefficient: frictionCoefficient,
        gutterFrictionCoefficient: frictionCoefficient * 2,
        isRolling: false,
        isMoving: false,
        hasCollided: false,
        collisionPoint: null,
        isInGutter: false,
        gutterCenterX: 0,
        gutterEntered: false
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

export function startBall(
    ballState,
    initialVelocityX = 0,
    initialVelocityZ = -5,
    initialAngularSpeedX = 0,
    initialAngularSpeedY = 0,
    initialAngularSpeedZ = 0,
)
{
    ballState.velocity.set(initialVelocityX, initialVelocityZ);
    ballState.angularVelocity.set(initialAngularSpeedX, initialAngularSpeedY, initialAngularSpeedZ);
    ballState.isMoving = ballState.velocity.lengthSq() > 0 || ballState.angularVelocity.lengthSq() > 0;
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
    ballState.angularVelocity.set(0, 0, 0);
    ballState.isRolling = false;
    ballState.isInGutter = false;
    ballState.gutterEntered = false;
    ballState.frictionCoefficient = ballState.laneFrictionCoefficient;
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

export function updateGutterState(ballState, laneWidth, ballRadius)
{
    const halfLane = laneWidth * 0.5;

    if (
        Math.abs(ballState.position.x) > halfLane &&
        !ballState.isInGutter
    )
    {
        const side = Math.sign(ballState.position.x) || 1;

        ballState.isInGutter = true;
        ballState.gutterEntered = true;

        ballState.gutterCenterX = side * (halfLane + ballRadius * 0.6);
    }
}

export function updateBallMotion(ballState, dt, ballRadius)
{
    if (!ballState.isMoving) return;

    if (ballState.gutterEntered)
    {
        // impact loss
        ballState.velocity.multiplyScalar(0.88);

        // lose some spin
        ballState.angularVelocity.multiplyScalar(0.9);

        ballState.frictionCoefficient = ballState.gutterFrictionCoefficient;

        ballState.gutterEntered = false;
    }

    ballState.previousPosition.copy(ballState.position);

    const speed = ballState.velocity.length();
    if (speed <= 1e-6 && ballState.angularVelocity.lengthSq() <= 1e-6)
    {
        ballState.velocity.set(0, 0);
        ballState.angularVelocity.set(0, 0, 0);
        ballState.isMoving = false;
        return;
    }

    if (ballState.isInGutter)
    {
        // kill sideways velocity gradually// lock x toward gutter center
        const dx = ballState.gutterCenterX - ballState.position.x;

        ballState.position.x += dx * Math.min(1, 8 * dt);

        // remove lateral velocity
        ballState.velocity.x *= Math.max(0, 1 - 10 * dt);

        if (Math.abs(ballState.velocity.x) < 0.01)
            ballState.velocity.x = 0;
    }

    const rotationalSlip = new THREE.Vector2(
        ballRadius * ballState.angularVelocity.z,
        -ballRadius * ballState.angularVelocity.x
    );

    const contactVelocity = ballState.velocity.clone().add(rotationalSlip);

    const slipSpeed = contactVelocity.length();

    // If slip is almost zero, treat as rolling.
    if (Math.abs(slipSpeed) < 0.1)
    {
        ballState.isRolling = true;

        // Simple rolling resistance, much weaker than sliding friction
        const rollingResistance = 0.15;

        const newSpeed = Math.max(0, speed - rollingResistance * dt);

        ballState.velocity.setLength(newSpeed);

        ballState.angularVelocity.x = ballState.velocity.y / ballRadius;

        ballState.angularVelocity.z = -ballState.velocity.x / ballRadius;

        ballState.position.addScaledVector(ballState.velocity, dt);

        if (newSpeed <= 1e-4)
        {
            ballState.velocity.set(0, 0);
            ballState.angularVelocity.set(0, 0, 0);
            ballState.isMoving = false;
        }
        return;
    }

    ballState.isRolling = false;

    const mu = ballState.frictionCoefficient;
    const frictionDir = contactVelocity.clone().normalize().negate();
    const acceleration = frictionDir.multiplyScalar(mu * g);

    ballState.velocity.addScaledVector(
        acceleration,
        dt
    );

    // if (ballState.velocity.dot(ballState.previousPosition.clone().sub(ballState.position)) > 0)
    // {
    //     console.log(ballState.velocity.dot(ballState.previousPosition.clone().sub(ballState.position)));
    //     ballState.velocity.set(0, 0);
    // }
    // const dv = acceleration.clone().multiplyScalar(dt);

    // if (dv.lengthSq() >= ballState.velocity.lengthSq())
    // {
    //     ballState.velocity.set(0, 0);
    // }
    // else
    // {
    //     ballState.velocity.add(dv);
    // }

    const torque = new THREE.Vector3(
        -ballRadius * acceleration.y,
        0,
        ballRadius * acceleration.x
    );

    // Solid sphere:
    const inertia = (2 / 5) * ballRadius * ballRadius;

    const angularAcceleration = torque.multiplyScalar(1 / inertia);

    ballState.angularVelocity.addScaledVector(
        angularAcceleration,
        dt
    );

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

    if (a === 0)
    {
        const distanceSq = start.distanceToSquared(center);

        return {
            collided: distanceSq <= rSq,
            timeOfImpact: distanceSq <= rSq ? 0 : null
        };
    }

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

    ballState.velocity.addScaledVector(impulseVector, invBallMass);
    // ballState.velocity.addScaledVector(impulseVector, -invBallMass);
    pinState.velocity.addScaledVector(impulseVector, -invPinMass);
    // pinState.velocity.addScaledVector(impulseVector, invPinMass);

    ballState.isMoving = ballState.velocity.lengthSq() > 1e-8;
    if (!ballState.isMoving)
    {
        ballState.angularVelocity.set(0, 0, 0);
    }
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

    contactOffset3D.set(
        0,
        contactHeightFromLaneTop,
        0
    );

    // Convert 2D impulse x/z into 3D x/y/z
    pinImpulse3D.set(
        pinImpulse2D.x,
        0,
        pinImpulse2D.y
    );

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
            (g * (
                // (
                //     pinRadius * Math.cos(angle)
                // )
                //  - (
                (pinHeight / 2) * Math.sin(angle)
                // )
            )) / Ipivot;

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

    pinFallAxis3D.set(
        pinSlideDirection3D.z,
        0,
        -pinSlideDirection3D.x
    ).normalize();

    pinState.fallAxis.copy(pinFallAxis3D);

    const frictionAngularAcceleration =
        pinState.laneFriction / Math.max(pinHeight, 1e-6);

    pinState.angularSpeed += frictionAngularAcceleration * dt;

    pinState.isFalling = true;
}
