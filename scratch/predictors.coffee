decode_subframe_fixed = (channel, predictor_order) ->
	decoded = @decoded[channel]
	
	for i in [0 ... pred_order] by 1
		decoded[i] = @stream.get_sbits_long(@currentBPS) # TODO: Read signed bits (long)?
	
	return -1 if this.decode_residuals(channel, predictor_order) < 0
		
	if predictor_order > 0
		a = decoded[predictor_order - 1]
		
	if predictor_order > 1
		b = a - decoded[predictor_order - 2]
		
	if predictor_order > 2
		c = b - decoded[predictor_order - 2] + decoded[predictor_order - 3]
		
	if predictor_order > 3
		d = c - decoded[predictor_order - 2] + 2 * decoded[predictor_order - 3] - decoded[predictor_order - 4]
		 
	switch predictor_order
		when 0
		when 1
			for i in [predictor_order ... @blocksize] by 1
				a += decoded[i]
					
				decoded[i] = a
		when 1
			for i in [predictor_order ... @blocksize] by 1
				b += decoded[i]
				a += b
					
				decoded[i] = a
			
		when 3
			for i in [predictor_order ... @blocksize] by 1
				c += decoded[i]
				b += c
				a += b
			
	            decoded[i] = a
		when 4
			for i in [predictor_order ... @blocksize] by 1
				d += decoded[i]
				c += d
				b += c
				a += b
			
	            decoded[i] = a
		else
			debugger, "Invalid Predictor Order"
		
	
	return 0

decode_subframe_lpc = (channel, predictor_order) ->
	decoded = @decoded[channel]
	
	for i in [0 ... pred_order] by 1
		decoded[i] = @stream.get_sbits_long(@currentBPS) # TODO: Read signed bits (long)?
	
	coeff_precision = @stream.get_bits(4) + 1 # TODO: Read unsigned bits
	
	if coeff_precision == 16
		debugger, "invalid coeff precision"
	
	qlevel = @stream.get_sbits(5) # TODO: Read signed bits
	
	if qlevel < 0
		debugger, "Negative qlevel, maybe buggy stream"
	
	coeffs = new Int32Array(32)
	
	for i in [0 ... pred_order] by 1
		coeffs[i] = @stream.get_sbits(coeff_precision) # TODO: Read signed bits (long)?
	
	return -1 if this.decode_residuals(channel, predictor_order) < 0
	
	if @bps > 16
		debugger, "no 64-bit integers in JS, could probably use doubles though"
	else
		for i in [predictor_order ... @blocksize - 1] by 2
			d = decoded[i - pred_order]
			
			s0 = 0, s1 = 0
			
			for j in [predictor_order - 1 ... 0] by -1
				c = coeffs[j]
				s0 += c * d
				decoded[i] += (s0 >> qlevel)
				
				d = decoded[i]
				s1 += c * d
				decoded[i + 1] += (s1 >> qlevel)
			
			c = coeffs[0]
			s0 += c * d
			decoded[i] += (s0 >> qlevel)
				
			d = decoded[i]
			s1 += c * d
			decoded[i + 1] += (s1 >> qlevel)
		
		if @blocksize - predictor_order % 2 == 1
            sum = 0
			
			for j in [0 ... predictor_order] by 1
                sum += coeffs[j] * decoded[i - j - 1]
            decoded[i] += (sum >> qlevel)
		
	return 0
