import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.179.1/examples/jsm/controls/OrbitControls.js';


export function createCameraControls(camera, domElement)
{
    const controls = new OrbitControls(camera, domElement);

    controls.target.set(0, 1, -4);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 2;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
    };

    controls.update();

    const keys = {
        KeyW: false,
        KeyA: false,
        KeyS: false,
        KeyD: false,
        KeyQ: false,
        KeyE: false
    };

    window.addEventListener('keydown', (event) =>
    {
        if (event.code in keys)
        {
            keys[event.code] = true;
        }
    });

    window.addEventListener('keyup', (event) =>
    {
        if (event.code in keys)
        {
            keys[event.code] = false;
        }
    });

    function update(deltaTime)
    {
        updateKeyboardMovement(camera, controls, keys, deltaTime);
        controls.update();
    }

    return {
        controls,
        update
    };
}

function updateKeyboardMovement(camera, controls, keys, deltaTime)
{
    const moveSpeed = 5;
    const actualSpeed = moveSpeed * deltaTime;

    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, camera.up).normalize();

    const move = new THREE.Vector3();

    if (keys.KeyW) move.add(forward);
    if (keys.KeyS) move.sub(forward);
    if (keys.KeyD) move.add(right);
    if (keys.KeyA) move.sub(right);
    if (keys.KeyE) move.y += 1;
    if (keys.KeyQ) move.y -= 1;

    if (move.lengthSq() > 0)
    {
        move.normalize().multiplyScalar(actualSpeed);

        camera.position.add(move);
        controls.target.add(move);
    }
}