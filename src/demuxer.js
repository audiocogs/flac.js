/*
 * FLAC.js - Free Lossless Audio Codec decoder in JavaScript
 * By Devon Govett and Jens Nockert of Official.fm Labs
 *
 * FLAC.js is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2.1 of the License, or (at your option) any later version.
 *
 * FLAC.js is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 * Lesser General Public License for more details.
 *
 */

var AV = require('av');

var FLACDemuxer = AV.Demuxer.extend(function() {
    AV.Demuxer.register(this);
    
    this.probe = function(buffer) {
        return buffer.peekString(0, 4) === 'fLaC';
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
                return this.emit('error', 'Invalid FLAC file.');
                
            this.readHeader = true;
        }
        
        while (stream.available(1) && !this.last) {                     
            if (!this.readBlockHeaders) {
                var tmp = stream.readUInt8();
                this.last = (tmp & 0x80) === 0x80,
                this.type = tmp & 0x7F,
                this.size = stream.readUInt24();
            }
            
            if (!this.foundStreamInfo && this.type !== STREAMINFO)
                return this.emit('error', 'STREAMINFO must be the first block');
                
            if (!stream.available(this.size))
                return;
            
            switch (this.type) {
                case STREAMINFO:
                    if (this.foundStreamInfo)
                        return this.emit('error', 'STREAMINFO can only occur once.');
                    
                    if (this.size !== STREAMINFO_SIZE)
                        return this.emit('error', 'STREAMINFO size is wrong.');
                    
                    this.foundStreamInfo = true;
                    var bitstream = new AV.Bitstream(stream);
                
                    var cookie = {
                        minBlockSize: bitstream.read(16),
                        maxBlockSize: bitstream.read(16),
                        minFrameSize: bitstream.read(24),
                        maxFrameSize: bitstream.read(24)
                    };
                
                    this.format = {
                        formatID: 'flac',
                        sampleRate: bitstream.read(20),
                        channelsPerFrame: bitstream.read(3) + 1,
                        bitsPerChannel: bitstream.read(5) + 1
                    };
                
                    this.emit('format', this.format);
                    this.emit('cookie', cookie);
                
                    var sampleCount = bitstream.read(36);
                    this.emit('duration', sampleCount / this.format.sampleRate * 1000 | 0);
                
                    stream.advance(16); // skip MD5 hashes
                    this.readBlockHeaders = false;
                    break;

                    /*
                    I am only looking at the least significant 32 bits of sample number and offset data
                    This is more than sufficient for the longest flac file I have (~50 mins 2-channel 16-bit 44.1k which uses about 7.5% of the UInt32 space for the largest offset)
                    Can certainly be improved by storing sample numbers and offests as doubles, but would require additional overriding of the searchTimestamp and seek functions (possibly more?)
                    Also the flac faq suggests it would be possible to find frame lengths and thus create seek points on the fly via decoding but I assume this would be slow
                    I may look into these thigns though as my project progresses
                    */
                    case SEEKTABLE:
                        for(var s=0; s<this.size/18; s++)
                        {
                            if(stream.peekUInt32(0) == 0xFFFFFFFF && stream.peekUInt32(1) == 0xFFFFFFFF)
                            {
                                //placeholder, ignore
                                stream.advance(18);
                            } else {
                                if(stream.readUInt32() > 0)
                                {
                                    this.emit('error', 'Seek points with sample number >UInt32 not supported');
                                }
                                var samplenum = stream.readUInt32();
                                if(stream.readUInt32() > 0)
                                {
                                    this.emit('error', 'Seek points with stream offset >UInt32 not supported');
                                }
                                var offset = stream.readUInt32();

                                stream.advance(2);

                                this.addSeekPoint(offset, samplenum);
                            }
                        }
                        break;

                case VORBIS_COMMENT:
                    // see http://www.xiph.org/vorbis/doc/v-comment.html
                    this.metadata || (this.metadata = {});
                    var len = stream.readUInt32(true);
                    
                    this.metadata.vendor = stream.readString(len);
                    var length = stream.readUInt32(true);
                    
                    for (var i = 0; i < length; i++) {
                        len = stream.readUInt32(true);
                        var str = stream.readString(len, 'utf8'),
                            idx = str.indexOf('=');
                            
                        this.metadata[str.slice(0, idx).toLowerCase()] = str.slice(idx + 1);
                    }
                    
                    // TODO: standardize field names across formats
                    break;
                    
                case PICTURE:
                    var type = stream.readUInt32();
                    if (type !== 3) { // make sure this is album art (type 3)
                        stream.advance(this.size - 4);
                    } else {
                        var mimeLen = stream.readUInt32(),
                            mime = stream.readString(mimeLen),
                            descLen = stream.readUInt32(),
                            description = stream.readString(descLen),
                            width = stream.readUInt32(),
                            height = stream.readUInt32(),
                            depth = stream.readUInt32(),
                            colors = stream.readUInt32(),
                            length = stream.readUInt32(),
                            picture = stream.readBuffer(length);
                    
                        this.metadata || (this.metadata = {});
                        this.metadata.coverArt = picture;
                    }
                    
                    // does anyone want the rest of the info?
                    break;
                
                default:
                    stream.advance(this.size);
                    this.readBlockHeaders = false;
            }
            
            if (this.last && this.metadata)
                this.emit('metadata', this.metadata);
        }
        
        while (stream.available(1) && this.last) {
            var buffer = stream.readSingleBuffer(stream.remainingBytes());
            this.emit('data', buffer);
        }
    }
    
});

module.exports = FLACDemuxer;
