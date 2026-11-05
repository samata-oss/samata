"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { type Group, MathUtils, type Mesh } from "three";
import type { AgentSignals, AgentState } from "@/lib/agent-signals";

export type Character = "pig" | "cow";

type Pose = {
  /** Head roll (radians). */
  tilt: number;
  /** Head turn left/right. */
  yaw: number;
  /** Head nod; negative looks up. */
  pitch: number;
  /** Ears: positive perks forward, negative droops back. */
  ears: number;
  /** Eyes drift up (thinking) or stay level. */
  gaze: number;
  /** Eye height multiplier: wide when attentive, relaxed when thinking. */
  eyes: number;
};

const POSES: Record<Exclude<AgentState, "initializing">, Pose> = {
  idle: { tilt: 0, yaw: 0, pitch: 0, ears: 0, gaze: 0, eyes: 1 },
  listening: { tilt: 0.12, yaw: 0, pitch: 0.03, ears: 0.3, gaze: 0, eyes: 1.1 },
  thinking: {
    tilt: -0.06,
    yaw: 0.32,
    pitch: -0.14,
    ears: -0.18,
    gaze: 1,
    eyes: 0.92,
  },
  speaking: { tilt: 0, yaw: 0, pitch: 0, ears: 0.05, gaze: 0, eyes: 1 },
};

const COLORS = {
  pig: {
    head: "#f8b4c6",
    snout: "#f08aa6",
    nostril: "#a8456a",
    ear: "#f08aa6",
    earInner: "#d9658a",
  },
  cow: {
    head: "#f6f1e8",
    snout: "#f4a9b8",
    nostril: "#a8456a",
    ear: "#f6f1e8",
    earInner: "#3a3a42",
  },
} as const;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Where the face sits on the sphere: the surface z at a given x and y. */
const faceZ = (x: number, y: number) =>
  Math.sqrt(Math.max(1 - x * x - y * y, 0)) * 0.95;

const EYE_X = 0.43;
const EYE_Y = 0.3;
const MOUTH_Y = -0.52;
const SMILE_ARC = Math.PI * 0.75;

