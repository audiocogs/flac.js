FLACDecoder = Decoder.extend(function() {
    Decoder.register('flac', this)
    
    this.prototype.setCookie = function(cookie) {
        this.cookie = cookie
        console.log(cookie)
    }
    
    const BLOCK_SIZES = new Int16Array([
             0,    192, 576<<0, 576<<1, 576<<2, 576<<3,      0,      0,
        256<<0, 256<<1, 256<<2, 256<<3, 256<<4, 256<<5, 256<<6, 256<<7
    ])
    
    const SAMPLE_RATES = new Int32Array([
        0, 88200, 176400, 192000,
        8000, 16000, 22050, 24000, 32000, 44100, 48000, 96000,
        0, 0, 0, 0
    ])
    
    const SAMPLE_SIZES = new Int8Array([
        0, 8, 12, 0, 16, 20, 24, 0
    ])
    
    const MAX_CHANNELS = 8,
          CHMODE_INDEPENDENT = 0,
          CHMODE_LEFT_SIDE = 8,
          CHMODE_RIGHT_SIDE = 9,
          CHMODE_MID_SIDE = 10
    
    this.prototype.readChunk = function() {
        var stream = this.bitstream
        
        if (!stream.available(4096 << 6) && !this.receivedFinalBuffer)
            return this.once('available', this.readChunk)
                    
        // frame sync code
        if ((stream.read(15) & 0x7FFF) !== 0x7FFC)
            return this.emit('error', 'Invalid sync code')
            
        var isVarSize = stream.readOne(), // variable block size stream code
            bsCode = stream.readSmall(4), // block size
            srCode = stream.readSmall(4), // sample rate code
            chMode = stream.readSmall(4), // channel mode
            bpsCode = stream.readSmall(3); // bits per sample
            
        stream.advance(1) // reserved bit
        
        // channels
        this.chMode = chMode
        if (chMode < MAX_CHANNELS) {
            var channels = chMode + 1
            this.chMode = CHMODE_INDEPENDENT
        } else if (chMode <= CHMODE_MID_SIDE) {
            var channels = 2
        } else {
            return this.emit('error', 'Invalid channel mode')
        }
        
        if (channels !== this.format.channelsPerFrame)
            return this.emit('error', 'Switching channel layout mid-stream not supported.')
        
        // bits per sample    
        if (bpsCode === 3 || bpsCode === 7)
            return this.emit('error', 'Invalid sample size code')
            
        this.bps = SAMPLE_SIZES[bpsCode]
        if (this.bps !== this.format.bitsPerChannel)
            return this.emit('error', 'Switching bits per sample mid-stream not supported.')
            
        if (this.bps > 16) {
            this.sampleShift = 32 - this.bps
            this.is32 = true
        } else {
            this.sampleShift = 16 - this.bps
            this.is32 = false
        }
        
        // sample number or frame number
        // see http://www.hydrogenaudio.org/forums/index.php?s=ea7085ffe6d57132c36e6105c0d434c9&showtopic=88390&pid=754269&st=0&#entry754269
        var ones = 0;
        while (stream.readOne() === 1)
            ones++
        
        var frame_or_sample_num = stream.read(7 - ones)
        for (; ones > 1; ones--) {
            stream.advance(2) // == 2
            frame_or_sample_num = (frame_or_sample_num << 6) | stream.read(6)
        }
                
        // block size
        if (bsCode === 0)
            return this.emit('error', 'Reserved blocksize code')
        else if (bsCode === 6)
            this.blockSize = stream.read(8) + 1
        else if (bsCode === 7)
            this.blockSize = stream.read(16) + 1
        else
            this.blockSize = BLOCK_SIZES[bsCode]
            
        // sample rate
        if (srCode < 12)
            var sampleRate = SAMPLE_RATES[srCode]
        else if (srCode == 12)
            var sampleRate = stream.read(8) * 1000
        else if (srCode == 13)
            var sampleRate = stream.read(16)
        else if (srCode == 14)
            var sampleRate = stream.read(16) * 10
        else
            return this.emit('error', 'Invalid sample rate code')
            
        stream.advance(8) // skip CRC check
        
        this.decoded = []
        for (var i = 0; i < channels; i++) {
            this.decoded[i] = new Int32Array(this.cookie.maxBlockSize)
        }
        
        // subframes
        for (var i = 0; i < channels; i++) {
            if (this.decodeSubframe(i) < 0) {
                return this.emit('error', 'Error decoding subframe ' + i)
            }
        }
        
        stream.align()
        stream.advance(16) // skip CRC frame footer
        
        var output = new ArrayBuffer(this.blockSize * channels * this.bps / 8),
            j = 0;
        
        if (this.is32)
            var buf = new Int32Array(output)
        else
            var buf = new Int16Array(output)
            
        switch (this.chMode) {
            case CHMODE_INDEPENDENT:
                for (var k = 0; k < this.blockSize; k++) {
                    for (var i = 0; i < channels; i++) {
                        buf[j++] = this.decoded[i][k] << this.sampleShift
                    }
                }
                break
                
            case CHMODE_LEFT_SIDE:
                for (var i = 0; i < this.blockSize; i++) {
                    var left = this.decoded[0][i],
                        right = this.decoded[1][i];

                    buf[j++] = left << this.sampleShift
                    buf[j++] = (left - right) << this.sampleShift
                }
                break
                
            case CHMODE_RIGHT_SIDE:
                for (var i = 0; i < this.blockSize; i++) {
                    var left = this.decoded[0][i],
                        right = this.decoded[1][i];

                    buf[j++] = (left + right) << this.sampleShift
                    buf[j++] = right << this.sampleShift
                }
                break
                
            case CHMODE_MID_SIDE:
                for (var i = 0; i < this.blockSize; i++) {
                    var left = this.decoded[0][i],
                        right = this.decoded[1][i];
                    
                    buf[j++] = ((left -= right >> 1) + right) << this.sampleShift
                    buf[j++] = left << this.sampleShift
                }
                break
        }
        
        this.emit('data', buf)
    }
    
    this.prototype.decodeSubframe = function(channel) {
        var wasted = 0,
            stream = this.bitstream
        
        this.curr_bps = this.bps
        if (channel === 0) {
            if (this.chMode === CHMODE_RIGHT_SIDE)
                this.curr_bps++
        } else {
            if (this.chMode === CHMODE_LEFT_SIDE || this.chMode === CHMODE_MID_SIDE)
                this.curr_bps++
        }
        
        if (stream.readOne()) {
            this.emit('error', "Invalid subframe padding")
            return -1
        }
        
        var type = stream.readSmall(6)
        
        if (stream.readOne()) {
            wasted = 1
            while (!stream.readOne())
                wasted++

            this.curr_bps -= wasted
        }
        
        if (this.curr_bps > 32) {
            this.emit('error', "decorrelated bit depth > 32 (" + this.curr_bps + ")")
            return -1
        }
        
        if (type === 0) {
            var tmp = stream.readSigned(this.curr_bps)
            for (var i = 0; i < this.blockSize; i++)
                this.decoded[channel][i] = tmp
                
        } else if (type === 1) {
            for (var i = 0; i < this.blockSize; i++)
                this.decoded[channel][i] = stream.readSigned(this.curr_bps)
                
        } else if ((type >= 8) && (type <= 12)) {
            if (this.decode_subframe_fixed(channel, type & ~0x8) < 0)
                return -1
                
        } else if (type >= 32) {
            if (this.decode_subframe_lpc(channel, (type & ~0x20) + 1) < 0)
                return -1

        } else {
            this.emit('error', "Invalid coding type")
            return -1
        }
        
        if (wasted) {
            for (var i = 0; i < this.blockSize; i++)
                this.decoded[channel][i] <<= wasted
        }

        return 0
    }
    
    this.prototype.decode_subframe_fixed = function(channel, predictor_order) {
        var decoded = this.decoded[channel],
            stream = this.bitstream
            
        var a = 0, b = 0, c = 0, d = 0
    
        // warm up samples
        for (var i = 0; i < predictor_order; i++) {
            decoded[i] = stream.readSigned(this.curr_bps) // TODO: Read signed bits (long)?
        }
    
        if (this.decode_residuals(channel, predictor_order) < 0) {
            return -1
        }
        
        if (predictor_order > 0) 
            a = decoded[predictor_order - 1]
        
        if (predictor_order > 1)
            b = a - decoded[predictor_order - 2]
        
        if (predictor_order > 2) 
            c = b - decoded[predictor_order - 2] + decoded[predictor_order - 3]
        
        if (predictor_order > 3)
            d = c - decoded[predictor_order - 2] + 2 * decoded[predictor_order - 3] - decoded[predictor_order - 4]
         
        switch (predictor_order) {
            case 0:
                break
                
            case 1:
                for (var i = predictor_order; i < this.blockSize; i++) {
                    a += decoded[i]
                    decoded[i] = a
                }
                break
                
            case 1:
                for (var i = predictor_order; i < this.blockSize; i++) {
                    b += decoded[i]
                    a += b
                    decoded[i] = a
                }
                break
                
            case 3:
                for (var i = predictor_order; i < this.blockSize; i++) {
                    c += decoded[i]
                    b += c
                    a += b
                    decoded[i] = a
                }
                break
                
            case 4:
                for (var i = predictor_order; i < this.blockSize; i++) {
                    d += decoded[i]
                    c += d
                    b += c
                    a += b
                    decoded[i] = a
                }
                break

            default:
                this.emit('error', "Invalid Predictor Order " + predictor_order)
                return -1
        }
    
        return 0
    }
    
    this.prototype.decode_subframe_lpc = function(channel, predictor_order) {
        var stream = this.bitstream,
            decoded = this.decoded[channel]
            
        // warm up samples
        for (var i = 0; i < predictor_order; i++) {
            decoded[i] = stream.readSigned(this.curr_bps) // TODO: Read signed bits (long)?
        }

        var coeff_prec = stream.read(4) + 1
        if (coeff_prec === 16) {
            this.emit('error', "Invalid coefficient precision")
            return -1
        }
        
        var qlevel = stream.readSigned(5) // TODO: Read signed bits
        if (qlevel < 0) {
            this.emit('error', "Negative qlevel, maybe buggy stream")
            return -1
        }
        
        var coeffs = new Int32Array(32)
        for (var i = 0; i < predictor_order; i++) {
            coeffs[i] = stream.readSigned(coeff_prec) // TODO: Read signed bits (long)?
        }
        
        if (this.decode_residuals(channel, predictor_order) < 0) {
            return -1
        }
        
        if (this.bps > 16) {
            this.emit('error', "no 64-bit integers in JS, could probably use doubles though")
            return -1
        }
            
        for (var i = predictor_order; i < this.blockSize - 1; i += 2) {
            var d = decoded[i - predictor_order]
            var s0 = 0, s1 = 0

            for (var j = predictor_order - 1; j > 0; j--) {
                var c = coeffs[j]
                s0 += c * d
                d = decoded[i - j]
                s1 += c * d
            }

            c = coeffs[0]
            s0 += c * d
            d = decoded[i] += (s0 >> qlevel)
            s1 += c * d
            decoded[i + 1] += (s1 >> qlevel)
        }

        if (i < this.blockSize) {
            var sum = 0
            for (var j = 0; j < predictor_order; j++)
                sum += coeffs[j] * decoded[i - j - 1]

            decoded[i] += (sum >> qlevel)
        }

        return 0
    }
    
    const INT_MAX = 32767
    
    this.prototype.decode_residuals = function(channel, predictor_order) {
        var stream = this.bitstream,
            method_type = stream.readSmall(2)
            
        if (method_type > 1) {
            this.emit('error', 'Illegal residual coding method ' + method_type)
            return -1
        }
        
        var rice_order = stream.readSmall(4),
            samples = (this.blockSize >>> rice_order)
            
        if (predictor_order > samples) {
            this.emit('error', 'Invalid predictor order ' + predictor_order + ' > ' + samples)
            return -1
        }
        
        var sample = predictor_order, 
            i = predictor_order
        
        for (var partition = 0; partition < (1 << rice_order); partition++) {
            var tmp = stream.read(method_type === 0 ? 4 : 5)

            if (tmp === (method_type === 0 ? 15 : 31)) {
                tmp = stream.readSmall(5)
                for (; i < samples; i++)
                    this.decoded[channel][sample++] = stream.readSigned(tmp) // TODO: signed bits
                    
            } else {
                for (; i < samples; i++) {
                    this.decoded[channel][sample++] = this.golomb(tmp, INT_MAX, 0)
                }
            }
            i = 0
        }
        
        return 0
    }
    
    this.prototype.golomb = function(k, limit, esc_len) {
        var v = get_ur_golomb_jpegls(this.bitstream, k, limit, esc_len)
        return (v >> 1) ^ -(v & 0x1)
    }
    
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

            curbyte = input >> 8;
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

    // Another function that should be in the standard library...
    function log2(value) {
        return 31 - clz(value | 1)
    }
    
    const MIN_CACHE_BITS = 25,
          MAX_PREFIX_32 = 9

    function get_ur_golomb_jpegls(data, k, limit, esc_len) {
        var offset = data.bitPosition
        var buf = data.peekBig(32 - offset) << offset
        
        var log = log2(buf) // First non-zero bit?
        // throw log - k >= 32 - MIN_CACHE_BITS && 32 - log < limit

        if (log - k >= 32 - MIN_CACHE_BITS && 32 - log < limit) {
            buf >>= log - k
            buf += (30 - log) << k

            data.advance(32 + k - log)
            return buf
            
        } else {
            for (var i = 0; data.peek(1) === 0; i++) {
                data.advance(1)
                buf = data.peekBig(32 - offset) << offset
            }

            data.advance(1)

            if (i < limit - 1) {
                if (k) {
                    buf = data.read(k)
                } else {
                    buf = 0
                }

                return buf + (i<<k)
                
            } else if (i === limit - 1) {
                buf = data.read(esc_len)
                return buf + 1
                
            } else {
                return -1
            }
        }
    }
    
})