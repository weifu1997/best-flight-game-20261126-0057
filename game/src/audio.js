// Procedural sound: no audio files, everything is synthesised with WebAudio.
// An engine drone that follows the throttle, wind that follows the speed,
// a chime for each ring and a thud for a crash. Silent until the first
// gesture, and M toggles it.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let windGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return;
    started = true;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);

      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 82;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();

      const noiseLen = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < noiseLen; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      noise.start();
    } catch {
      ctx = null;
    }
  }

  function tone(freq, when, dur, gainValue, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + dur + 0.05);
  }

  return {
    /** Call from any user gesture; safe to call every frame. */
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    },
    /** Continuous engine + wind levels for this frame. */
    update({ throttle, speed, flying }) {
      if (!ctx) return;
      const t = ctx.currentTime;
      const target = flying ? 0.05 + throttle * 0.1 : 0.02;
      engineGain.gain.setTargetAtTime(target, t, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + throttle * 55 + speed * 0.25, t, 0.1);
      engineOsc2.frequency.setTargetAtTime(72 + throttle * 80 + speed * 0.35, t, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.16, speed * 0.0011) : 0, t, 0.15);
    },
    ring() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(880, t, 0.35, 0.22);
      tone(1318, t + 0.09, 0.4, 0.18);
    },
    win() {
      if (!ctx) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((freq, i) => tone(freq, t + i * 0.12, 0.5, 0.2));
    },
    crash() {
      if (!ctx) return;
      const t = ctx.currentTime;
      tone(70, t, 0.5, 0.4, 'triangle');
      tone(45, t + 0.05, 0.7, 0.35, 'sawtooth');
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() {
      return muted;
    },
  };
}
