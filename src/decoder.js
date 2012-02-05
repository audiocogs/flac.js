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
            
        var startOffset = stream.offset() // for debugging... remove!
        console.log('-------------')
        
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
        
        console.log('value = ', frame_or_sample_num)
        
        // block size
        if (bsCode === 0)
            return this.emit('error', 'Reserved blocksize code')
        else if (bsCode === 6)
            this.blockSize = stream.read(8) + 1
        else if (bsCode === 6)
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
            console.log('pos = ', stream.offset() - startOffset)
            if (this.decodeSubframe(i) < 0) {
                return this.emit('error', 'Error decoding subframe ' + i)
    		}
        }
        
        stream.align()
        stream.advance(16) // skip CRC frame footer
        
        // debugger
        var output = new ArrayBuffer(this.blockSize * channels * this.bps / 8), 
            i = 0;
        
        if (this.is32)
            var buf = new Int32Array(output)
        else
            var buf = new Int16Array(output)
            
        switch (chMode) {
            case CHMODE_INDEPENDENT:
                this.emit('error', 'TODO: implement')
                break
                
            case CHMODE_LEFT_SIDE:
                for (var i = 0; i < this.blockSize; i++) {
                    var left = this.decoded[0][i],
                        right = this.decoded[1][i];

                    buf[i++] = left << this.sampleShift
                    buf[i++] = (left - right) << this.sampleShift
                }
                break
                
            case CHMODE_RIGHT_SIDE:
                for (var i = 0; i < this.blockSize; i++) {
                    var left = this.decoded[0][i],
                        right = this.decoded[1][i];

                    buf[i++] = (left + right) << this.sampleShift
                    buf[i++] = right << this.sampleShift
                }
                break
                
            case CHMODE_MID_SIDE:
                for (var i = 0; i < this.blockSize; i++) {
                    var left = this.decoded[0][i],
                        right = this.decoded[1][i];

                    buf[i++] = ((left -= right >> 1) + right) << this.sampleShift
                    buf[i++] = left << this.sampleShift
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
            if (this.ch_mode === CHMODE_RIGHT_SIDE)
                this.curr_bps++
        } else {
            if (this.ch_mode === CHMODE_LEFT_SIDE || this.ch_mode === CHMODE_MID_SIDE)
            	this.curr_bps++
        }
        
        if (stream.readOne()) {
            this.emit('error', "Invalid subframe padding")
            return -1
        }
        
        var type = stream.readSmall(6)
        console.log(type, this.curr_bps)
        
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
            var tmp = stream.read(this.curr_bps)
            for (var i = 0; i < this.blockSize; i++)
                this.decoded[channel][i] = tmp
                
        } else if (type === 1) {
            for (i = 0; i < this.blockSize; i++)
                this.decoded[channel][i] = stream.read(this.curr_bps)
                
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
        var stream = this.bitstream
        var decoded = this.decoded[channel]
        var a = 0, b = 0, c = 0, d = 0
        
        // warm up samples
        for (var i = 0; i < predictor_order; i++) {
    		decoded[i] = stream.read(this.curr_bps) // TODO: Read signed bits (long)?
    	}
    	
    	if (this.decode_residuals(channel, predictor_order) < 0) {
    		return -1
    	}
    	
    	debugger
    }
    
    this.prototype.decode_subframe_lpc = function(channel, predictor_order) {
        
    }
    
    const INT_MAX = 32767
    
    this.prototype.decode_residuals = function(channel, predictor_order) {
        var sample = 0,
            stream = this.bitstream,
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
                    this.decoded[channel][sample++] = stream.readBig(tmp) // TODO: signed bits
                    
            } else {
                for (; i < samples; i++)
                    this.decoded[channel][sample++] = this.golomb(tmp, INT_MAX, 0)
            }
            i = 0
        }

        return 0
    }
    
    this.prototype.golomb = function(k, limit, esc_len) {
        throw 'golomb'
    }
    
})