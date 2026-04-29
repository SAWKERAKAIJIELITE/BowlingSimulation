import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { createSceneSystem } from './scene.js';
import { createBowlingObjects } from './objects.js';
import { createCameraControls } from './cameraControls.js';
import
{
    createBallState,
    createPinState,
    updateBallMotion,
    updatePinMotion,
    startBall,
    resetBall,
    resetPin,
    detectBallPinCollision,
    resolve2DCollision,
    applyPinAngularImpulse,
    updatePinAngularMotion,
    applyPinLaneFrictionTorque
} from './physics.js';


const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5; // safety cap

const { scene, camera, renderer } = createSceneSystem();

const objects = createBowlingObjects();

const laneTopY = objects.lane.size.height / 2;

const ballDirectionArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, -1), // initial direction
    objects.ball.mesh.position.clone(), // origin
    1, // length
    0xff0000
);

const pinRotationAxis = new THREE.Vector3();

scene.add(ballDirectionArrow);
scene.add(objects.lane.mesh);
scene.add(objects.ball.mesh);
scene.add(objects.pin.mesh);

const debug = {
    initialBallX: 0,
    initialBallZ: 6,
    initialVelocityX: 0,
    initialVelocityZ: -6,
    initialAngularSpeed: 0,
    frictionCoefficient: 0.08,

    positionX: 0,
    positionZ: 6,
    velocityX: 0,
    velocityZ: 0,
    angularSpeed: 0,

    ballMass: 7,
    pinMass: 1.5,
    restitution: 0.4,

    initialPinX: 0,
    initialPinZ: -6,
    pinPositionX: 0,
    pinPositionZ: -6,
    pinVelocityX: 0,
    pinVelocityZ: 0,
    fallAngle: 0,
    pinAngularSpeed: 0,
    pinLaneFriction: 0.8,

    collision: false,
    collisionX: 0,
    collisionZ: 0,

    isRolling: false,
    isFalling: false,
    isPaused: false,
    hasStarted: false,

    start: () =>
    {
        if (!ballState.isMoving && !ballState.hasCollided)
        {
            startBall(ballState, debug.initialVelocityX, debug.initialVelocityZ, debug.initialAngularSpeed);
            debug.hasStarted = true;
        }
    },
    reset: () =>
    {
        resetBall(ballState, debug.initialBallX, debug.initialBallZ);
        resetPin(pinState, debug.initialPinX, debug.initialPinZ);
        objects.ball.mesh.position.x = ballState.position.x;
        objects.ball.mesh.position.z = ballState.position.y;
        objects.pin.mesh.position.x = pinState.position.x;
        objects.pin.mesh.position.z = pinState.position.y;
        ballDirectionArrow.position.copy(objects.ball.mesh.position)
        debug.collision = false;
        debug.collisionX = 0;
        debug.collisionZ = 0;
        objects.pin.visualMesh.material.color.set(0xffffff);
        debug.hasStarted = false;
    },
    pause: () =>
    {
        debug.isPaused = !debug.isPaused;
    }
};

const gui = new GUI();

const motionFolder = gui.addFolder('Ball Motion');
motionFolder.add(debug, 'initialVelocityX', -10, 10, 0.1);
motionFolder.add(debug, 'initialVelocityZ', -20, 0, 0.1);
motionFolder.add(debug, 'initialAngularSpeed', 0, 80, 0.1);
motionFolder.add(debug, 'frictionCoefficient', 0, 0.3, 0.01);
motionFolder.add(
    debug,
    'initialBallZ',
    objects.pin.mesh.position.z + objects.pin.radius + objects.ball.radius,
    objects.lane.size.length / 2,
    0.1
);
motionFolder.add(
    debug,
    'initialBallX',
    -objects.lane.size.width / 2,
    objects.lane.size.width / 2,
    0.1
);

const collisionFolder = gui.addFolder('Collision');
collisionFolder.add(debug, 'ballMass', 1, 20, 0.1);
collisionFolder.add(debug, 'pinMass', 0.1, 10, 0.1);
collisionFolder.add(debug, 'restitution', 0, 1, 0.01);
collisionFolder.add(debug, 'pinLaneFriction', 0, 1, 0.01);