function Animal({
  signals,
  character,
}: {
  signals: AgentSignals;
  character: Character;
}) {
  const colors = COLORS[character];
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const eyeLeft = useRef<Group>(null);
  const eyeRight = useRef<Group>(null);
  const earLeft = useRef<Group>(null);
  const earRight = useRef<Group>(null);
  const mouth = useRef<Mesh>(null);
  const tongue = useRef<Mesh>(null);
  const smile = useRef<Mesh>(null);

  // Animation state lives in a ref: it changes 60 times a second and React
  // never needs to render because of it.
  const anim = useRef({
    mouth: 0,
    blink: 0,
    nextBlink: 2,
    time: 0,
    pose: { ...POSES.idle },
  });

  useFrame((_, rawDelta) => {
    const a = anim.current;
    // Cap the step so a background tab coming back does not snap the pose.
    const dt = Math.min(rawDelta, 0.05);
    a.time += dt;
    const calm = prefersReducedMotion() ? 0.3 : 1;

    // Mouth: opens fast, closes slower, like a real jaw.
    const level = signals.readLevel();
    const lambda = level > a.mouth ? 28 : 11;
    a.mouth = MathUtils.damp(a.mouth, level, lambda, dt);

    // The agent's reported state picks the pose. If it has not reported one
    // (older worker, still connecting) fall back to what we can hear.
    const reported = signals.state;
    const state: keyof typeof POSES =
      reported === "initializing"
        ? "idle"
        : reported === "idle" && a.mouth > 0.08
          ? "speaking"
          : reported;
    const target = POSES[state];
    for (const key of Object.keys(target) as (keyof Pose)[]) {
      a.pose[key] = MathUtils.damp(a.pose[key], target[key], 5, dt);
    }

    // Blinks: a quick close and open every few seconds.
    a.nextBlink -= dt;
    if (a.nextBlink <= 0 && a.blink === 0) a.blink = 0.0001;
    if (a.blink > 0) {
      a.blink += dt / 0.16;
      if (a.blink >= 1) {
        a.blink = 0;
        a.nextBlink = 2.5 + Math.random() * 3.5;
      }
    }
    const blinkAmount = a.blink > 0 ? Math.sin(a.blink * Math.PI) : 0;

    const t = a.time;
    const speaking = state === "speaking";
    // Speaking adds a little bob and sway that grows with loudness.
    const bob = speaking ? a.mouth * 0.05 : 0;
    const sway = speaking ? 0.05 + a.mouth * 0.05 : 0.025;

    if (body.current) {
      body.current.position.y =
        Math.sin(t * 1.6) * 0.02 * calm + bob * calm - 0.02;
      body.current.scale.setScalar(1 + Math.sin(t * 1.6) * 0.008 * calm);
    }
    if (head.current) {
      head.current.rotation.z =
        a.pose.tilt + Math.sin(t * 0.9) * sway * 0.5 * calm;
      head.current.rotation.y =
        a.pose.yaw + Math.sin(t * 0.7 + 1) * sway * calm;
      head.current.rotation.x =
        a.pose.pitch + (speaking ? a.mouth * 0.06 * calm : 0);
    }

    const eyeHeight = Math.max(a.pose.eyes * (1 - blinkAmount * 0.95), 0.05);
    for (const eye of [eyeLeft.current, eyeRight.current]) {
      if (!eye) continue;
      eye.scale.y = eyeHeight;
      eye.position.y = EYE_Y + a.pose.gaze * 0.05;
    }

    // Ears flick with loudness when speaking, otherwise follow the pose.
    const flick = speaking ? a.mouth * 0.12 * calm : 0;
    if (earLeft.current) earLeft.current.rotation.x = a.pose.ears + flick;
    if (earRight.current) earRight.current.rotation.x = a.pose.ears + flick;

    // Mouth: a dark opening that grows and drops, a tongue inside it, and a
    // smile line that shrinks away as the mouth opens.
    const open = a.mouth;
    if (mouth.current) {
      // Closed, only the smile shows; the dark opening takes over from there.
      mouth.current.visible = open > 0.05;
      mouth.current.scale.set(0.19 + open * 0.05, 0.025 + open * 0.125, 0.16);
      mouth.current.position.y = MOUTH_Y - open * 0.05;
    }
    if (tongue.current) {
      // Rests against the bottom of the mouth, inside it.
      const halfHeight = 0.025 + open * 0.125;
      tongue.current.visible = open > 0.2;
      tongue.current.scale.set(0.11, 0.02 + open * 0.045, 0.1);
      tongue.current.position.y = MOUTH_Y - open * 0.05 - halfHeight * 0.55;
    }
    if (smile.current) {
      smile.current.visible = open < 0.17;
      smile.current.scale.setScalar(Math.max(1 - open * 6, 0.0001));
    }
  });

  const isPig = character === "pig";

  return (
    <group ref={body}>
      <group ref={head}>
        {/* Head */}
        <mesh scale={[1, 0.95, 0.95]}>
          <sphereGeometry args={[1, 64, 48]} />
          <meshStandardMaterial color={colors.head} roughness={0.55} />
        </mesh>

        {/* Eyes: glossy black with a catch-light */}
        {[-1, 1].map((side) => (
          <group
            key={side}
            ref={side < 0 ? eyeLeft : eyeRight}
            position={[side * EYE_X, EYE_Y, faceZ(EYE_X, EYE_Y) - 0.02]}
          >
            <mesh scale={[1, 1.25, 0.55]}>
              <sphereGeometry args={[0.12, 32, 24]} />
              <meshStandardMaterial
                color="#15151a"
                roughness={0.15}
                metalness={0.2}
              />
            </mesh>
            <mesh position={[0.035, 0.05, 0.06]}>
              <sphereGeometry args={[0.03, 12, 12]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        ))}

        {/* Snout / muzzle */}
        {isPig ? (
          <group position={[0, -0.05, 0.86]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.7, 1]}>
              <cylinderGeometry args={[0.34, 0.37, 0.28, 40]} />
              <meshStandardMaterial color={colors.snout} roughness={0.5} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * 0.12, 0, 0.1]}
                scale={[0.55, 1, 0.5]}
              >
                <sphereGeometry args={[0.07, 16, 16]} />
                <meshStandardMaterial color={colors.nostril} roughness={0.6} />
              </mesh>
            ))}
          </group>
        ) : (
          <group position={[0, -0.1, 0.74]}>
            <mesh scale={[0.62, 0.36, 0.4]}>
              <sphereGeometry args={[1, 40, 32]} />
              <meshStandardMaterial color={colors.snout} roughness={0.5} />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * 0.19, 0.04, 0.36]}
                scale={[0.6, 1, 0.5]}
              >
                <sphereGeometry args={[0.06, 16, 16]} />
                <meshStandardMaterial color={colors.nostril} roughness={0.6} />
              </mesh>
            ))}
          </group>
        )}

        {/* Mouth: sits on the face below the snout */}
        <mesh ref={mouth} position={[0, MOUTH_Y, faceZ(0, MOUTH_Y) - 0.02]}>
          <sphereGeometry args={[1, 32, 24]} />
          <meshStandardMaterial color="#3b0f22" roughness={0.9} />
        </mesh>
        <mesh
          ref={tongue}
          position={[0, MOUTH_Y, faceZ(0, MOUTH_Y) + 0.01]}
          visible={false}
        >
          <sphereGeometry args={[1, 24, 16]} />
          <meshStandardMaterial color="#ee6f8f" roughness={0.7} />
        </mesh>
        <mesh
          ref={smile}
          position={[0, MOUTH_Y + 0.17, faceZ(0, MOUTH_Y) + 0.0]}
          // A torus arc starts at 3 o'clock and sweeps counter-clockwise.
          // Turn it so the middle of the arc points straight down.
          rotation={[0, 0, -Math.PI / 2 - SMILE_ARC / 2]}
        >
          <torusGeometry args={[0.17, 0.02, 10, 40, SMILE_ARC]} />
          <meshStandardMaterial color="#5a1c36" roughness={0.8} />
        </mesh>

        {/* Cheeks */}
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            position={[side * 0.68, -0.2, faceZ(0.68, -0.2) - 0.03]}
            scale={[1, 0.65, 0.3]}
          >
            <sphereGeometry args={[0.15, 24, 16]} />
            <meshStandardMaterial color="#ff8fa8" roughness={0.9} />
          </mesh>
        ))}

        {/* Ears */}
        {isPig
          ? [-1, 1].map((side) => (
              <group
                key={side}
                position={[side * 0.62, 0.72, 0.05]}
                rotation={[0, 0, side * -0.65]}
              >
                <group ref={side < 0 ? earLeft : earRight}>
                  <mesh position={[0, 0.2, 0]}>
                    <coneGeometry args={[0.32, 0.55, 32]} />
                    <meshStandardMaterial color={colors.ear} roughness={0.55} />
                  </mesh>
                  <mesh position={[0, 0.16, 0.06]} scale={[0.7, 0.7, 0.5]}>
                    <coneGeometry args={[0.28, 0.5, 32]} />
                    <meshStandardMaterial
                      color={colors.earInner}
                      roughness={0.6}
                    />
                  </mesh>
                </group>
              </group>
            ))
          : [-1, 1].map((side) => (
              <group
                key={side}
                position={[side * 0.98, 0.5, -0.02]}
                rotation={[0, 0, side * -0.35]}
              >
                <group ref={side < 0 ? earLeft : earRight}>
                  <mesh scale={[0.5, 0.2, 0.28]}>
                    <sphereGeometry args={[1, 32, 24]} />
                    <meshStandardMaterial color={colors.ear} roughness={0.55} />
                  </mesh>
                  <mesh
                    position={[side * 0.02, 0, 0.05]}
                    scale={[0.34, 0.12, 0.22]}
                  >
                    <sphereGeometry args={[1, 24, 16]} />
                    <meshStandardMaterial
                      color={colors.earInner}
                      roughness={0.6}
                    />
                  </mesh>
                </group>
              </group>
            ))}

        {/* Cow-only: horns and spots */}
        {!isPig && (
          <>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[side * 0.42, 0.95, 0]}
                rotation={[0, 0, side * -0.35]}
              >
                <coneGeometry args={[0.12, 0.42, 20]} />
                <meshStandardMaterial color="#ead9a4" roughness={0.45} />
              </mesh>
            ))}
            <mesh
              position={[-0.5, 0.58, faceZ(0.5, 0.58) - 0.04]}
              rotation={[0, 0.5, 0.3]}
              scale={[0.36, 0.3, 0.1]}
            >
              <sphereGeometry args={[1, 24, 16]} />
              <meshStandardMaterial color="#2c2c34" roughness={0.7} />
            </mesh>
            <mesh
              position={[0.7, 0.1, faceZ(0.7, 0.1) - 0.04]}
              rotation={[0, -0.8, 0]}
              scale={[0.26, 0.34, 0.1]}
            >
              <sphereGeometry args={[1, 24, 16]} />
              <meshStandardMaterial color="#2c2c34" roughness={0.7} />
            </mesh>
          </>
        )}
      </group>
    </group>
  );
}

/**
 * A 3D character whose mouth follows the agent's voice and whose pose follows
 * what the agent is doing. Fills its parent, so give the parent a height.
 */
export function TalkingAvatar({
  signals,
  character,
}: {
  signals: AgentSignals;
  character: Character;
}) {
  return (
    <Canvas
      // `flat` skips tone mapping so the toy colors stay true.
      flat
      dpr={[1, 2]}
      camera={{ position: [0, 0.05, 5.4], fov: 32 }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={1.15} />
      <directionalLight position={[3, 4, 5]} intensity={1.6} />
      <directionalLight
        position={[-4, 2, -2]}
        intensity={0.9}
        color="#a5a8ff"
      />
      <Animal signals={signals} character={character} />
      {/* Soft contact shadow so the head does not float */}
      <mesh position={[0, -1.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.95, 40]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.22} />
      </mesh>
    </Canvas>
  );
}
