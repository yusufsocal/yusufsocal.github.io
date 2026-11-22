/* violin.js — a playable violin for yusufsocal.github.io
   Open it from the Violin hobby. Mouse/touch or keyboard, plus a Vivaldi demo.
   Plain JS, Web Audio, no libraries. */
(() => {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    let actx = null;

    /* ---------------- the playable violin ---------------- */
    (() => {
        const stage = $('#stage');
        const svg = $('#violin');
        const NS = 'http://www.w3.org/2000/svg';
        const NUT = 106, END = 790;              // playable fingerboard, 0..12 semitones
        const STRINGS = [                         // top to bottom on screen
            { name: 'E', f: 659.25, y: 90, w: 2.2, c: '#d8d8d8', row: 'Digit', keys: '12345678' },
            { name: 'A', f: 440.00, y: 140, w: 2.8, c: '#d8d8d8', row: 'Key', keys: 'QWERTYUI' },
            { name: 'D', f: 293.66, y: 190, w: 3.4, c: '#cfcfcf', row: 'Key', keys: 'ASDFGHJK' },
            { name: 'G', f: 196.00, y: 240, w: 4.4, c: '#e0b860', row: 'Key', keys: 'ZXCVBNM,' },
        ];
        const DEGREES = [0, 2, 4, 5, 7, 9, 11, 12]; // major scale, like beginner finger tapes
        const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
        const semiToX = s => NUT + (s / 12) * (END - NUT);
        const freqOf = (str, s) => str.f * Math.pow(2, s / 12);
        function noteName(f) {
            const m = Math.round(69 + 12 * Math.log2(f / 440));
            return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
        }

        // keyboard code -> { string index, semitone }
        const KEYMAP = {};
        STRINGS.forEach((s, si) => [...s.keys].forEach((k, i) => {
            const code = k === ',' ? 'Comma' : s.row === 'Digit' ? `Digit${k}` : `Key${k}`;
            KEYMAP[code] = { si, s: DEGREES[i], label: k };
        }));

        // draw tapes, strings
        const tapes = $('#tapes'), strG = $('#strings'), dots = $('#dots');
        const mk = (tag, attrs, parent) => {
            const el = document.createElementNS(NS, tag);
            Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
            parent.appendChild(el);
            return el;
        };
        [2, 4, 5, 7, 9, 11, 12].forEach(s => {
            const x = semiToX(s);
            mk('rect', { class: 'tape', x: x - 3, y: 64, width: 6, height: 202 }, tapes);
        });
        const strEls = STRINGS.map(s =>
            mk('line', { class: 'vstring', x1: 40, x2: 1000, y1: s.y, y2: s.y, stroke: s.c, 'stroke-width': s.w }, strG));
        const bowEl = $('#bow');

        // key legend
        $('#keys').innerHTML = STRINGS.map(s => `<div class="key-row"><span class="lbl">${s.name} string</span>${[...s.keys].map((k, i) => {
            const n = noteName(freqOf(s, DEGREES[i])).replace(/\d/, '');
            return `<span class="kc" data-k="${k}"><b>${k}</b>${n}</span>`;
        }).join('')}</div>`).join('');

        /* ----- audio: a bowed-string voice ----- */
        let master = null, noiseBuf = null;
        function ensureAudio() {
            // the violin always plays, but doesn't switch on the rest of the site's sound
            if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
            if (actx.state === 'suspended') actx.resume();
            if (master) return;
            const comp = actx.createDynamicsCompressor();
            comp.connect(actx.destination);
            master = actx.createGain();
            master.gain.value = 0.9;
            master.connect(comp);
            // tiny synthetic hall
            const len = actx.sampleRate * 1.8;
            const ir = actx.createBuffer(2, len, actx.sampleRate);
            for (let c = 0; c < 2; c++) {
                const d = ir.getChannelData(c);
                for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
            }
            const verb = actx.createConvolver();
            verb.buffer = ir;
            const wet = actx.createGain();
            wet.gain.value = 0.28;
            master.connect(verb).connect(wet).connect(comp);
            noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
            const nd = noiseBuf.getChannelData(0);
            for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
        }

        function startVoice(freq, attack = 0.09) {
            const t = actx.currentTime;
            const out = actx.createGain();
            out.gain.setValueAtTime(0, t);
            out.gain.linearRampToValueAtTime(0.16, t + attack);
            const o1 = actx.createOscillator(), o2 = actx.createOscillator();
            o1.type = o2.type = 'sawtooth';
            o1.frequency.value = o2.frequency.value = freq;
            o2.detune.value = 7;
            const lfo = actx.createOscillator(), lfoAmt = actx.createGain();
            lfo.frequency.value = 5.7;
            lfoAmt.gain.setValueAtTime(0, t);
            lfoAmt.gain.linearRampToValueAtTime(0, t + 0.3);
            lfoAmt.gain.linearRampToValueAtTime(14, t + 0.8);   // vibrato in cents, creeping in
            lfo.connect(lfoAmt);
            lfoAmt.connect(o1.detune); lfoAmt.connect(o2.detune);
            const lp = actx.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 3400; lp.Q.value = 0.8;
            const body1 = actx.createBiquadFilter();
            body1.type = 'peaking'; body1.frequency.value = 290; body1.gain.value = 7; body1.Q.value = 1.4;
            const body2 = actx.createBiquadFilter();
            body2.type = 'peaking'; body2.frequency.value = 2800; body2.gain.value = 5; body2.Q.value = 1.2;
            const mix = actx.createGain();
            mix.gain.value = 0.5;
            o1.connect(mix); o2.connect(mix);
            mix.connect(lp).connect(body1).connect(body2).connect(out);
            // bow hair scratch
            const noise = actx.createBufferSource();
            noise.buffer = noiseBuf; noise.loop = true;
            const bp = actx.createBiquadFilter();
            bp.type = 'bandpass'; bp.frequency.value = freq * 4; bp.Q.value = 1.5;
            const ng = actx.createGain();
            ng.gain.setValueAtTime(0.09, t);
            ng.gain.linearRampToValueAtTime(0.025, t + 0.15);
            noise.connect(bp).connect(ng).connect(out);
            out.connect(master);
            [o1, o2, lfo, noise].forEach(n => n.start(t));
            return {
                setFreq(f) {
                    const now = actx.currentTime;
                    o1.frequency.setTargetAtTime(f, now, 0.025);
                    o2.frequency.setTargetAtTime(f, now, 0.025);
                    bp.frequency.setTargetAtTime(f * 4, now, 0.025);
                },
                stop() {
                    const now = actx.currentTime;
                    out.gain.cancelScheduledValues(now);
                    out.gain.setValueAtTime(out.gain.value, now);
                    out.gain.setTargetAtTime(0, now, 0.07);
                    [o1, o2, lfo, noise].forEach(n => n.stop(now + 0.6));
                },
            };
        }

        /* ----- playing: one voice per input (pointer or key) ----- */
        let fretless = false;
        const active = new Map(); // id -> { v, si, s, dot }

        function show(si, s) {
            const str = STRINGS[si];
            const f = freqOf(str, s);
            const np = $('#np-note');
            const name = noteName(f);
            if (np.textContent !== name) {
                np.textContent = name;
                np.classList.remove('hit'); void np.offsetWidth; np.classList.add('hit');
            }
            $('#np-string').textContent = s < 0.25 ? `open ${str.name} string` : `on the ${str.name} string`;
        }

        function placeDot(entry) {
            const str = STRINGS[entry.si];
            const open = entry.s < 0.25;
            entry.dot.setAttribute('cx', open ? NUT + 14 : semiToX(entry.s));
            entry.dot.setAttribute('cy', str.y);
            entry.dot.setAttribute('class', open ? 'fdot open' : 'fdot');
        }

        function refreshStrings() {
            const on = new Set([...active.values()].map(a => a.si));
            strEls.forEach((el, i) => el.classList.toggle('on', on.has(i)));
            bowEl.classList.toggle('bowing', active.size > 0);
        }

        function press(id, si, s, attack) {
            ensureAudio();
            release(id);
            // a real string plays one note at a time
            for (const [oid, a] of active) if (a.si === si) release(oid);
            const entry = { si, s, v: startVoice(freqOf(STRINGS[si], s), attack), dot: mk('circle', { r: 13 }, dots) };
            active.set(id, entry);
            placeDot(entry);
            show(si, s);
            refreshStrings();
        }

        function move(id, si, s) {
            const e = active.get(id);
            if (!e) return;
            if (si !== e.si) { press(id, si, s); return; }     // slid onto another string
            if (Math.abs(s - e.s) < 0.001) return;
            e.s = s;
            e.v.setFreq(freqOf(STRINGS[si], s));
            placeDot(e);
            show(si, s);
        }

        function release(id) {
            const e = active.get(id);
            if (!e) return;
            e.v.stop();
            e.dot.remove();
            active.delete(id);
            refreshStrings();
        }

        function releaseAll() { [...active.keys()].forEach(release); }

        // pointer -> string + pitch
        function locate(ev) {
            const pt = svg.createSVGPoint();
            pt.x = ev.clientX; pt.y = ev.clientY;
            const p = pt.matrixTransform(svg.getScreenCTM().inverse());
            let si = 0, best = Infinity;
            STRINGS.forEach((s, i) => { const d = Math.abs(s.y - p.y); if (d < best) { best = d; si = i; } });
            let s = p.x > END + 10 ? 0 : ((p.x - NUT) / (END - NUT)) * 12;
            s = Math.max(0, Math.min(12, s));
            if (!fretless || s < 0.35) s = Math.round(s);
            return { si, s };
        }

        svg.addEventListener('pointerdown', ev => {
            ev.preventDefault();
            stopDemo();
            try { svg.setPointerCapture(ev.pointerId); } catch { /* synthetic pointer */ }
            const { si, s } = locate(ev);
            press(`p${ev.pointerId}`, si, s);
        });
        svg.addEventListener('pointermove', ev => {
            if (!active.has(`p${ev.pointerId}`)) return;
            const { si, s } = locate(ev);
            move(`p${ev.pointerId}`, si, s);
        });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t =>
            svg.addEventListener(t, ev => release(`p${ev.pointerId}`)));

        // keyboard
        const keyCap = code => $(`.kc[data-k="${KEYMAP[code].label}"]`);
        addEventListener('keydown', ev => {
            if (stage.hidden) return;
            if (ev.key === 'Escape') { close(); return; }
            const m = KEYMAP[ev.code];
            if (!m || ev.ctrlKey || ev.metaKey || ev.altKey) return;
            ev.preventDefault();
            if (ev.repeat) return;
            stopDemo();
            press(`k${ev.code}`, m.si, m.s);
            keyCap(ev.code)?.classList.add('down');
        });
        addEventListener('keyup', ev => {
            if (!KEYMAP[ev.code]) return;
            release(`k${ev.code}`);
            keyCap(ev.code)?.classList.remove('down');
        });
        addEventListener('blur', releaseAll);

        // fretless toggle
        const fbtn = $('#fretless-btn');
        fbtn.addEventListener('click', () => {
            fretless = !fretless;
            fbtn.setAttribute('aria-pressed', String(fretless));
            fbtn.textContent = fretless ? 'fretless (hard mode)' : 'snap to notes';
        });

        /* ----- demo: Vivaldi, Concerto in A minor RV 356 (Op. 3 No. 6), 1st mvt, solo violin line -----
           Public domain. One token = NOTE:length in sixteenths ("r" = rest), "|" = barline.
           Bar 1 is the pickup, so numbers match the printed part. */
        const B2 = 'A5:2 A5:2 A5:2 A5:2 A5:2 C6:1 B5:1 A5:2 C6:1 B5:1';
        const B3 = 'A5:2 C6:1 B5:1 A5:2 G5:1 F5:1 E5:2 D5:1 C5:1 B4:2 E5:2';
        const arp = (top, mid = 'A4 B4 A4') => `${top}:1 ${mid.split(' ').map(n => n + ':1').join(' ')}`;
        const B56 = 'E5:2 F#5:1 G#5:1 A5:2 G5:1 F5:1 E5:2 A3:2 A3:2 C5:1 D5:1';
        const VIVALDI = [
            /* 1 */ 'E5:2',
            /* 2 */ B2,
            /* 3 */ B3,
            /* 4 */ 'C5:2 A4:2 A4:2 E5:2 A5:2 A5:2 A5:2 A5:2',
            /* 5 */ 'A5:1 G5:1 F5:1 E5:1 F5:2 D5:2 G5:2 G5:2 G5:2 G5:2',
            /* 6 */ 'G5:1 F5:1 E5:1 D5:1 E5:2 C5:2 F5:2 F5:2 F5:2 F5:2',
            /* 7 */ 'F5:1 E5:1 D5:1 C5:1 D5:2 B4:2 E5:2 E5:2 E5:2 E5:2',
            /* 8 */ 'E5:1 D5:1 C5:1 B4:1 C5:2 A4:2 r:1 A4:1 C5:1 E5:1 A5:2 A5:2',
            /* 9 */ 'A5:1 A4:1 C5:1 E5:1 A5:2 A5:2 A5:1 A4:1 C5:1 E5:1 Bb5:2 Bb5:2',
            /* 10 */ 'Bb5:2 A5:1 G#5:1 A5:2 B5:2 D5:9',
            /* 11 */ 'E4:1 G#4:1 B4:1 D5:2 D5:2 D5:1 E4:1 G#4:1 B4:1 D5:2 D5:2',
            /* 12 */ 'D5:1 E4:1 G#4:1 B4:1 D5:2 E5:2 C5:2 B4:1 A4:1 F5:2 E5:1 D5:1',
            /* 13 */ 'E5:2 A5:2 E4:2 G#5:2 A5:4 r:2 E5:2',
            /* 14 */ B2,
            /* 15 */ B3,
            /* 16 */ 'C5:2 A4:2 A4:2 E5:2 E5:2 G5:1 F5:1 E5:2 E5:2',
            /* 17 */ 'A5:2 G5:1 F5:1 E5:2 E5:2 Bb5:2 G5:1 F5:1 E5:2 E5:2',
            /* 18 */ 'A5:2 C#5:2 D5:2 F4:2 G4:2 D5:2 A3:2 C#5:2',
            /* 19 */ 'D5:4 r:2 D5:2 D5:2 F5:1 E5:1 D5:2 D5:2',
            /* 20 */ 'G5:2 F5:1 E5:1 D5:2 D5:2 A5:2 F5:1 E5:1 D5:2 D5:2',
            /* 21 */ 'G5:2 B4:2 C5:2 E4:2 F4:2 C5:2 G3:2 B4:2',
            /* 22 */ 'C5:4 r:2 E5:2 E5:2 C5:1 D5:1 E5:2 E5:2',
            /* 23 */ 'E5:2 C5:1 D5:1 E5:2 E5:2 E5:2 F5:1 G5:1 A5:2 G5:1 F5:1',
            /* 24 */ 'E5:2 D5:1 C5:1 B4:2 E5:2 C5:2 A4:2 A4:2 E5:2',
            /* 25 */ [arp('E5'), arp('E5'), arp('A5'), arp('E5')].join(' '),
            /* 26 */ [arp('A5'), arp('E5'), arp('G5'), arp('E5')].join(' '),
            /* 27 */ [arp('G5'), arp('E5'), arp('F5'), arp('D5')].join(' '),
            /* 28 */ [arp('F5'), arp('D5'), 'F5:2 A5:1 G5:1 F5:2 F5:2'].join(' '),
            /* 29 */ 'D6:3 C6:1 B5:1 A5:1 G5:1 F5:1 E5:2 C5:1 D5:1 E5:1 F5:1 G5:1 A5:1',
            /* 30 */ 'D5:2 B4:1 C5:1 D5:1 E5:1 F5:1 G5:1 C5:2 A4:1 B4:1 C5:1 D5:1 E5:1 F5:1',
            /* 31 */ 'B4:2 G4:1 A4:1 B4:1 C5:1 D5:1 E5:1 C5:2 A4:1 B4:1 C5:1 D5:1 E5:1 F5:1',
            /* 32 */ 'D5:2 B4:1 C5:1 D5:1 E5:1 F5:1 G5:1 E5:2 C5:1 D5:1 E5:1 F5:1 G5:1 A5:1',
            /* 33 */ 'D#5:2 B4:2 r:2 E5:2 E5:2 G5:1 F#5:1 E5:2 E5:2',
            /* 34 */ 'A5:2 G5:1 F#5:1 E5:2 E5:2 B5:2 G5:1 F#5:1 E5:2 E5:2',
            /* 35 */ 'C6:2 D#5:2 E5:2 G4:2 A4:2 E5:2 B3:2 D#5:2',
            /* 36 */ 'E5:4 r:2 B4:2 E5:2 E5:2 E5:2 E5:2',
            /* 37 */ 'E5:2 G5:1 F#5:1 E5:2 G5:1 F#5:1 E5:2 G5:1 F#5:1 E5:2 D5:1 C5:1',
            /* 38 */ 'B4:2 A4:1 G4:1 F#4:2 B4:2 G4:2 E4:2 E4:2 B4:2',
            /* 39 */ 'E5:2 E5:2 E5:2 E5:2 E5:1 D5:1 C5:1 B4:1 C5:2 A4:2',
            /* 40 */ 'D5:2 D5:2 D5:2 D5:2 D5:1 C5:1 B4:1 A4:1 B4:2 G4:2',
            /* 41 */ 'C5:2 C5:2 C5:2 C5:2 C5:1 B4:1 A4:1 G4:1 A4:2 F#4:2',
            /* 42 */ 'B4:2 B4:2 B4:2 B4:2 B4:1 A4:1 G4:1 F#4:1 G4:2 E4:2',
            /* 43 */ 'A5:2 F#5:1 G5:1 A5:2 A5:2 A5:2 F#5:1 G5:1 A5:2 A5:2',
            /* 44 */ 'A5:2 F#5:1 G5:1 A5:2 B5:2 G5:6 F#5:1 E5:1',
            /* 45 */ 'B5:2 A5:1 G5:1 F#5:1 E5:1 D#5:1 F#5:1 E5:2 E4:2 r:2 E5:2',
            /* 46 */ 'B5:2 A5:1 G5:1 F#5:1 E5:1 D#5:1 F#5:1 E5:2 E4:2 r:2 B5:1 C6:1',
            /* 47 */ 'D6:2 D6:2 D6:2 D6:2 E5:2 B5:1 C6:1 D6:2 D6:2',
            /* 48 */ 'E5:2 B5:1 C6:1 D6:2 C6:1 B5:1 C6:2 A4:2 A4:2 A5:1 B5:1',
            /* 49 */ 'C6:2 C6:2 C6:2 C6:2 D4:2 A5:1 B5:1 C6:2 C6:2',
            /* 50 */ 'D4:2 A5:1 B5:1 C6:2 B5:1 A5:1 B5:2 G3:2 G3:2 G5:1 A5:1',
            /* 51 */ 'Bb5:2 Bb5:2 Bb5:2 Bb5:2 E5:2 G5:1 A5:1 Bb5:2 Bb5:2',
            /* 52 */ 'C#5:1 E5:1 F5:1 G5:1 A5:1 G5:1 F5:1 E5:1 F5:2 D5:2 D4:2 D5:1 E5:1',
            /* 53 */ 'F5:1 D5:1 C5:1 B4:1 G5:1 F5:1 E5:1 D5:1 E5:2 C5:2 C4:2 C5:1 D5:1',
            /* 54 */ 'E5:1 C5:1 B4:1 A4:1 F5:1 E5:1 D5:1 C5:1 D5:2 B4:2 B3:2 B4:1 C5:1',
            /* 55 */ 'D5:1 B4:1 A4:1 G#4:1 E5:1 D5:1 C5:1 B4:1 C5:2 A4:2 A3:2 C5:1 D5:1',
            /* 56 */ B56,
            /* 57 */ B56,
            /* 58 */ 'E5:2 D5:1 C5:1 B4:1 A4:1 G#4:1 B4:1 A4:2 A3:2 A3:2 E5:2',
            /* 59 */ B2,
            /* 60 */ 'A5:2 C6:1 B5:1 A5:2 G5:1 F5:1 E5:2 D5:1 C5:1 B4:2 G#5:2',
            /* 61 */ [arp('A5', 'C5 B4 A4'), arp('E5', 'C5 B4 A4'), arp('A5', 'C5 B4 A4'), arp('E5', 'C5 B4 A4')].join(' '),
            /* 62 */ [arp('A5', 'C#5 B4 A4'), arp('E5', 'C#5 B4 A4'), arp('A5', 'C#5 B4 A4'), arp('A5', 'G5 F#5 E5')].join(' '),
            /* 63 */ [arp('F#5', 'F#4 E4 D4'), arp('A4', 'F#4 E4 D4'), arp('D5', 'F#4 E4 D4'), arp('A4', 'F#4 E4 D4')].join(' '),
            /* 64 */ [arp('D5', 'F#4 E4 D4'), arp('D5', 'C5 B4 A4'), arp('B4', 'B3 A3 G3'), arp('D4', 'B3 A3 G3')].join(' '),
            /* 65 */ [arp('G4', 'B3 A3 G3'), arp('D4', 'B3 A3 G3'), arp('G4', 'B3 A3 G3'), arp('G4', 'F4 E4 D4')].join(' '),
            /* 66 */ [arp('E4', 'G4 F4 E4'), arp('C5', 'G4 F4 E4'), arp('C5', 'A4 G4 F4'), arp('D5', 'A4 G4 F#4')].join(' '),
            /* 67 */ [arp('D5', 'B4 A4 G4'), arp('E5', 'B4 A4 G#4'), arp('E5', 'C5 B4 A4'), arp('F5', 'C5 B4 A4')].join(' '),
            /* 68 */ [arp('F5', 'D5 C5 B4'), arp('G5', 'D5 C5 B4'), arp('G5', 'E5 D5 C5'), arp('A5', 'E5 D5 C#5')].join(' '),
            /* 69 */ 'A5:1 F#5:1 E5:1 D5:1 B5:1 A5:1 G#5:1 F#5:1 G#5:1 E4:1 G#4:1 B4:1 D5:2 D5:2',
            /* 70 */ 'D5:1 E4:1 G#4:1 B4:1 D5:2 D5:2 D5:1 E4:1 G#4:1 B4:1 D5:2 E5:2',
            /* 71 */ 'C5:2 B4:1 A4:1 F5:2 E5:1 D5:1 E5:2 A5:2 E4:2 G#5:2',
            /* 72 */ 'A5:4 r:2 E5:2 A5:1 G5:1 A5:1 E5:1 A5:1 G5:1 A5:1 E5:1',
            /* 73 */ 'F#5:1 E5:1 D5:1 E5:1 F#5:1 G5:1 A5:1 F#5:1 G5:1 F#5:1 G5:1 D5:1 G5:1 F5:1 G5:1 D5:1',
            /* 74 */ 'E5:1 D5:1 C5:1 D5:1 E5:1 F5:1 G5:1 E5:1 F5:1 E5:1 F5:1 C5:1 F5:1 E5:1 F5:1 C5:1',
            /* 75 */ 'D5:1 C5:1 B4:1 C5:1 D5:1 E5:1 F5:1 D5:1 E5:1 D5:1 E5:1 B4:1 E5:1 D5:1 E5:1 B4:1',
            /* 76 */ 'C5:1 A4:1 C5:1 E5:1 A5:2 A5:2 A5:1 A4:1 C5:1 E5:1 A5:2 A5:2',
            /* 77 */ 'A5:1 A4:1 C5:1 E5:1 Bb5:2 Bb5:2 Bb5:2 A5:1 G#5:1 A5:2 B5:2',
            /* 78 */ 'D5:9 E4:1 G#4:1 B4:1 D5:2 D5:2',
            /* 79 */ 'D5:1 E4:1 G#4:1 B4:1 D5:2 D5:2 D5:1 E4:1 G#4:1 B4:1 D5:2 E5:2',
            /* 80 */ 'C5:2 B4:1 A4:1 F5:2 E5:1 D5:1 E5:2 A5:2 E4:2 G#5:2',
            /* 81 */ 'A5:16',
        ];

        const OPEN_MIDI = [76, 69, 62, 55];   // E5 A4 D4 G3, same order as STRINGS
        const STEP = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        function toMidi(n) {
            const m = /^([A-G])(#|b)?(\d)$/.exec(n);
            return 12 * (+m[3] + 1) + STEP[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
        }
        // first position: the highest string whose open note is at or below the pitch
        function fingering(midi) {
            const si = OPEN_MIDI.findIndex(o => midi >= o);
            return { si, s: midi - OPEN_MIDI[si] };
        }
        const SCORE = VIVALDI.flatMap((bar, bi) => bar.trim().split(/\s+/).map(tok => {
            const [n, len] = tok.split(':');
            return { midi: n === 'r' ? null : toMidi(n), len: +len, bar: bi + 1 };
        }));
        const capFor = (si, s) => {
            const code = Object.keys(KEYMAP).find(c => KEYMAP[c].si === si && KEYMAP[c].s === s);
            return code ? keyCap(code) : null;
        };

        let demoTimer = null;
        const demoBtn = $('#demo-btn');
        function stopDemo() {
            if (demoTimer === null) return;
            clearTimeout(demoTimer);
            demoTimer = null;
            release('demo');
            $$('.kc.down').forEach(k => k.classList.remove('down'));
            demoBtn.querySelector('span').textContent = 'play Vivaldi';
        }
        demoBtn.addEventListener('click', () => {
            if (demoTimer !== null) { stopDemo(); return; }
            ensureAudio();
            demoBtn.querySelector('span').textContent = 'stop';
            const SIXTEENTH = 60000 / 108 / 4;                // ♩ = 108 (the printed part says 92)
            const lastBar = VIVALDI.length;
            let i = 0;
            let due = performance.now();
            const step = () => {
                if (i >= SCORE.length) { stopDemo(); return; }
                const ev = SCORE[i++];
                const rall = ev.bar >= lastBar - 1 ? 1.35 : 1;  // "rall." in the last two bars
                const ms = ev.len * SIXTEENTH * rall;
                $$('.kc.down').forEach(k => k.classList.remove('down'));
                if (ev.midi === null) {
                    release('demo');
                } else {
                    const { si, s } = fingering(ev.midi);
                    press('demo', si, s, ev.len <= 1 ? 0.012 : 0.03);
                    capFor(si, s)?.classList.add('down');
                    $('#np-string').textContent = `Vivaldi, A minor concerto · bar ${ev.bar} of ${lastBar}`;
                }
                due += ms;
                demoTimer = setTimeout(step, Math.max(0, due - performance.now()));
            };
            step();
        });

        // open / close
        let opener = null;
        function open(ev) {
            opener = ev.currentTarget;
            ensureAudio();
            stage.hidden = false;
            document.body.style.overflow = 'hidden';
            $('#stage-close').focus();
        }
        function close() {
            stopDemo();
            releaseAll();
            stage.hidden = true;
            document.body.style.overflow = '';
            opener?.focus();
        }
        $$('.open-stage').forEach(b => b.addEventListener('click', open));
        $('#stage-close').addEventListener('click', close);
    })();

})();