const startController = gui.add(debug, 'start');
gui.add(debug, 'reset');
const pauseController = gui.add(debug, 'pause');

function updatePauseLabel()
{
    pauseController.name(debug.isPaused ? 'Resume' : 'Pause');
}
function updateStartLabel()
{
    startController.name(debug.hasStarted ? 'Stop' : 'Start');
}

const monitorFolder = gui.addFolder('Monitor');

monitorFolder.add(debug, 'positionX').listen();
monitorFolder.add(debug, 'positionZ').listen();
monitorFolder.add(debug, 'velocityX').listen();
monitorFolder.add(debug, 'velocityZ').listen();
monitorFolder.add(debug, 'angularSpeed').listen();
monitorFolder.add(debug, 'isRolling').listen();
monitorFolder.add(debug, 'pinPositionX').listen();
monitorFolder.add(debug, 'pinPositionZ').listen();
monitorFolder.add(debug, 'pinVelocityX').listen();
monitorFolder.add(debug, 'pinVelocityZ').listen();
monitorFolder.add(debug, 'collision').listen();
monitorFolder.add(debug, 'collisionX').listen();
monitorFolder.add(debug, 'collisionZ').listen();
monitorFolder.add(debug, 'fallAngle').listen();
monitorFolder.add(debug, 'isFalling').listen();
monitorFolder.add(debug, 'pinAngularSpeed').listen();

// Physics state for the ball
const ballState = createBallState(debug.initialBallX, debug.initialBallZ, debug.frictionCoefficient);
const pinState = createPinState(debug.initialPinX, debug.initialPinZ);

// Optional: put the mesh exactly where the physics starts
objects.ball.mesh.position.x = ballState.position.x;
objects.ball.mesh.position.z = ballState.position.y;
objects.pin.mesh.position.x = pinState.position.x;
objects.pin.mesh.position.z = pinState.position.y;

const cameraControls = createCameraControls(camera, renderer.domElement);

const rollingAxis = new THREE.Vector3();

function updateBallVisualRotation(dt)
{
    const vx = ballState.velocity.x;
    const vz = ballState.velocity.y;

    const speedSq = vx * vx + vz * vz;

    if (speedSq < 1e-8) return;

    // Rolling axis for motion on x-z plane:
    // axis = up × direction
    rollingAxis.set(vz, 0, -vx).normalize();

    const angle = ballState.angularSpeed * dt;

    objects.ball.mesh.rotateOnWorldAxis(rollingAxis, angle);
}

let accumulator = 0;
const clock = new THREE.Clock();

function stepPhysics(dt)
{
    updatePauseLabel();
    updateStartLabel();

    if (debug.isPaused) return;

    if (!debug.hasStarted)
    {
        if (8 < debug.initialBallZ)
        {
            ballState.frictionCoefficient = debug.frictionCoefficient;
        }
        else
        {
            ballState.frictionCoefficient = debug.frictionCoefficient * 3;
            // console.log(ballState.frictionCoefficient);
        }
        ballState.position.x = debug.initialBallX;
        ballState.position.y = debug.initialBallZ;

        const velocityLength = new THREE.Vector2(debug.initialVelocityX, debug.initialVelocityZ).length();
        // console.log(velocityLength);

        ballDirectionArrow.position.copy(objects.ball.mesh.position);

        if (velocityLength > 0.0001)
        {
            const direction = new THREE.Vector3(
                debug.initialVelocityX,
                0,
                debug.initialVelocityZ
            ).normalize();

            ballDirectionArrow.setDirection(direction);
            ballDirectionArrow.setLength(Math.min(velocityLength * 0.3, 2));
            ballDirectionArrow.visible = true;
        } else
        {
            ballDirectionArrow.visible = false;
        }
    }

    // Update motion
    updateBallMotion(ballState, dt, objects.ball.radius);
    updateBallVisualRotation(dt);

    // Collision
    if (ballState.isMoving && !ballState.hasCollided)
    {
        const collisionResult = detectBallPinCollision(
            ballState,
            objects.ball.radius,
            pinState,
            objects.pin.radius
        );

        if (collisionResult.collided)
        {
            ballState.hasCollided = true;

            // Move to exact contact point
            const t = collisionResult.timeOfImpact;

            const startX = ballState.previousPosition.x;
            const startZ = ballState.previousPosition.y;

            const endX = ballState.position.x;
            const endZ = ballState.position.y;

            ballState.position.set(
                startX + (endX - startX) * t,
                startZ + (endZ - startZ) * t
            );
            debug.collisionX = ballState.position.x;
            debug.collisionZ = ballState.position.y;

            const response = resolve2DCollision(
                ballState,
                pinState,
                debug.ballMass,
                debug.pinMass,
                debug.restitution
            );
            // console.log(...response.pinImpulse);

            applyPinAngularImpulse(
                pinState,
                response.pinImpulse,
                debug.pinMass,
                objects.pin.radius,
                objects.pin.height,
                objects.ball.radius
            );

            debug.collision = true;
            objects.pin.visualMesh.material.color.set(0xff3333);
            console.log('2D collision detected at ' + ballState.position.x, ballState.position.y);
        }
    }
    // console.log(objects.ball.radius);
    pinState.laneFriction = debug.pinLaneFriction;

    applyPinLaneFrictionTorque(pinState, dt, objects.pin.height);
    updatePinMotion(pinState, dt);
    updatePinAngularMotion(
        pinState,
        dt,
        objects.pin.radius,
        objects.pin.height
    );
}

