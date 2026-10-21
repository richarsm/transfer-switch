let ctx: AudioContext | null = null;

function audioContext(): AudioContext | null {
  const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

export function unlockChime() {
  const audio = audioContext();
  if (audio && audio.state === "suspended") void audio.resume();
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

export function notifyInboxArrival(count: number) {
  playReviewChime();
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    new Notification("T-Transfer", {
      body:
        count === 1
          ? "Tienes un envío nuevo en la bandeja."
          : `Tienes ${count} envíos pendientes en la bandeja.`,
      tag: "t-transfer-inbox",
    });
  } catch {
    /* el navegador puede bloquear el aviso */
  }
}

export function playReviewChime() {
  const audio = audioContext();
  if (!audio) return;
  if (audio.state === "suspended") void audio.resume();
  const now = audio.currentTime;
  ring(audio, now, 1568, 0.18, 0.7);
  ring(audio, now + 0.08, 2093, 0.12, 0.9);
  ring(audio, now + 0.16, 2489, 0.08, 1.1);
}

function ring(audio: AudioContext, at: number, freq: number, gain: number, seconds: number) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.97, at + seconds);
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}
