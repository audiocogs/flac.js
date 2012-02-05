function ff_flac_decode_frame_header(data, fi) {
	/* frame sync code */
	if ((data.read(15) & 0x7FFF) != 0x7FFC) {
		debugger, 'invalid sync code'
		
		return -1
	}
	
	/* variable block size stream code */
	fi.is_var_size = data.read(1)
	
	/* block size and sample rate codes */
	bs_code = data.read(4)
	sr_code = data.read(4)
	
	/* channels and decorrelation */
	fi.ch_mode = data.read(4)
	
	if (fi.ch_mode < FLAC_MAX_CHANNELS) {
		fi.channels = fi.ch_mode + 1
		fi.ch_mode = FLAC_CHMODE_INDEPENDENT
	} else if (fi.ch_mode <= FLAC_CHMODE_MID_SIDE) {
		fi.channels = 2
	} else {
		debugger, 'invalid channel mode: ' + fi.ch_mode
		
		return -1
	}

	/* bits per sample */
	bps_code = data.read(3)
	if (bps_code == 3 || bps_code == 7) {
		debugger, 'invalid sample size code: ' + bps_code
		
		return -1
	}
	
	fi.bps = sample_size_table[bps_code]
	
	/* reserved bit */
	if (get_bits1(gb)) {
		debugger, 'broken stream, invalid padding'
		
		return -1
	}
	fi.frame_or_sample_num = data.readUTF8() // TODO: Understand what this means? null-terminated?
	
	if (fi->frame_or_sample_num < 0) {
		debugger, 'sample/frame number invalid; utf8 fscked'
		
		return -1
	}
	
	/* blocksize */
	if (bs_code == 0) {
		debugger, 'reserved blocksize code: 0'
		
		return -1
	} else if (bs_code == 6) {
		fi.blocksize = data.read(8) + 1
	} else if (bs_code == 7) {
		fi.blocksize = data.read(16) + 1
	} else {
		fi.blocksize = ff_flac_blocksize_table[bs_code]
	}
	
	/* sample rate */
	if (sr_code < 12) {
		fi.samplerate = ff_flac_sample_rate_table[sr_code]
	} else if (sr_code == 12) {
		fi.samplerate = data.read(8) * 1000
	} else if (sr_code == 13) {
		fi.samplerate = data.read(16)
	} else if (sr_code == 14) {
		fi.samplerate = data.read(gb, 16) * 10
	} else {
		debugger, 'illegal sample rate code: ' + sr_code
		
		return -1
	}
	
	/* header CRC-8 check */
	data.advance(8)
	
	/* if (av_crc(av_crc_get_table(AV_CRC_8_ATM), 0, gb->buffer, get_bits_count(gb)/8)) {
	av_log(avctx, AV_LOG_ERROR + log_level_offset,
	"header crc mismatch\n");
	return -1;
	} */
	
	return 0
}
