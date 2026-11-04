import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  CircleHelp,
  CirclePause,
  CirclePlay,
  Copy,
  DoorOpen,
  Heart,
  Leaf,
  LoaderCircle,
  Maximize,
  MousePointer2,
  Move,
  RotateCcw,
  Shield,
  Sparkles,
  Sprout,
  Sword,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import {
  createGame,
  EMPTY_INPUT,
  FIXED_DT,
  ROLES,
  RUN_SECONDS,
  startGame,
  step,
  type GameState,
  type Input,
  type Mode,
  type Role,
} from "../shared/game";
import { RaidScene } from "./scene";
import {
  RoomConnection,
  roomEndpoint,
  type ConnectionStatus,
  type RoomInfo,
} from "./network";
import { RaidAudio } from "./audio";

const icons = { fighter: Sword, guardian: Shield, medic: Heart };
function RoleIcon({
  role,
  ...props
}: {
  role: Role;
  size?: number;
  className?: string;
}) {
  const I = icons[role];
  return <I aria-hidden="true" {...props} />;
}
function HamsterMark() {
  return (
    <svg viewBox="0 0 48 48" width="40" height="40" aria-hidden="true">
      <path
        d="M10 17C0 0 20-3 21 12h6C30-3 49 1 39 18c13 19-1 29-15 29S-2 35 10 17Z"
        fill="currentColor"
      />
      <path d="M14 29c0-8 20-8 20 0 0 9-20 9-20 0" fill="#233e30" />
      <circle cx="16" cy="22" r="2" fill="#233e30" />
      <circle cx="32" cy="22" r="2" fill="#233e30" />
      <path d="m21 27 3 4 3-4" fill="currentColor" />
    </svg>
  );
}
function Meter({
  value,
  max,
  label,
  className = "",
}: {
  value: number;
  max: number;
  label: string;
  className?: string;
}) {
  return (
    <div
      className={`meter ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
    >
      <span
        style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
      />
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [role, setRole] = useState<Role>("fighter");
  const game = useRef(createGame());
  const [view, setView] = useState<GameState>(() =>
    structuredClone(game.current),
  );
  const [paused, setPaused] = useState(false);
  const pauseRef = useRef(false);
  const [help, setHelp] = useState(false);
  const [coop, setCoop] = useState(false);
  const [sound, setSound] = useState(false);
  const audio = useRef(new RaidAudio());
  const [webglError, setWebglError] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("closed");
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const roomRef = useRef<RoomInfo | null>(null);
  const network = useRef<RoomConnection | null>(null);
  const [server, setServer] = useState("");
  const [code, setCode] = useState("");
  const [onlineMode, setOnlineMode] = useState<Mode>("live");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const sceneHost = useRef<HTMLDivElement>(null);
  const scene = useRef<RaidScene | null>(null);
  const [hint, setHint] = useState(true);
  const keys = useRef(new Set<string>());
  const touch = useRef<Input>({ ...EMPTY_INPUT });
  const queued = useRef({ attack: false, dodge: false, ability: false });
  const mainAction = useRef<HTMLButtonElement>(null);
  const isOnline = !!room;
  const playing = view.status === "playing";
  const lobby = view.status === "lobby";
  const finished = view.status === "victory" || view.status === "defeat";
  const localId = room?.id || "local";
  const player = view.actors.find((a) => a.id === localId) || view.actors[0];
  const roleData = ROLES[player.role];
  function clearInput() {
    keys.current.clear();
    touch.current = { ...EMPTY_INPUT };
    queued.current = { attack: false, dodge: false, ability: false };
  }
  function pause(value: boolean) {
    pauseRef.current = value;
    setPaused(value);
    clearInput();
    if (!network.current) setView(structuredClone(game.current));
    if (network.current) network.current.action(value ? "away" : "back");
  }
  function chooseRole(r: Role) {
    setRole(r);
    if (!room) {
      game.current = createGame("practice", r);
      setView(structuredClone(game.current));
    }
  }
  function practice() {
    network.current?.close();
    network.current = null;
    roomRef.current = null;
    setRoom(null);
    setConnectionStatus("closed");
    game.current = createGame("practice", role);
    startGame(game.current);
    setView(structuredClone(game.current));
    setHint(true);
    setError("");
    setNotice("Practice started. Two bot companions are with you.");
    pause(false);
    setCoop(false);
    setTimeout(() => document.getElementById("arena-controls")?.focus(), 0);
  }
  function returnLobby() {
    network.current?.close();
    network.current = null;
    roomRef.current = null;
    setRoom(null);
    setConnectionStatus("closed");
    game.current = createGame("practice", role);
    setView(structuredClone(game.current));
    pause(false);
    clearInput();
    setNotice("Choose a role for your next raid.");
    setTimeout(() => mainAction.current?.focus(), 0);
  }
  function replay() {
    if (network.current) {
      network.current.action("replay");
    } else practice();
  }
  function join() {
    setError("");
    let endpoint: string;
    try {
      if (!server.trim())
        throw new Error("Enter a hosted room server URL, or play practice.");
      endpoint = roomEndpoint(server.trim());
    } catch (e) {
      setError((e as Error).message);
      document.getElementById("server-url")?.focus();
      return;
    }
    if (code && !/^[A-HJ-NP-Z2-9]{5}$/i.test(code)) {
      setError(
        "Use the five-character room code, or leave it empty to create a room.",
      );
      document.getElementById("room-code")?.focus();
      return;
    }
    network.current?.close();
    clearInput();
    network.current = new RoomConnection(
      endpoint,
      role,
      onlineMode,
      code.toUpperCase(),
      (state, info) => {
        game.current = state;
        roomRef.current = info;
        setRoom({ ...info });
        setView(structuredClone(state));
        setCoop(false);
        setError("");
        setNotice(
          `Joined room ${info.code}. ${state.mode === "practice" ? "Simulated energy." : "Live wheel bonus enabled."}`,
        );
      },
      (status) => {
        setConnectionStatus(status);
        if (status === "connected" && pauseRef.current)
          network.current?.action("away");
      },
      (message) => {
        setError(message);
        setNotice(message);
      },
    );
  }
  useEffect(() => {
    let alive = true;
    fetch(new URL("config.json", document.baseURI))
      .then((r) => (r.ok ? r.json() : Promise.resolve({ roomServer: null })))
      .then((c: { roomServer?: unknown }) => {
        if (alive && typeof c.roomServer === "string") setServer(c.roomServer);
      })
      .catch(() => {});
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => {
      alive = false;
      media.removeEventListener("change", change);
      network.current?.close();
      audio.current.dispose();
    };
  }, []);
  useEffect(() => {
    if (!sceneHost.current) return;
    try {
      scene.current = new RaidScene(
        sceneHost.current,
        () => game.current,
        () => roomRef.current?.id || "local",
      );
      scene.current.onContextLost = () => {
        setWebglError(true);
        pause(true);
      };
      setWebglError(false);
    } catch {
      setWebglError(true);
      pause(true);
    }
    return () => {
      scene.current?.dispose();
      scene.current = null;
    };
  }, [sceneKey]);
  useEffect(() => {
    scene.current?.setReduced(reduced);
  }, [reduced]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLElement &&
        (e.target.matches("input,select,textarea") ||
          e.target.closest("dialog"))
      )
        return;
      if (e.code === "Space" && e.target instanceof HTMLButtonElement) return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "Space",
          "ShiftLeft",
          "ShiftRight",
          "KeyE",
          "KeyP",
          "Escape",
        ].includes(e.code)
      ) {
        if (game.current.status === "playing") e.preventDefault();
        if (
          (e.code === "Escape" || e.code === "KeyP") &&
          !e.repeat &&
          game.current.status === "playing"
        ) {
          pause(!pauseRef.current);
          return;
        }
        keys.current.add(e.code);
        if (e.code === "Space") queued.current.attack = true;
        if (e.code === "ShiftLeft" || e.code === "ShiftRight")
          queued.current.dodge = true;
        if (e.code === "KeyE") queued.current.ability = true;
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const hidden = () => {
      clearInput();
      if (document.hidden && game.current.status === "playing") pause(true);
    };
    const blur = () => {
      clearInput();
      if (game.current.status === "playing") pause(true);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", up);
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("blur", blur);
    let accumulator = 0,
      last = performance.now(),
      renderAt = last,
      lastSend = last,
      lastEvent = 0,
      lastAttack = 0,
      lastStatus = "lobby";
    let frame: number;
    const tick = (now: number) => {
      accumulator += Math.min((now - last) / 1000, 0.15);
      last = now;
      const k = keys.current;
      const input: Input = pauseRef.current
        ? { ...EMPTY_INPUT }
        : {
            x:
              (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) -
              (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) +
              touch.current.x,
            z:
              (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) -
              (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) +
              touch.current.z,
            attack:
              k.has("Space") || touch.current.attack || queued.current.attack,
            dodge:
              k.has("ShiftLeft") ||
              k.has("ShiftRight") ||
              touch.current.dodge ||
              queued.current.dodge,
            ability:
              k.has("KeyE") || touch.current.ability || queued.current.ability,
          };
      input.x = Math.max(-1, Math.min(1, input.x));
      input.z = Math.max(-1, Math.min(1, input.z));
      // Map screen directions onto the isometric arena's world axes.
      const length = Math.hypot(input.x, input.z);
      if (length > 1) {
        input.x /= length;
        input.z /= length;
      }
      const screenX = input.x,
        screenZ = input.z;
      input.x = screenX * 0.844 + screenZ * 0.537;
      input.z = -screenX * 0.537 + screenZ * 0.844;
      if (network.current) {
        if (now - lastSend >= 50) {
          network.current.input(input);
          queued.current = { attack: false, dodge: false, ability: false };
          lastSend = now;
        }
        accumulator = 0;
      } else
        while (accumulator >= FIXED_DT) {
          if (!pauseRef.current) step(game.current, { local: input }, FIXED_DT);
          queued.current = { attack: false, dodge: false, ability: false };
          accumulator -= FIXED_DT;
        }
      const g = game.current;
      if (g.effectId < lastEvent) lastEvent = 0;
      const recent = g.effects.filter((e) => e.id > lastEvent);
      if (recent.length) {
        const e = recent[recent.length - 1];
        if (e.kind === "hit") audio.current.play("hit");
        else if (e.kind === "damage") audio.current.play("damage");
        else if (e.kind === "heal") audio.current.play("heal");
        lastEvent = e.id;
      }
      if (g.attack && g.attack.id !== lastAttack) {
        lastAttack = g.attack.id;
        audio.current.play("warning");
      }
      if (g.status !== lastStatus) {
        if (g.status === "victory") audio.current.play("victory");
        if (g.status === "victory" || g.status === "defeat") {
          setNotice(g.message);
          clearInput();
          setTimeout(
            () => document.getElementById("replay-button")?.focus(),
            0,
          );
        }
        lastStatus = g.status;
      }
      if (now - renderAt >= 90) {
        setView(structuredClone(g));
        renderAt = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("blur", blur);
    };
  }, []);
  function hold(field: "attack" | "dodge" | "ability", value: boolean) {
    touch.current[field] = value;
    if (value) queued.current[field] = true;
  }
  function copyRoom() {
    if (!room) return;
    void navigator.clipboard
      ?.writeText(room.code)
      .then(() => {
        setCopied(true);
        setNotice("Room code copied.");
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => setNotice(`Room code: ${room.code}`));
  }
  function fullscreen() {
    if (!document.fullscreenElement)
      void document.documentElement
        .requestFullscreen?.()
        .catch(() => setNotice("Fullscreen is unavailable in this browser."));
    else void document.exitFullscreen();
  }
  const liveMessage =
    view.mode === "practice"
      ? "Practice · simulated energy"
      : view.telemetry.text;
  return (
    <div
      className={`app ${playing ? "in-fight" : ""} ${lobby ? "in-lobby" : ""}`}
    >
      <a className="skip-link" href="#arena-controls">
        Skip to game controls
      </a>
      <header className="header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            returnLobby();
          }}
          aria-label="Burrow Raid home"
        >
          <HamsterMark />
          <span>
            Burrow Raid<small>A little co-op adventure</small>
          </span>
        </a>
        <nav aria-label="Game settings">
          <button
            className="icon-button sound-button"
            aria-label={sound ? "Turn sound off" : "Turn sound on"}
            aria-pressed={sound}
            onClick={() => {
              audio.current.set(!sound);
              setSound(audio.current.enabled);
            }}
          >
            {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            className="icon-button"
            aria-label="How to play"
            onClick={() => {
              setHelp(true);
              if (playing) pause(true);
            }}
          >
            <CircleHelp size={21} />
          </button>
          <button
            className="icon-button fullscreen"
            aria-label="Enter fullscreen"
            onClick={fullscreen}
          >
            <Maximize size={19} />
          </button>
          {playing && (
            <button
              className="icon-button"
              aria-label={paused ? "Resume raid" : "Pause raid"}
              onClick={() => pause(!paused)}
            >
              {paused ? <CirclePlay size={21} /> : <CirclePause size={21} />}
            </button>
          )}
        </nav>
      </header>
      <main id="main">
        <div
          className="scene-shell"
          ref={sceneHost}
          role="img"
          aria-label="A miniature underground arena with mushroom lanterns, three hamster adventurers and the armored Cable Gnawer."
        />
        <div className="scene-shade" aria-hidden="true" />
        {lobby && (
          <>
            <div className="arena-caption">
              <span className="location-dot" />
              The Rootbound Hollow
              <span className="caption-divider" />
              Raid 01
            </div>
            <section className="lobby-panel" aria-label="Prepare for your raid">
              <div className="chapter">
                <span className="chapter-line" />
                <Leaf size={16} aria-hidden="true" />
                <span>Small paws. Big boss.</span>
              </div>
              <h1>
                For the
                <br className="desktop-break" /> burrow.
              </h1>
              <p className="intro">A 3D boss battle for very brave hamsters.</p>
              <fieldset className="roles">
                <legend>Choose your little legend</legend>
                <div className="role-options">
                  {(Object.keys(ROLES) as Role[]).map((r) => (
                    <button
                      key={r}
                      className={`role-option ${role === r ? "selected" : ""}`}
                      aria-pressed={role === r}
                      disabled={isOnline}
                      onClick={() => chooseRole(r)}
                    >
                      <RoleIcon role={r} size={23} />
                      <span>{ROLES[r].name}</span>
                      {role === r && (
                        <Check
                          className="role-check"
                          size={13}
                          aria-hidden="true"
                        />
                      )}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="role-detail">
                <RoleIcon role={role} size={17} />
                <span>
                  <strong>{ROLES[role].skill}</strong>
                  <span>
                    {role === "fighter"
                      ? "Deal 80 damage at close range."
                      : role === "guardian"
                        ? "Shield nearby allies for 6 seconds."
                        : "Heal 40 health and revive allies."}
                  </span>
                </span>
                <span className="energy-cost">
                  <Zap size={12} />
                  {ROLES[role].cost}
                </span>
              </div>
              {!isOnline ? (
                <>
                  <button
                    ref={mainAction}
                    className="primary enter-button"
                    id="arena-controls"
                    disabled={webglError}
                    onClick={practice}
                  >
                    Enter the burrow <ArrowRight size={19} aria-hidden="true" />
                  </button>
                  <div className="mode-note">
                    <span className="dot" />
                    Practice mode<span>·</span>You + 2 bot companions
                  </div>
                  <button
                    className="coop-button"
                    onClick={() => {
                      setCoop(true);
                      setError("");
                    }}
                  >
                    <Users size={17} aria-hidden="true" />
                    Play with friends
                    <ChevronRight size={16} aria-hidden="true" />
                  </button>
                </>
              ) : (
                <div className="room-lobby">
                  <button
                    className="room-code"
                    onClick={copyRoom}
                    aria-label={`Copy room code ${room.code}`}
                  >
                    <Users size={17} />
                    Room {room.code}
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                  <p>
                    {view.actors.filter((a) => !a.bot).length} of 3 players ·
                    open seats use bots
                  </p>
                  <button
                    id="arena-controls"
                    className="primary"
                    disabled={room.host !== room.id}
                    onClick={() => {
                      network.current?.action("start");
                      pause(false);
                    }}
                  >
                    {room.host === room.id
                      ? "Start the raid"
                      : "Waiting for host"}
                    <ArrowRight size={18} />
                  </button>
                  <button className="text-button" onClick={returnLobby}>
                    Leave room
                  </button>
                </div>
              )}
            </section>
            <div className="boss-intro">
              <span className="boss-symbol">
                <Zap size={18} />
              </span>
              <div>
                <span>Meet your very big problem</span>
                <strong>The Cable Gnawer</strong>
              </div>
            </div>
            <div className="scene-note">
              <span className="mini-diamond" />
              One burrow. Every paw counts.
            </div>
          </>
        )}
        {playing && (
          <>
            <section className="boss-hud" aria-label="Boss health">
              <div className="boss-title">
                <Zap size={16} />
                <strong>Cable Gnawer</strong>
                <span>
                  {view.bossHp < view.bossMaxHp / 2
                    ? "Enraged"
                    : "Burrow invader"}
                </span>
              </div>
              <Meter
                value={view.bossHp}
                max={view.bossMaxHp}
                label="Cable Gnawer health"
                className="boss-meter"
              />
              <div className="boss-sub">
                <span>
                  {Math.ceil(view.bossHp)} / {view.bossMaxHp}
                </span>
                <span>
                  {Math.floor((RUN_SECONDS - view.t) / 60)}:
                  {String(
                    Math.max(0, Math.floor((RUN_SECONDS - view.t) % 60)),
                  ).padStart(2, "0")}
                </span>
              </div>
            </section>
            <div
              className={`attack-warning ${view.attack && !view.attack.resolved ? "active" : ""}`}
              role="status"
            >
              {view.attack && !view.attack.resolved ? (
                <>
                  <Zap size={17} />
                  {view.attack.kind === "slam"
                    ? "Slam! Leave the circle"
                    : view.attack.kind === "ring"
                      ? "Static ring! Move in or out"
                      : "Sweep! Step out of the stripe"}
                </>
              ) : (
                <>
                  <Leaf size={15} />
                  Find your opening
                </>
              )}
            </div>
            <aside className="party-hud" aria-label="Your party">
              {view.actors.map((a) => (
                <div
                  className={`party-member ${a.hp <= 0 ? "down" : ""}`}
                  key={a.id}
                >
                  <span className={`party-icon ${a.role}`}>
                    <RoleIcon role={a.role} size={17} />
                  </span>
                  <div>
                    <span>
                      {a.id === localId ? "You" : a.name}{" "}
                      <small>
                        {a.bot
                          ? "Bot"
                          : !a.connected
                            ? "Bot covering"
                            : "Player"}
                      </small>
                    </span>
                    <Meter
                      value={a.hp}
                      max={a.maxHp}
                      label={`${a.id === localId ? "Your" : a.name + "’s"} health`}
                    />
                  </div>
                  {a.hp <= 0 ? (
                    <span className="revive-counter">
                      {Math.ceil(12 - a.downTime)}s
                    </span>
                  ) : (
                    <span className="hp-number">{Math.ceil(a.hp)}</span>
                  )}
                </div>
              ))}
            </aside>
            <section className="energy-hud" aria-label="Shared party energy">
              <div>
                <span>
                  <Zap size={16} />
                  Shared energy
                </span>
                <strong>
                  {Math.floor(view.energy)}
                  <small> / 100</small>
                </strong>
              </div>
              <Meter
                value={view.energy}
                max={100}
                label="Shared energy"
                className="energy-meter"
              />
              <p>
                <span
                  className={`dot ${view.telemetry.state === "active" ? "live" : ""}`}
                />
                {view.mode === "practice"
                  ? "Practice · simulated recharge"
                  : view.telemetry.state === "active"
                    ? "Fresh wheel work · bonus recharge"
                    : view.telemetry.state === "resting"
                      ? "Hamster resting · base recharge"
                      : view.telemetry.state === "baseline"
                        ? "Wheel connected · baseline ready"
                        : "Wheel bonus paused · base recharge"}
              </p>
            </section>
            {hint && (
              <div className="fight-hint">
                <span>
                  <strong>Stay clear of amber.</strong> Hold attack near the
                  boss. Dodge before a hit.
                </span>
                <button
                  className="icon-button"
                  aria-label="Dismiss fight hint"
                  onClick={() => setHint(false)}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <div
              className="combat-controls"
              id="arena-controls"
              tabIndex={-1}
              aria-label="Combat controls"
            >
              <div className="move-help">
                <Move size={22} />
                <div>
                  <span>Move</span>
                  <kbd>W A S D</kbd>
                  <small>or arrow keys</small>
                </div>
              </div>
              <TouchPad input={touch} />
              <div className="action-buttons">
                <button
                  className="combat-action attack-action"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    hold("attack", true);
                  }}
                  onPointerUp={() => hold("attack", false)}
                  onPointerCancel={() => hold("attack", false)}
                  onClick={(e) => {
                    if (e.detail === 0) {
                      hold("attack", true);
                      setTimeout(() => hold("attack", false), 200);
                    }
                  }}
                >
                  <Sword size={24} />
                  <span>Attack</span>
                  <kbd>Space</kbd>
                </button>
                <button
                  className="combat-action"
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    hold("dodge", true);
                  }}
                  onPointerUp={() => hold("dodge", false)}
                  onPointerCancel={() => hold("dodge", false)}
                  onClick={(e) => {
                    if (e.detail === 0) {
                      hold("dodge", true);
                      setTimeout(() => hold("dodge", false), 200);
                    }
                  }}
                  disabled={player.dodgeCd > 0}
                >
                  <Sprout size={24} />
                  <span>
                    {player.dodgeCd > 0
                      ? `${player.dodgeCd.toFixed(1)}s`
                      : "Dodge"}
                  </span>
                  <kbd>Shift</kbd>
                </button>
                <button
                  className={`combat-action skill-action ${player.role}`}
                  onPointerDown={(e) => {
                    e.currentTarget.setPointerCapture(e.pointerId);
                    hold("ability", true);
                  }}
                  onPointerUp={() => hold("ability", false)}
                  onPointerCancel={() => hold("ability", false)}
                  onClick={(e) => {
                    if (e.detail === 0) {
                      hold("ability", true);
                      setTimeout(() => hold("ability", false), 200);
                    }
                  }}
                  disabled={player.skillCd > 0 || view.energy < roleData.cost}
                >
                  <RoleIcon role={player.role} size={24} />
                  <span>
                    {player.skillCd > 0
                      ? `${player.skillCd.toFixed(1)}s`
                      : roleData.skill}
                  </span>
                  <kbd>
                    E <span>· {roleData.cost} energy</span>
                  </kbd>
                </button>
              </div>
            </div>
            {player.hp <= 0 && !finished && (
              <div className="down-notice" role="status">
                Catching your breath · returning in{" "}
                {Math.ceil(12 - player.downTime)}s<br />
                <small>A Medic can revive you sooner.</small>
              </div>
            )}
          </>
        )}
        {finished && (
          <section className="result-panel" aria-label="Raid result">
            <div className={`result-icon ${view.status}`}>
              <HamsterMark />
            </div>
            <p className="result-mode">
              {view.mode === "practice"
                ? "Practice raid"
                : `Co-op room ${room?.code}`}
            </p>
            <h1>
              {view.status === "victory"
                ? "Little paws. Big win."
                : "The burrow needs another try."}
            </h1>
            <p>{view.message}</p>
            <div className="result-stats">
              <div>
                <strong>
                  {Math.floor(view.t / 60)}:
                  {String(Math.floor(view.t % 60)).padStart(2, "0")}
                </strong>
                <span>Raid time</span>
              </div>
              <div>
                <strong>
                  {Math.round((1 - view.bossHp / view.bossMaxHp) * 100)}%
                </strong>
                <span>Boss defeated</span>
              </div>
              <div>
                <strong>{view.actors.length}</strong>
                <span>Brave paws</span>
              </div>
            </div>
            <button
              className="primary"
              id="replay-button"
              disabled={!!room && room.host !== room.id}
              onClick={replay}
            >
              <RotateCcw size={18} />
              {room && room.host !== room.id
                ? "Waiting for host"
                : "Raid again"}
            </button>
            <button className="text-button" onClick={returnLobby}>
              Choose another role
            </button>
            <p className="result-note">
              No scores, prizes or rewards are awarded.
            </p>
          </section>
        )}
        {paused && playing && !help && !webglError && (
          <section className="pause-panel" aria-label="Raid paused">
            <CirclePause size={32} />
            <h2>{isOnline ? "Taking a breather" : "A little breather"}</h2>
            <p>
              {isOnline
                ? "The room keeps playing. A bot covers your paw while you’re away."
                : "Your party is waiting right here."}
            </p>
            <button className="primary" onClick={() => pause(false)}>
              Resume raid
              <CirclePlay size={18} />
            </button>
            <button className="text-button" onClick={returnLobby}>
              Return to burrow
            </button>
          </section>
        )}
        {connectionStatus === "reconnecting" && (
          <div className="connection-notice" role="status">
            <LoaderCircle size={18} />
            Reconnecting · a bot is covering your paw
          </div>
        )}
        {error && !coop && (
          <div className="connection-notice error" role="alert">
            <span>{error}</span>
            <button className="text-button" onClick={returnLobby}>
              Return to practice
            </button>
          </div>
        )}
        {webglError && (
          <section className="webgl-error" role="alert">
            <Leaf size={32} />
            <h2>The burrow needs WebGL</h2>
            <p>
              3D graphics are unavailable. Enable hardware acceleration or try a
              browser with WebGL support.
            </p>
            <button
              className="primary"
              onClick={() => setSceneKey((k) => k + 1)}
            >
              Try 3D again
              <RotateCcw size={18} />
            </button>
          </section>
        )}
      </main>
      <footer className="footer">
        <span>
          <Leaf size={13} />
          Made for the Squeekchain community
        </span>
        <button
          className="text-button"
          onClick={() => {
            setHelp(true);
            if (playing) pause(true);
          }}
        >
          Game rules & credits
          <ChevronRight size={13} />
        </button>
        <span className="footer-mode">
          {isOnline ? (
            <>
              <Users size={13} />
              Room {room.code}
            </>
          ) : (
            <>
              <span className="dot" />
              Practice · no live activity
            </>
          )}
        </span>
      </footer>
      <div className="sr-only" role="status" aria-atomic="true">
        {notice}
      </div>
      {help && (
        <Modal
          title="A field guide for little paws"
          onClose={() => setHelp(false)}
        >
          <p className="modal-lead">
            Defeat the Cable Gnawer before three minutes are up. Keep at least
            one hamster standing.
          </p>
          <div className="guide-controls">
            <div>
              <Move size={21} />
              <strong>Move</strong>
              <span>WASD, arrows or the touch pad</span>
            </div>
            <div>
              <Sword size={21} />
              <strong>Attack</strong>
              <span>Hold Space or Attack near the boss</span>
            </div>
            <div>
              <Sprout size={21} />
              <strong>Dodge</strong>
              <span>Shift or Dodge · 3-second cooldown</span>
            </div>
            <div>
              <Sparkles size={21} />
              <strong>Role ability</strong>
              <span>E or your ability button</span>
            </div>
          </div>
          <h3>Watch the ground</h3>
          <p>
            Amber zones show where the next hit will land. A circle means slam;
            a stripe means sweep. For the ring, move close to the boss or beyond
            the outer edge. Dodge gives 0.42 seconds of protection.
          </p>
          <h3>Every role has a job</h3>
          <ul className="role-rules">
            {(Object.keys(ROLES) as Role[]).map((r) => (
              <li key={r}>
                <RoleIcon role={r} size={18} />
                <span>
                  <strong>
                    {ROLES[r].name}: {ROLES[r].skill}
                  </strong>
                  {ROLES[r].description} Costs {ROLES[r].cost} shared energy;{" "}
                  {ROLES[r].skillCooldown}s cooldown.
                </span>
              </li>
            ))}
          </ul>
          <p>
            Fighter and Guardian attack at close range; Medic attacks from
            farther away. Fallen paws return after 12 seconds if an ally is
            still standing. A Medic can revive them sooner.
          </p>
          <p>Bot companions deal reduced damage, so your attacks matter.</p>
          <h3>Energy, without the wait</h3>
          <p>
            Every raid starts with 45 shared energy. Basic attacks and dodges
            are free. All modes get 1 energy per second as a game rule.
          </p>
          <p>
            <strong>Practice:</strong> adds 2 simulated energy per second, for 3
            total. It uses no live hamster activity. Bot companions are always
            labelled.
          </p>
          <p>
            <strong>Live co-op:</strong> only the server checks real hardware
            telemetry. Four new work units add 1 shared energy, capped at 5 per
            update and a 10-energy burst bucket that refills at 1 per second.
            Sleeping, stale or unavailable readings pause only the bonus. Let
            the hamster rest.
          </p>
          <p>
            Wheel telemetry is observational, not confirmed blockchain
            settlement. This game has no wagering, token prizes, wallet
            connection or transactions.
          </p>
          <h3>Co-op & hosting</h3>
          <p>
            Rooms support three real players and fill open seats with bots. A
            room server must be hosted separately from this static site. This
            delivery includes the server; persistent public server hosting is
            not provisioned. The room panel accepts an owner-hosted server URL.
            Reconnect within 30 seconds; bots cover disconnected paws. Online
            rooms keep running when you pause.
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => setReduced(e.target.checked)}
            />
            Reduce decorative motion
          </label>
          <h3>Made in the burrow</h3>
          <p>
            Original procedural 3D characters, arena and sound. Built through
            the IdentityMD contributor network for the Squeekchain Genesis Code
            lane.
          </p>
          <p className="credits-id">
            Project 7e402e1f-52ae-4d91-a0ff-0b907f03ed74
            <br />
            Job 5374bf4d-e3de-4564-a911-de1e5e91f11d
          </p>
          <p>
            Three.js (MIT), React (MIT), Lucide (ISC), Fraunces & Nunito Sans
            (SIL OFL).{" "}
            <a href="./licenses.txt" target="_blank" rel="noreferrer">
              Read third-party licenses
            </a>
            .
          </p>
          <p>
            The first job must be paid by the customer’s Genesis-verified
            regular wallet. Payment and Genesis eligibility are not verified by
            this game. No badge or approval is claimed. Genesis submission is
            pending customer review.
          </p>
          <button
            className="primary"
            onClick={() => {
              setHelp(false);
              if (playing) pause(false);
            }}
          >
            {playing ? "Resume raid" : "Back to the burrow"}
            <ArrowRight size={18} />
          </button>
        </Modal>
      )}
      {coop && (
        <Modal
          title="Bring your little party"
          onClose={() => {
            setCoop(false);
            if (!room) {
              network.current?.close();
              network.current = null;
              setConnectionStatus("closed");
            }
          }}
        >
          <p className="modal-lead">
            Three players. One shared fight. Open seats are filled by clearly
            labelled bots.
          </p>
          <p className="hosting-note">
            Public co-op hosting is not provisioned in this static edition.
            Connect to a trusted owner-hosted room server, or jump into
            practice.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <label htmlFor="server-url">Room server URL</label>
            <input
              id="server-url"
              type="url"
              value={server}
              placeholder="wss://your-host/rooms"
              autoComplete="url"
              onChange={(e) => setServer(e.target.value)}
              aria-describedby="server-help room-error"
              aria-invalid={!!error}
            />
            <small id="server-help">
              Use the server address provided by your room host.
            </small>
            <label htmlFor="room-code">
              Room code <span className="muted">(optional)</span>
            </label>
            <input
              id="room-code"
              value={code}
              placeholder="Leave empty to create a room"
              maxLength={5}
              autoComplete="off"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <label htmlFor="energy-mode">Energy mode</label>
            <select
              id="energy-mode"
              value={onlineMode}
              onChange={(e) => setOnlineMode(e.target.value as Mode)}
            >
              <option value="live">Live wheel bonus + base recharge</option>
              <option value="practice">Practice · simulated energy</option>
            </select>
            <p id="room-error" className="form-error" role="status">
              {error}
            </p>
            <button
              type="submit"
              className="primary"
              disabled={connectionStatus === "connecting"}
            >
              {connectionStatus === "connecting" ? (
                <>
                  <LoaderCircle size={18} />
                  Connecting…
                </>
              ) : (
                <>
                  {code ? "Join room" : "Create room"}
                  <Users size={18} />
                </>
              )}
            </button>
          </form>
          <button className="text-button" onClick={practice}>
            Play practice with bots
          </button>
        </Modal>
      )}
    </div>
  );
}
function TouchPad({ input }: { input: React.MutableRefObject<Input> }) {
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const pointer = useRef<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== e.pointerId) return;
    const r = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - r.left - r.width / 2) / 32,
      y = (e.clientY - r.top - r.height / 2) / 32;
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    input.current.x = x;
    input.current.z = y;
    setStick({ x: x * 24, y: y * 24 });
  };
  const stop = () => {
    pointer.current = null;
    input.current.x = 0;
    input.current.z = 0;
    setStick({ x: 0, y: 0 });
  };
  return (
    <div
      ref={ref}
      className="touch-pad"
      role="group"
      aria-label="Touch movement pad"
    >
      <div
        className="joystick"
        aria-hidden="true"
        onPointerDown={(e) => {
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      >
        <Move size={47} />
        <span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} />
      </div>
      <span>Move</span>
    </div>
  );
}
export default App;
