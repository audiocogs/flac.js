FLACDemuxer = Demuxer.extend(function() {
    Demuxer.register(this)
    
    this.probe = function(buffer) {
        return buffer.peekString(0, 4) === 'fLaC'
    }
    
    const STREAMINFO = 0,
          PADDING = 1,
          APPLICATION = 2,
          SEEKTABLE = 3,
          VORBIS_COMMENT = 4,
          CUESHEET = 5,
          PICTURE = 6,
          INVALID = 127,
          
          STREAMINFO_SIZE = 34;
    
    this.prototype.readChunk = function() {
        var stream = this.stream;
        
        if (!this.readHeader && stream.available(4)) {
            if (stream.readString(4) !== 'fLaC')
                return this.emit('error', 'Invalid FLAC file.')
                
            this.readHeader = true;
        }
        
        while (stream.available(1) && !last) {
            var tmp = stream.readUInt8(),   
                last = tmp & 0x80,
                type = tmp & 0x7F,
                size = stream.readUInt24();
                
            switch (type) {
                case STREAMINFO:
                    if (this.foundStreamInfo)
                        return this.emit('error', 'STREAMINFO can only occur once.')
                        
                    if (size !== STREAMINFO_SIZE)
                        return this.emit('error', 'STREAMINFO size is wrong.')
                        
                    this.foundStreamInfo = true
                    var bitstream = new Bitstream(stream)
                    
                    var cookie = {
                        minBlockSize: bitstream.read(16),
                        maxBlockSize: bitstream.read(16),
                        minFrameSize: bitstream.read(24),
                        maxFrameSize: bitstream.read(24)
                    }
                    
                    this.format = {
                        formatID: 'flac',
                        sampleRate: bitstream.read(20),
                        channelsPerFrame: bitstream.readSmall(3) + 1,
                        bitsPerChannel: bitstream.readSmall(5) + 1
                    }
                    
                    this.emit('format', this.format);
                    this.emit('cookie', cookie);
                    
                    var sampleCount = bitstream.readBig(36);
                    this.emit('duration', sampleCount / this.format.sampleRate * 1000 | 0)
                    
                    stream.advance(16) // skip MD5 hashes
                    break;
                    
                default:
                    if (!this.foundStreamInfo)
                        return this.emit('error', 'STREAMINFO must be the first block')
                    
                    console.log(type, size, last)
                    debugger
            }
        }
    }
    
});