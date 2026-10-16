// ADSB Radarscope
// Author: dustsignal
// GitHub: https://github.com/dustsignal/adsb-radarscope
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// ---------------------------------------------------------------------------
// SoundManager.ts — Web Audio emergency-alert synthesizer
//
// Synthesizes emergency-squawk alert tones (7500/7600/7700) through the Web
// Audio API, with debouncing and explicit node cleanup. Edit to change alert
// sounds or add cues; use the shared instance rather than constructing per call.
//
// Overall:  ADSB-BL2.0-APP10001-BETA-VER2.5.0-BETA.67-BUILD0067-SCO0067
// File rev: SoundManager @ r1 (2026-06-19)
// ---------------------------------------------------------------------------

class SoundManagerClass {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = false;
  private lastAlertTime: number = 0;
  // Debounce window prevents rapid-fire alerts from overwhelming the operator
  private alertDebounceMs: number = 5000;

  /**
   * Sets the sound output configuration
   * @param enabled True if sounds are enabled
   */
  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (enabled) {
      this.resumeContext();
    } else {
      // FIX: reset debounce timer when sound disabled so first alert after re-enable plays immediately
      this.lastAlertTime = 0;
    }
  }

  /**
   * Safe initializer/unlocker for AudioContext.
   * Under standard browser security policies, AudioContexts must be resumed/created
   * inside a direct user interaction event callback (click, touch, keypress).
   */
  public async resumeContext(): Promise<void> {
    try {
      if (!this.audioCtx) {
        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass) {
          this.audioCtx = new AudioCtxClass();
        }
      }

      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }
    } catch (err) {
      console.warn('[Sound Manager] Failed to initialize AudioContext:', err);
    }
  }

  /**
   * Plays a synthesized separation or emergency alert alarm.
   * Debounces triggers to prevent ear fatigue.
   *
   * @param type The type of audio alert to play
   * @param forcePlay If true, plays regardless of user settings (e.g. testing)
   */
  public playEmergencyAlert(type: string = 'siren', forcePlay = false): void {
    if (!this.soundEnabled && !forcePlay) return;

    const nowTime = Date.now();
    if (!forcePlay && nowTime - this.lastAlertTime < this.alertDebounceMs) {
      return; // Debounce alerts
    }

    this.resumeContext()
      .then(() => {
        const ctx = this.audioCtx;
        if (!ctx || ctx.state === 'suspended') {
          console.warn('[Sound Manager] Audio context is blocked or suspended by the browser');
          return;
        }

        if (!forcePlay) {
          this.lastAlertTime = nowTime;
        }
        const now = ctx.currentTime;

        if (type === 'radio') {
          // Double radio static warning burst (shhh-shhh)
          const playNoiseBurst = (startTime: number, duration: number) => {
            const bufferSize = ctx.sampleRate * duration;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
              data[i] = Math.random() * 2 - 1;
            }

            const noiseNode = ctx.createBufferSource();
            noiseNode.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1000;
            filter.Q.value = 1.2;

            const gainNodeRadio = ctx.createGain();
            noiseNode.connect(filter);
            filter.connect(gainNodeRadio);
            gainNodeRadio.connect(ctx.destination);

            gainNodeRadio.gain.setValueAtTime(0.18, startTime);
            gainNodeRadio.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            // Disconnect the whole burst chain on end so AudioNodes don't accumulate
            // in the graph (the oscillator paths already do this; the noise path did not).
            noiseNode.onended = () => {
              try { noiseNode.disconnect(); } catch { /* already disconnected */ }
              try { filter.disconnect(); } catch { /* already disconnected */ }
              try { gainNodeRadio.disconnect(); } catch { /* already disconnected */ }
            };

            try {
              noiseNode.start(startTime);
              noiseNode.stop(startTime + duration);
            } catch {
              // start/stop can throw if the context was closed mid-call
            }
          };

          playNoiseBurst(now, 0.12);
          playNoiseBurst(now + 0.18, 0.12);
          return;
        }

        if (type === 'beep') {
          // Rapid Double Beep Alert (beep-beep) at 1000Hz
          const playBeepTone = (startTime: number, duration: number) => {
            const oscBeep = ctx.createOscillator();
            const gainNodeBeep = ctx.createGain();
            oscBeep.connect(gainNodeBeep);
            gainNodeBeep.connect(ctx.destination);

            oscBeep.type = 'sine';
            oscBeep.frequency.setValueAtTime(1000, startTime);

            gainNodeBeep.gain.setValueAtTime(0.24, startTime);
            gainNodeBeep.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            oscBeep.onended = () => { // PERF: use onended instead of setTimeout to prevent timer accumulation and memory leaks
              try { oscBeep.disconnect(); } catch { /* already disconnected */ }
            };
            try {
              oscBeep.start(startTime);
              oscBeep.stop(startTime + duration);
            } catch (e) {
              // stop() can throw if already stopped
            }
          };

          playBeepTone(now, 0.08);
          playBeepTone(now + 0.14, 0.08);
        } else if (type === 'chime') {
          // Ascending Triple Attention Chime (C5 -> E5 -> G5 major triad)
          const playChimeTone = (freq: number, startTime: number, duration: number) => {
            const oscChime = ctx.createOscillator();
            const gainNodeChime = ctx.createGain();
            oscChime.connect(gainNodeChime);
            gainNodeChime.connect(ctx.destination);

            oscChime.type = 'sine';
            oscChime.frequency.setValueAtTime(freq, startTime);

            gainNodeChime.gain.setValueAtTime(0.22, startTime);
            gainNodeChime.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            oscChime.onended = () => { // PERF: use onended instead of setTimeout to prevent timer accumulation and memory leaks
              try { oscChime.disconnect(); } catch { /* already disconnected */ }
            };
            try {
              oscChime.start(startTime);
              oscChime.stop(startTime + duration);
            } catch (e) {
              // stop() can throw if already stopped
            }
          };

          playChimeTone(523.25, now, 0.4);      // C5
          playChimeTone(659.25, now + 0.1, 0.4);  // E5
          playChimeTone(784.00, now + 0.2, 0.4);  // G5
        } else if (type === 'bell') {
          // Rapid Double Alarm Bell Ding (ding-ding) using triangle wave for metallic timbre
          const playBellStrike = (startTime: number, duration: number) => {
            const oscBell = ctx.createOscillator();
            const gainNodeBell = ctx.createGain();
            oscBell.connect(gainNodeBell);
            gainNodeBell.connect(ctx.destination);

            oscBell.type = 'triangle';
            oscBell.frequency.setValueAtTime(1500, startTime);

            gainNodeBell.gain.setValueAtTime(0.2, startTime);
            gainNodeBell.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            oscBell.onended = () => { // PERF: use onended instead of setTimeout to prevent timer accumulation and memory leaks
              try { oscBell.disconnect(); } catch { /* already disconnected */ }
            };
            try {
              oscBell.start(startTime);
              oscBell.stop(startTime + duration);
            } catch (e) {
              // stop() can throw if already stopped
            }
          };

          playBellStrike(now, 0.35);
          playBellStrike(now + 0.12, 0.35);
        } else if (type === 'pulsar') {
          // Triple Sonar Radar Warning Sweeps (pew-pew-pew) - descending frequency sweep
          const playSweep = (startTime: number, duration: number) => {
            const oscSweep = ctx.createOscillator();
            const gainNodeSweep = ctx.createGain();
            oscSweep.connect(gainNodeSweep);
            gainNodeSweep.connect(ctx.destination);

            oscSweep.type = 'sine';
            oscSweep.frequency.setValueAtTime(1600, startTime);
            oscSweep.frequency.exponentialRampToValueAtTime(800, startTime + duration);

            gainNodeSweep.gain.setValueAtTime(0.25, startTime);
            gainNodeSweep.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            oscSweep.onended = () => { // PERF: use onended instead of setTimeout to prevent timer accumulation and memory leaks
              try { oscSweep.disconnect(); } catch { /* already disconnected */ }
            };
            try {
              oscSweep.start(startTime);
              oscSweep.stop(startTime + duration);
            } catch (e) {
              // stop() can throw if already stopped
            }
          };

          playSweep(now, 0.12);
          playSweep(now + 0.14, 0.12);
          playSweep(now + 0.28, 0.12);
        } else {
          const alarmType = type === 'siren' ? 'classic-siren' : type;

          // Helper to safely start/stop a siren oscillator with cleanup
          const startSirenSafe = (osc: OscillatorNode, stopTime: number, _duration: number) => {
            osc.onended = () => { // PERF: use onended instead of setTimeout to prevent timer accumulation and memory leaks
              try { osc.disconnect(); } catch { /* already disconnected */ }
            };
            try {
              osc.start(now);
              osc.stop(stopTime);
            } catch (e) {
              // stop() can throw if already stopped
            }
          };

          if (alarmType === 'classic-siren') {
            // Classic Alternating Two-Tone Siren (880Hz/440Hz)
            const oscSiren = ctx.createOscillator();
            const gainNodeSiren = ctx.createGain();
            oscSiren.connect(gainNodeSiren);
            gainNodeSiren.connect(ctx.destination);

            oscSiren.type = 'sine';
            oscSiren.frequency.setValueAtTime(880, now);
            oscSiren.frequency.setValueAtTime(440, now + 0.15);
            oscSiren.frequency.setValueAtTime(880, now + 0.30);

            gainNodeSiren.gain.setValueAtTime(0.25, now);
            gainNodeSiren.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

            startSirenSafe(oscSiren, now + 0.5, 0.5);
          } else if (alarmType === 'fast-siren') {
            // Fast-cycling siren (5 alternations in 0.6s)
            const oscSiren = ctx.createOscillator();
            const gainNodeSiren = ctx.createGain();
            oscSiren.connect(gainNodeSiren);
            gainNodeSiren.connect(ctx.destination);

            oscSiren.type = 'sine';
            oscSiren.frequency.setValueAtTime(880, now);
            oscSiren.frequency.setValueAtTime(660, now + 0.12);
            oscSiren.frequency.setValueAtTime(880, now + 0.24);
            oscSiren.frequency.setValueAtTime(660, now + 0.36);
            oscSiren.frequency.setValueAtTime(880, now + 0.48);

            gainNodeSiren.gain.setValueAtTime(0.28, now);
            gainNodeSiren.gain.setValueAtTime(0.28, now + 0.48);
            gainNodeSiren.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

            startSirenSafe(oscSiren, now + 0.6, 0.6);
          } else if (alarmType === 'wobble-siren') {
            // Smooth FM Wobble Siren (linear frequency ramps 600-1000Hz)
            const oscSiren = ctx.createOscillator();
            const gainNodeSiren = ctx.createGain();
            oscSiren.connect(gainNodeSiren);
            gainNodeSiren.connect(ctx.destination);

            oscSiren.type = 'sine';
            oscSiren.frequency.setValueAtTime(600, now);
            oscSiren.frequency.linearRampToValueAtTime(1000, now + 0.15);
            oscSiren.frequency.linearRampToValueAtTime(600, now + 0.30);
            oscSiren.frequency.linearRampToValueAtTime(1000, now + 0.45);
            oscSiren.frequency.linearRampToValueAtTime(600, now + 0.60);

            gainNodeSiren.gain.setValueAtTime(0.25, now);
            gainNodeSiren.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

            startSirenSafe(oscSiren, now + 0.6, 0.6);
          } else if (alarmType === 'hi-lo-alert') {
            // Alternating Hi-Lo triangle alarm (1000/500Hz)
            const oscSiren = ctx.createOscillator();
            const gainNodeSiren = ctx.createGain();
            oscSiren.connect(gainNodeSiren);
            gainNodeSiren.connect(ctx.destination);

            oscSiren.type = 'triangle';
            oscSiren.frequency.setValueAtTime(1000, now);
            oscSiren.frequency.setValueAtTime(500, now + 0.2);
            oscSiren.frequency.setValueAtTime(1000, now + 0.4);

            gainNodeSiren.gain.setValueAtTime(0.2, now);
            gainNodeSiren.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

            startSirenSafe(oscSiren, now + 0.6, 0.6);
          } else if (alarmType === 'tri-tone-alarm') {
            // Repeating ascending/descending tri-tone alarm (440->660->880->660)
            const oscSiren = ctx.createOscillator();
            const gainNodeSiren = ctx.createGain();
            oscSiren.connect(gainNodeSiren);
            gainNodeSiren.connect(ctx.destination);

            oscSiren.type = 'sine';
            oscSiren.frequency.setValueAtTime(440, now);
            oscSiren.frequency.setValueAtTime(660, now + 0.15);
            oscSiren.frequency.setValueAtTime(880, now + 0.3);
            oscSiren.frequency.setValueAtTime(660, now + 0.45);

            gainNodeSiren.gain.setValueAtTime(0.25, now);
            gainNodeSiren.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

            startSirenSafe(oscSiren, now + 0.6, 0.6);
          } else {
            // Fallback classic-siren
            const oscSiren = ctx.createOscillator();
            const gainNodeSiren = ctx.createGain();
            oscSiren.connect(gainNodeSiren);
            gainNodeSiren.connect(ctx.destination);

            oscSiren.type = 'sine';
            oscSiren.frequency.setValueAtTime(880, now);
            oscSiren.frequency.setValueAtTime(440, now + 0.15);
            oscSiren.frequency.setValueAtTime(880, now + 0.30);

            gainNodeSiren.gain.setValueAtTime(0.25, now);
            gainNodeSiren.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

            startSirenSafe(oscSiren, now + 0.5, 0.5);
          }
        }
      })
      .catch((err) => {
        console.warn('[Sound Manager] Autoplay policy blocked audio playback:', err);
      });
  }

  /**
   * Plays a quick notification beep (e.g. when an aircraft is selected or new flight joins)
   */
  public playBeep(): void {
    if (!this.soundEnabled) return;

    this.resumeContext()
      .then(() => {
        const ctx = this.audioCtx;
        if (!ctx || ctx.state === 'suspended') return;

        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);

        const now = ctx.currentTime;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, now);

        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc.onended = () => { // PERF: use onended instead of setTimeout to prevent timer accumulation and memory leaks
          try { osc.disconnect(); } catch { /* already disconnected */ }
        };
        try {
          osc.start(now);
          osc.stop(now + 0.1);
        } catch (e) {
          // stop() can throw if already stopped
        }
      })
      .catch(() => {});
  }
}

export const SoundManager = new SoundManagerClass();
