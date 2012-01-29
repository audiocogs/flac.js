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