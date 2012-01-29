function avpriv_flac_parse_block_header(block_header, offset) {
    var tmp = block_header[offset]
	
	return {
		last: tmp & 0x80 == 0x80,
		type: tmp & 0x7F,
		size: (block_header[offset + 1] << 16) + (block_header[offset + 2] << 8) + block_header[offset + 3]
	}
}

function get_metadata_size(buffer) {
	var r = { last: false, type: null, size: null }, i = 4
	
	while (!metadata_last) {
		if (buffer.length - i < 4) {
			return 0
		}
		
		r = avpriv_flac_parse_block_header(buffer, i)
		
		i += 4
		
		if (buffer.length - i < r[1]) {
			return 0
		}
		
		i += r.length
	}
	
	return i
}
