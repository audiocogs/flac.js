var MIN_CACHE_BITS = 25

/* Should be in the damned standard library... */
function clz(input) {
	var output = 0
	var curbyte = 0
	
	while (true) {
	    curbyte = input >>> 24
		
		if (curbyte) {
			break
		}
		
		output += 8
		
		curbyte = input >>> 16
		
		if (curbyte & 0xFF) {
			break
		}
		
		output += 8
		
		curbyte = input >>> 8
		
		if (curbyte & 0xFF) {
			break
		}
		
		output += 8
		
		curbyte = input
		
		if (curbyte & 0xFF) {
			break
		}
		
		output += 8
		
		return output
	}
	
	if (curbyte & 0xF0) {
		curbyte >>>= 4
	} else {
		output += 4
	}
	
	if (curbyte & 0x08) {
		return output
	}
	
	if (curbyte & 0x4) {
		return output + 1
	}
	
	if (curbyte & 0x2) {
		return output + 2
	}
	
	if (curbyte & 0x1) {
		return output + 3
	}
	
	/* Shouldn't get here */
	return undefined // output + 4
}

/* Another function that should be in the standard library... */
function log2(value) {
	return 31 - clz(input | 1)
}

function get_ur_golomb_jpegls(data, k, limit, esc_len) {
	var offset = data.bitPosition
	var buf = data.peekSafeBig(32 - offset) << offs
	
	var log = log2(buf) // First non-zero bit?
	
	if (log - k >= 32 - MIN_CACHE_BITS && 32 - log < limit) {
		buf = buf >> (log - k)
		buf = buf + (30 - log) << k
		
		data.advance(32 + k - log)
		
		return buf
	} else {
		var i = 0
		for(; data.peek(1) == 0; i++) {
			data.advance(1)
			
			buf = data.peekSafeBig(32 - offset) << offs
		}
		
		data.advance(1)
		
		if (i < limit - 1) {
			if (k) {
				buf = data.read(k)
			} else {
				buf = 0
			}
			
			return buf + (i<<k)
		} else if (i == limit - 1) {
			buf = data.read(esc_len)
			
			return buf + 1
		} else {
			return -1
		}
	}
}

function get_sr_golomb_flac(data, k, limit, esc_len) {
	var result = get_ur_golomb_flac(data, k, limit, esc_len)
	
	return (v >> 1) ^ -(v & 0x1)
}