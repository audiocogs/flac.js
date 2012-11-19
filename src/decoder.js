/*
 * FLAC.js - Free Lossless Audio Codec decoder in JavaScript
 * Original C version from FFmpeg (c) 2003 Alex Beregszaszi
 * JavaScript port by Devon Govett and Jens Nockert of Official.fm Labs
 * 
 * Licensed under the same terms as the original.  The original
 * license follows.
 *
 * FLAC.js is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * FLAC.js is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 */

var FLACDecoder = AV.Decoder.extend(function() {
    AV.Decoder.register('flac', this);
    
    this.prototype.setCookie = function(cookie) {
        this.cookie = cookie;
        
        // initialize arrays
        this.decoded = [];
        for (var i = 0; i < this.format.channelsPerFrame; i++) {
            this.decoded[i] = new Int32Array(cookie.maxBlockSize);
        }
    };
    
    const BLOCK_SIZES = new Int16Array([
               0,      192, 576 << 0, 576 << 1, 576 << 2, 576 << 3,        0,        0,
        256 << 0, 256 << 1, 256 << 2, 256 << 3, 256 << 4, 256 << 5, 256 << 6, 256 << 7
    ]);
    
    const SAMPLE_RATES = new Int32Array([
        0, 88200, 176400, 192000,
        8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000,
        0, 0, 0, 0
    ]);
    
    const SAMPLE_SIZES = new Int8Array([
        0, 8, 12, 0, 16, 20, 24, 0
    ]);
    
    const MAX_CHANNELS = 8,
          CHMODE_INDEPENDENT = 0,
          CHMODE_LEFT_SIDE = 8,
          CHMODE_RIGHT_SIDE = 9,
          CHMODE_MID_SIDE = 10;
    
    this.prototype.readChunk = function() {
        var stream = this.bitstream;
        if (!stream.available(32))
            return;
                            
        // frame sync code
        if ((stream.read(15) & 0x7FFF) !== 0x7FFC)
            throw new Error('Invalid sync code');
            
        var isVarSize = stream.read(1),  // variable block size stream code
            bsCode = stream.read(4),  // block size
            srCode = stream.read(4),  // sample rate code
            chMode = stream.read(4),  // channel mode
            bpsCode = stream.read(3); // bits per sample
            
        stream.advance(1); // reserved bit
        
        // channels
        this.chMode = chMode;
        var channels;
        
        if (chMode < MAX_CHANNELS) {
            channels = chMode + 1;
            this.chMode = CHMODE_INDEPENDENT;
        } else if (chMode <= CHMODE_MID_SIDE) {
            channels = 2;
        } else {
            throw new Error('Invalid channel mode');
        }
        
        if (channels !== this.format.channelsPerFrame)
            throw new Error('Switching channel layout mid-stream not supported.');
        
        // bits per sample    
        if (bpsCode === 3 || bpsCode === 7)
            throw new Error('Invalid sample size code');
            
        this.bps = SAMPLE_SIZES[bpsCode];
        if (this.bps !== this.format.bitsPerChannel)
            throw new Error('Switching bits per sample mid-stream not supported.');
        
        var sampleShift, is32;    
        if (this.bps > 16) {
            sampleShift = 32 - this.bps;
            is32 = true;
        } else {
            sampleShift = 16 - this.bps;
            is32 = false;
        }
        
        // sample number or frame number
        // see http://www.hydrogenaudio.org/forums/index.php?s=ea7085ffe6d57132c36e6105c0d434c9&showtopic=88390&pid=754269&st=0&#entry754269
        var ones = 0;
        while (stream.read(1) === 1)
            ones++;
        
        var frame_or_sample_num = stream.read(7 - ones);
        for (; ones > 1; ones--) {
            stream.advance(2); // == 2
            frame_or_sample_num = (frame_or_sample_num << 6) | stream.read(6);
        }
                
        // block size
        if (bsCode === 0)
            throw new Error('Reserved blocksize code');
        else if (bsCode === 6)
            this.blockSize = stream.read(8) + 1;
        else if (bsCode === 7)
            this.blockSize = stream.read(16) + 1;
        else
            this.blockSize = BLOCK_SIZES[bsCode];
            
        // sample rate
        var sampleRate;
        if (srCode < 12)
            sampleRate = SAMPLE_RATES[srCode];
        else if (srCode === 12)
            sampleRate = stream.read(8) * 1000;
        else if (srCode === 13)
            sampleRate = stream.read(16);
        else if (srCode === 14)
            sampleRate = stream.read(16) * 10;
        else
            throw new Error('Invalid sample rate code');
            
        stream.advance(8); // skip CRC check
        
        // subframes
        for (var i = 0; i < channels; i++)
            this.decodeSubframe(i);
        
        stream.align();
        stream.advance(16); // skip CRC frame footer
        
        var output = new ArrayBuffer(this.blockSize * channels * this.bps / 8),
            buf = is32 ? new Int32Array(output) : new Int16Array(output),
            blockSize = this.blockSize,
            decoded = this.decoded,
            j = 0;
            
        switch (this.chMode) {
            case CHMODE_INDEPENDENT:
                for (var k = 0; k < blockSize; k++) {
                    for (var i = 0; i < channels; i++) {
                        buf[j++] = decoded[i][k] << sampleShift;
                    }
                }
                break;
                
            case CHMODE_LEFT_SIDE:
                for (var i = 0; i < blockSize; i++) {
                    var left = decoded[0][i],
                        right = decoded[1][i];

                    buf[j++] = left << sampleShift;
                    buf[j++] = (left - right) << sampleShift;
                }
                break;
                
            case CHMODE_RIGHT_SIDE:
                for (var i = 0; i < blockSize; i++) {
                    var left = decoded[0][i],
                        right = decoded[1][i];

                    buf[j++] = (left + right) << sampleShift;
                    buf[j++] = right << sampleShift;
                }
                break;
                
            case CHMODE_MID_SIDE:
                for (var i = 0; i < blockSize; i++) {
                    var left = decoded[0][i],
                        right = decoded[1][i];
                    
                    left -= right >> 1;
                    buf[j++] = (left + right) << sampleShift;
                    buf[j++] = left << sampleShift;
                }
                break;
        }
        
        return buf;
    };
    
    this.prototype.decodeSubframe = function(channel) {
        var wasted = 0,
            stream = this.bitstream,
            blockSize = this.blockSize,
            decoded = this.decoded;
        
        this.curr_bps = this.bps;
        if (channel === 0) {
            if (this.chMode === CHMODE_RIGHT_SIDE)
                this.curr_bps++;
        } else {
            if (this.chMode === CHMODE_LEFT_SIDE || this.chMode === CHMODE_MID_SIDE)
                this.curr_bps++;
        }
        
        if (stream.read(1))
            throw new Error("Invalid subframe padding");
        
        var type = stream.read(6);
        
        if (stream.read(1)) {
            wasted = 1;
            while (!stream.read(1))
                wasted++;

            this.curr_bps -= wasted;
        }
        
        if (this.curr_bps > 32)
            throw new Error("decorrelated bit depth > 32 (" + this.curr_bps + ")");
        
        if (type === 0) {
            var tmp = stream.read(this.curr_bps, true);
            for (var i = 0; i < blockSize; i++)
                decoded[channel][i] = tmp;
                
        } else if (type === 1) {
            var bps = this.curr_bps;
            for (var i = 0; i < blockSize; i++)
                decoded[channel][i] = stream.read(bps, true);
                
        } else if ((type >= 8) && (type <= 12)) {
            this.decode_subframe_fixed(channel, type & ~0x8);
                
        } else if (type >= 32) {
            this.decode_subframe_lpc(channel, (type & ~0x20) + 1);

        } else {
            throw new Error("Invalid coding type");
        }
        
        if (wasted) {
            for (var i = 0; i < blockSize; i++)
                decoded[channel][i] <<= wasted;
        }
    };
    
    this.prototype.decode_subframe_fixed = function(channel, predictor_order) {
        var decoded = this.decoded[channel],
            stream = this.bitstream,
            bps = this.curr_bps;
    
        // warm up samples
        for (var i = 0; i < predictor_order; i++)
            decoded[i] = stream.read(bps, true);
    
        this.decode_residuals(channel, predictor_order);
        
        var a = 0, b = 0, c = 0, d = 0;
        
        if (predictor_order > 0) 
            a = decoded[predictor_order - 1];
        
        if (predictor_order > 1)
            b = a - decoded[predictor_order - 2];
        
        if (predictor_order > 2) 
            c = b - decoded[predictor_order - 2] + decoded[predictor_order - 3];
        
        if (predictor_order > 3)
            d = c - decoded[predictor_order - 2] + 2 * decoded[predictor_order - 3] - decoded[predictor_order - 4];
            
        switch (predictor_order) {
            case 0:
                break;
                
            case 1:
            case 2:
            case 3:
            case 4:
                var abcd = new Int32Array([a, b, c, d]),
                    blockSize = this.blockSize;
                    
                for (var i = predictor_order; i < blockSize; i++) {
                    abcd[predictor_order - 1] += decoded[i];
                    
                    for (var j = predictor_order - 2; j >= 0; j--) {
                        abcd[j] += abcd[j + 1];
                    }
                    
                    decoded[i] = abcd[0];
                }
                
                break;
                
            default:
                throw new Error("Invalid Predictor Order " + predictor_order);
        }
    };
    
    this.prototype.decode_subframe_lpc = function(channel, predictor_order) {
        var stream = this.bitstream,
            decoded = this.decoded[channel],
            bps = this.curr_bps,
            blockSize = this.blockSize;
            
        // warm up samples
        for (var i = 0; i < predictor_order; i++) {
            decoded[i] = stream.read(bps, true);
        }

        var coeff_prec = stream.read(4) + 1;
        if (coeff_prec === 16)
            throw new Error("Invalid coefficient precision");
        
        var qlevel = stream.read(5, true);
        if (qlevel < 0)
            throw new Error("Negative qlevel, maybe buggy stream");
        
        var coeffs = new Int32Array(32);
        for (var i = 0; i < predictor_order; i++) {
            coeffs[i] = stream.read(coeff_prec, true);
        }
        
        this.decode_residuals(channel, predictor_order);
        
        if (this.bps > 16)
            throw new Error("no 64-bit integers in JS, could probably use doubles though");
            
        for (var i = predictor_order; i < blockSize - 1; i += 2) {
            var d = decoded[i - predictor_order],
                s0 = 0, s1 = 0, c;

            for (var j = predictor_order - 1; j > 0; j--) {
                c = coeffs[j];
                s0 += c * d;
                d = decoded[i - j];
                s1 += c * d;
            }

            c = coeffs[0];
            s0 += c * d;
            d = decoded[i] += (s0 >> qlevel);
            s1 += c * d;
            decoded[i + 1] += (s1 >> qlevel);
        }

        if (i < blockSize) {
            var sum = 0;
            for (var j = 0; j < predictor_order; j++)
                sum += coeffs[j] * decoded[i - j - 1];

            decoded[i] += (sum >> qlevel);
        }
    };
    
    const INT_MAX = 32767;
    
    this.prototype.decode_residuals = function(channel, predictor_order) {
        var stream = this.bitstream,
            method_type = stream.read(2);
            
        if (method_type > 1)
            throw new Error('Illegal residual coding method ' + method_type);
        
        var rice_order = stream.read(4),
            samples = (this.blockSize >>> rice_order);
            
        if (predictor_order > samples)
            throw new Error('Invalid predictor order ' + predictor_order + ' > ' + samples);
        
        var decoded = this.decoded[channel],
            sample = predictor_order, 
            i = predictor_order;
        
        for (var partition = 0; partition < (1 << rice_order); partition++) {
            var tmp = stream.read(method_type === 0 ? 4 : 5);

            if (tmp === (method_type === 0 ? 15 : 31)) {
                tmp = stream.read(5);
                for (; i < samples; i++)
                    decoded[sample++] = stream.read(tmp, true);
                    
            } else {
                for (; i < samples; i++)
                    decoded[sample++] = this.golomb(tmp, INT_MAX, 0);
            }
            
            i = 0;
        }
    };
    
    const MIN_CACHE_BITS = 25;
    
    this.prototype.golomb = function(k, limit, esc_len) {
        var data = this.bitstream,
            offset = data.bitPosition,
            buf = data.peek(32 - offset) << offset,
            v = 0;
        
        var log = 31 - clz(buf | 1); // log2(buf)

        if (log - k >= 32 - MIN_CACHE_BITS && 32 - log < limit) {
            buf >>>= log - k;
            buf += (30 - log) << k;

            data.advance(32 + k - log);
            v = buf;
            
        } else {
            for (var i = 0; data.read(1) === 0; i++)
                buf = data.peek(32 - offset) << offset;

            if (i < limit - 1) {
                if (k)
                    buf = data.read(k);
                else
                    buf = 0;

                v = buf + (i << k);
                
            } else if (i === limit - 1) {
                buf = data.read(esc_len);
                v = buf + 1;
                
            } else {
                v = -1;
            }
        }
        
        return (v >> 1) ^ -(v & 1);
    };
    
    // Should be in the damned standard library...
    function clz(input) {
        var output = 0,
            curbyte = 0;

        while(true) { // emulate goto in JS using the break statement :D
            curbyte = input >>> 24;
            if (curbyte) break;
            output += 8;

            curbyte = input >>> 16;
            if (curbyte & 0xff) break;
            output += 8;

            curbyte = input >>> 8;
            if (curbyte & 0xff) break;
            output += 8;

            curbyte = input;
            if (curbyte & 0xff) break;
            output += 8;

            return output;
        }

        if (!(curbyte & 0xf0))
            output += 4;
        else
            curbyte >>>= 4;

        if (curbyte & 0x8)
            return output;
            
        if (curbyte & 0x4)
            return output + 1;
            
        if (curbyte & 0x2)
            return output + 2;
            
        if (curbyte & 0x1)
            return output + 3;

        // shouldn't get here
        return output + 4;
    }
});