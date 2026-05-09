import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.179.1/build/three.module.js';


const DIMENSIONS = {
    lane: {
        width: 4,
        height: 0.2,
        length: 20
    },
    ball: {
        radius: 0.22
    },
    pin: {
        radius: 0.12,
        height: 0.8
    },
    gutter: {
        gutterWidth: 0.6,
        gutterDepth: 0.3,
        gutterLength: 20
    }
};

export function createBowlingObjects()
{
    const laneTopY = DIMENSIONS.lane.height / 2;

    const lane = createLane();
    const ball = createBall(laneTopY);
    const pin = createPin(laneTopY);
    const gutters = createGutters();

    return {
        lane,
        ball,
        pin,
        gutters
    };
}

function createGutters()
{
    const { gutterWidth, gutterDepth, gutterLength } = DIMENSIONS.gutter;

    const gutterGeometry = new THREE.BoxGeometry(gutterWidth, gutterDepth, gutterLength);
    const gutterMaterial = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 1.0, metalness: 0.1 });
    const leftGutter = new THREE.Mesh(gutterGeometry, gutterMaterial);
    const rightGutter = new THREE.Mesh(gutterGeometry, gutterMaterial);

    const halfLane = DIMENSIONS.lane.width * 0.5;

    leftGutter.position.set(
        -halfLane - gutterWidth / 2,
        -gutterDepth / 2,
        0
    );

    rightGutter.position.set(
        halfLane + gutterWidth / 2,
        -gutterDepth / 2,
        0
    );

    return {
        left: leftGutter,
        right: rightGutter,
        width: gutterWidth,
        depth: gutterDepth
    };
}

function createLane()
{
    const { width, height, length } = DIMENSIONS.lane;

    const geometry = new THREE.BoxGeometry(width, height, length);
    const material = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
    const mesh = new THREE.Mesh(geometry, material);

    mesh.position.set(0, 0, 0);
    mesh.name = 'lane';

    return {
        type: 'lane',
        mesh,
        size: { width, height, length },
        body: null
    };
}

function createBall(laneTopY)
{
    const { radius } = DIMENSIONS.ball;

    const group = new THREE.Group();
    group.name = 'ball';

    const ballGeometry = new THREE.SphereGeometry(radius, 32, 32);
    const ballMaterial = new THREE.MeshStandardMaterial({ color: 0x2233aa });
    const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial);

    // Small marker so rotation is visible
    const markerGeometry = new THREE.SphereGeometry(radius * 0.15, 16, 16);
    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const marker = new THREE.Mesh(markerGeometry, markerMaterial);

    // Put marker on the surface of the ball
    marker.position.set(0, radius, 0);

    group.add(ballMesh);
    group.add(marker);

    group.position.set(0, laneTopY + radius, 6);

    return {
        type: 'ball',
        mesh: group,
        radius,
        visualMesh: ballMesh,
        marker
    };
}

function createPin(laneTopY)
{
    const { radius, height } = DIMENSIONS.pin;

    const pivot = new THREE.Group();
    pivot.name = 'pinPivot';

    const geometry = new THREE.CylinderGeometry(radius, radius, height, 32);
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const cylinder = new THREE.Mesh(geometry, material);

    // Cylinder center is above the pivot.
    // Pivot sits at bottom contact point on lane.
    cylinder.position.set(0, height / 2, 0);

    pivot.add(cylinder);

    // Pivot is placed on lane surface.
    pivot.position.set(0, laneTopY, -9);

    return {
        type: 'pin',
        mesh: pivot,
        visualMesh: cylinder,
        radius,
        height,
    };
}