function render()
{
    cameraControls.update(FIXED_DT);

    // Sync physics → rendering
    objects.ball.mesh.position.x = ballState.position.x;
    objects.ball.mesh.position.z = ballState.position.y;

    objects.pin.mesh.position.x = pinState.position.x;
    objects.pin.mesh.position.y = laneTopY;
    objects.pin.mesh.position.z = pinState.position.y;

    objects.pin.mesh.rotation.set(0, 0, 0);

    if (pinState.fallAngle > 0)
    {
        // if (pinState.angularVelocity.lengthSq() > 1e-8)
        // {
        //     pinRotationAxis.copy(pinState.angularVelocity).normalize();
        // } else
        // {
        //     pinRotationAxis.set(1, 0, 0);
        // }

        // objects.pin.mesh.setRotationFromAxisAngle(pinRotationAxis, pinState.fallAngle);

        objects.pin.mesh.setRotationFromAxisAngle(
            pinState.fallAxis,
            pinState.fallAngle
        );
    }

    if (debug.hasStarted)
    {
        const velocityLength = ballState.velocity.length();

        ballDirectionArrow.position.copy(objects.ball.mesh.position);

        if (velocityLength > 0.0001)
        {
            const direction = new THREE.Vector3(
                ballState.velocity.x,
                0,
                ballState.velocity.y
            ).normalize();

            ballDirectionArrow.setDirection(direction);
            ballDirectionArrow.setLength(Math.min(velocityLength * 0.3, 2));
            ballDirectionArrow.visible = true;
        } else
        {
            ballDirectionArrow.visible = false;
        }
    }
    // GUI updates
    debug.positionX = ballState.position.x;
    debug.positionZ = ballState.position.y;
    debug.velocityX = ballState.velocity.x;
    debug.velocityZ = ballState.velocity.y;
    debug.angularSpeed = ballState.angularSpeed;
    debug.isRolling = ballState.isRolling;

    debug.pinPositionX = pinState.position.x;
    debug.pinPositionZ = pinState.position.y;
    debug.pinVelocityX = pinState.velocity.x;
    debug.pinVelocityZ = pinState.velocity.y;
    debug.isFalling = pinState.isFalling;
    debug.fallAngle = pinState.fallAngle;
    debug.pinAngularSpeed = pinState.angularSpeed;

    renderer.render(scene, camera);
}

function animate()
{
    const frameTime = clock.getDelta();

    accumulator += frameTime;

    let substeps = 0;

    while (accumulator >= FIXED_DT && substeps < MAX_SUBSTEPS)
    {
        stepPhysics(FIXED_DT);
        accumulator -= FIXED_DT;
        substeps++;
    }

    render();
}

renderer.setAnimationLoop(animate);