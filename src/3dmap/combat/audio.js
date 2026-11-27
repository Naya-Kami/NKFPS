const SHOT_SOUNDS = {
  sidearm: {cutoff: 1600, duration: .105, pitch: 185, gain: .24},
  smg: {cutoff: 2300, duration: .074, pitch: 255, gain: .17},
  rifle: {cutoff: 1240, duration: .14, pitch: 127, gain: .29},
  marksman: {cutoff: 880, duration: .19, pitch: 81, gain: .34},
};

const SILENCE = .0001;

export function createCombatAudio() {
  let context;
  let output;
  let noise;
  let volume = .35;

  function resume() {
    try {
      if (!context) {
        const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
        if (!AudioContext) return;
        context = new AudioContext();
        output = context.createGain();
        output.gain.value = volume;
        output.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .2), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (context.state !== 'running') context.resume().catch(() => {});
    } catch {
      dispose();
    }
  }

  function envelope(start, duration, peak) {
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(SILENCE, start);
    envelope.gain.linearRampToValueAtTime(peak, start + .003);
    envelope.gain.exponentialRampToValueAtTime(SILENCE, start + duration);
    envelope.connect(output);
    return envelope;
  }

  function tone(start, duration, pitch, endPitch, level, type) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(pitch, start);
    oscillator.frequency.exponentialRampToValueAtTime(endPitch, start + duration);
    oscillator.connect(envelope(start, duration, level));
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  function shot(weapon) {
    if (context?.state !== 'running' || volume === 0) return;
    const id = typeof weapon === 'string' ? weapon : weapon?.id;
    const sound = Object.hasOwn(SHOT_SOUNDS, id) ? SHOT_SOUNDS[id] : SHOT_SOUNDS.sidearm;
    const {cutoff, duration, pitch, gain} = sound;
    const start = context.currentTime;
    const burst = context.createBufferSource();
    burst.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.exponentialRampToValueAtTime(cutoff / 4, start + duration);
    burst.connect(filter);
    filter.connect(envelope(start, duration, gain));
    burst.start(start, Math.random() * (.2 - duration), duration);
    tone(start, duration * .55, pitch, pitch * .38, gain * .45, 'triangle');
  }

  function hit(kind) {
    if (context?.state !== 'running' || volume === 0) return;
    const start = context.currentTime;
    if (kind === 'kill') {
      tone(start, .085, 470, 650, .14, 'sine');
      tone(start + .06, .11, 740, 870, .12, 'sine');
    } else if (kind === 'head' || kind === 'critical') {
      tone(start, .105, 780, 1090, .14, 'triangle');
    } else {
      tone(start, .065, 600, 410, .1, 'sine');
    }
  }

  function setVolume(value) {
    if (!Number.isFinite(value)) return;
    volume = Math.min(1, Math.max(0, value));
    if (output) output.gain.setTargetAtTime(volume, context.currentTime, .03);
  }

  function dispose() {
    const previous = context;
    context = output = noise = undefined;
    try {
      if (previous && previous.state !== 'closed') previous.close().catch(() => {});
    } catch {}
  }

  return {resume, shot, hit, setVolume, dispose};
}
