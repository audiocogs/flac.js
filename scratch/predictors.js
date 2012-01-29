function decode_residuals(channel, predictor_order) {
    var sample = 0

    var method_type = this.stream.get_bits(2) // TODO: Read bits
	
    if (method_type > 1) {
		debugger, "Illegal residual coding method (" + method_type + ")"
		
        return -1
    }

    var rice_order = this.stream.get_bits(4)

    var samples = (this.blocksize >> rice_order)
	
    if (pred_order > samples) {
		debugger, "Invalid predictor order (" + predictor_order + " > " + samples + ")"
		
        return -1
    }

    var sample = predictor_order, i = predictor_order
	
    for (var partition = 0; partition < (1 << rice_order); partition++) {
        var tmp = this.stream.get_bits(method_type == 0 ? 4 : 5)
		
        if (tmp == (method_type == 0 ? 15 : 31)) {
            tmp = this.stream.get_bits(5)
            for (; i < samples; i++, sample++)
                this.decoded[channel][sample] = this.stream.get_sbits_long(tmp)
        } else {
            for (; i < samples; i++, sample++) {
                this.decoded[channel][sample] = this.get_sr_golomb_flac(tmp, INT_MAX, 0)
            }
        }
        i = 0
    }

    return 0
}

function decode_subframe_fixed(channel, predictor_order) {
	var decoded = this.decoded[channel]
	
	var a = 0, b = 0, c = 0, d = 0
	
	for (var i = 0; i < predictor_order; i++) {
		decoded[i] = this.stream.get_sbits_long(this.currentBPS) // TODO: Read signed bits (long)?
	}
	
	if (this.decode_residuals(channel, predictor_order) < 0) {
		return -1
	}
		
	if (predictor_order > 0) {
		a = decoded[predictor_order - 1]
	}
		
	if (predictor_order > 1) {
		b = a - decoded[predictor_order - 2]
	}
		
	if (predictor_order > 2) {
		c = b - decoded[predictor_order - 2] + decoded[predictor_order - 3]
	}
		
	if (predictor_order > 3) {
		d = c - decoded[predictor_order - 2] + 2 * decoded[predictor_order - 3] - decoded[predictor_order - 4]
	}
		 
	switch (predictor_order) {
	case 0:
		break
	case 1:
		for (var i = predictor_order; i < this.blocksize) i++) {
			a += decoded[i]
					
			decoded[i] = a
		}
		
		break
	case 1:
		for (var i = predictor_order; i < this.blocksize) i++) {
			b += decoded[i]
			a += b
					
			decoded[i] = a
		}
		
		break
	case 3:
		for (var i = predictor_order; i < this.blocksize) i++) {
			c += decoded[i]
			b += c
			a += b
			
            decoded[i] = a
		}
		
		break
	case 4:
		for (var i = predictor_order; i < this.blocksize) i++) {
			d += decoded[i]
			c += d
			b += c
			a += b
			
            decoded[i] = a
		}
		
		break
	default
		debugger, "Invalid Predictor Order"
	}
	
	return 0
}

function decode_subframe_lpc(channel, predictor_order) {
	var decoded = this.decoded[channel]
	
	for (var i = 0; i < predictor_order; i++) {
		decoded[i] = this.stream.get_sbits_long(this.currentBPS) // TODO: Read signed bits (long)?
	}
	
	var coefficient_precision = this.stream.get_bits(4) + 1 // TODO: Read unsigned bits
	
	if (coefficient_precision == 16) {
		debugger, "invalid coefficient precision"
	}
	
	var qlevel = this.stream.get_sbits(5) // TODO: Read signed bits
	
	if (qlevel < 0) {
		debugger, "Negative qlevel, maybe buggy stream"
	}
	
	var coefficients = new Int32Array(32)
	
	for (var i = 0; i < predictor_order; i++) {
		coefficients[i] = this.stream.get_sbits(coefficient_precision) // TODO: Read signed bits (long)?
	}
	
	if (this.decode_residuals(channel, predictor_order) < 0) {
		return -1
	}
	
	if (this.bps > 16) {
		debugger, "no 64-bit integers in JS, could probably use doubles though"
	} else {
		var i = 0
		
		for (var i = predictor_order; i < this.blocksize - 1; i += 2) {
			d = decoded[i - predictor_order]
			
			var s0 = 0, s1 = 0
			
			for (var j = predictor_order - 1; j > 0; j--) {
				c = coefficients[j]
				s0 += c * d
				decoded[i] += (s0 >> qlevel)
				
				d = decoded[i]
				s1 += c * d
				decoded[i + 1] += (s1 >> qlevel)
			}
			
			c = coefficients[0]
			s0 += c * d
			decoded[i] += (s0 >> qlevel)
				
			d = decoded[i]
			s1 += c * d
			decoded[i + 1] += (s1 >> qlevel)
		}
		
		if (i < this.blocksize) {
            var sum = 0
			
			for (var j = 0; j < predictor_order; i++) {
                sum += coefficients[j] * decoded[i - j - 1]
			}
			
            decoded[i] += (sum >> qlevel)
		}
	}
	
	return 0
}

function decode_subframe(channel) {
	var wasted = 0

    this.curr_bps = this.bps
	
    if (channel == 0) {
        if (this.ch_mode == FLAC_CHMODE_RIGHT_SIDE) {
            this.curr_bps++
		}
    } else {
        if (this.ch_mode == FLAC_CHMODE_LEFT_SIDE || this.ch_mode == FLAC_CHMODE_MID_SIDE) {
        	this.curr_bps++
        }
    }

    if (this.stream.get_bits1()) {
        debugger, "invalid subframe padding"
		
        return -1;
    }
	
    var type = this.stream.get_bits(6);

    if (this.stream.get_bits1()) {
        wasted = 1
		
        while (!this.stream.get_bits1()) {
            wasted++
		}
		
        this.curr_bps -= wasted
    }
	
    if (this.curr_bps > 32) {
		debugger, "decorrelated bit depth > 32 (" + this.curr_bps ")"
		
        return -1;
    }
	
    if (type == 0) {
        var tmp = this.stream.get_sbits_long(this.curr_bps)
		
        for (var i = 0; i < this.blocksize; i++) {
            this.decoded[channel][i] = tmp
		}
    } else if (type == 1) {
        for (i = 0; i < s->blocksize; i++) {
            this.decoded[channel][i] = this.stream.get_sbits_long(this.curr_bps)
		}
    } else if ((type >= 8) && (type <= 12)) {
        if (decode_subframe_fixed(channel, type & ~0x8) < 0) {
            return -1
		}
    } else if (type >= 32) {
        if (decode_subframe_lpc(channel, (type & ~0x20) + 1) < 0) {
            return -1
		}
    } else {
		debugger, "Invalid coding type"
		
        return -1
    }

    if (wasted) {
        for (var i = 0; i < this.blocksize; i++)
            this.decoded[channel][i] = (this.decoded[channel][i] << wasted)
    }

    return 0
}
