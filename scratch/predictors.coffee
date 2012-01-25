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
